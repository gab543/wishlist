const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
// Charge .env sans dépendance externe et sans écraser les variables déjà définies par l’hôte.
try {
  const envFile = fsSync.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    process.env[match[1]] = value;
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'wishlist.json');
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PRODUCT_HTML_BYTES = 4_000_000;
const attempts = new Map();

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function sign(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(24), (byte) => alphabet[byte & 31]).join('');
}
function cookie(req, key) {
  const raw = req.headers.cookie || '';
  const item = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${key}=`));
  return item ? decodeURIComponent(item.slice(key.length + 1)) : '';
}
function hasSession(req) {
  const value = cookie(req, 'herbier_session');
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now();
  } catch { return false; }
}
function accessGrant(req) {
  const value = cookie(req, 'herbier_access');
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null;
  try {
    const grant = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return grant.exp > Date.now() ? grant : null;
  } catch { return null; }
}
function send(res, status, body, headers = {}) {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ...headers });
  res.end(content);
}
function json(req, res, status, data, headers) { send(res, status, data, headers); }
function looksLikeHtml(buffer) {
  return /^\uFEFF?\s*(?:<!doctype\s+html\b|<html\b|<head\b|<!--)/i.test(buffer.subarray(0, 1024).toString('utf8'));
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32_000) throw new Error('Requête trop volumineuse.');
  }
  return body ? JSON.parse(body) : {};
}
function isConfigured() {
  return ADMIN_PASSWORD.length >= 16 && SESSION_SECRET.length >= 32 && Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}
async function supabaseRequest(endpoint, { method = 'GET', body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('Supabase is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  const headers = { apikey: SUPABASE_SECRET_KEY, Accept: 'application/json' };
  // New sb_secret keys are API keys, not JWTs; legacy service_role keys still need a bearer header.
  if (!SUPABASE_SECRET_KEY.startsWith('sb_secret_')) headers.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let result = null;
  if (text) { try { result = JSON.parse(text); } catch { result = text; } }
  if (!response.ok) {
    const error = new Error(`Supabase HTTP ${response.status}${result?.code ? ` (${result.code})` : ''}: ${result?.message || result?.hint || response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return result;
}
async function getStoredStore() {
  const rows = await supabaseRequest('wishlist_state?select=state&id=eq.1&limit=1');
  if (!Array.isArray(rows)) throw new Error('Supabase returned an unexpected wishlist_state response.');
  return rows[0]?.state || null;
}
function createInitialStore() {
  return { title: 'Les belles choses', description: 'Une sélection de choses qui me feraient plaisir.', shareCodeHash: hash(makeCode()), items: [] };
}
async function readStore() {
  const existing = await getStoredStore();
  if (existing) return existing;
  const initial = createInitialStore();
  try {
    await supabaseRequest('wishlist_state', { method: 'POST', body: { id: 1, state: initial, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
    return initial;
  } catch (error) {
    if (error.status !== 409) throw error;
    const concurrent = await getStoredStore();
    if (concurrent) return concurrent;
    throw error;
  }
}
async function writeStore(store) {
  await supabaseRequest('wishlist_state?on_conflict=id', {
    method: 'POST', body: { id: 1, state: store, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}
async function migrateLegacyStore() {
  let legacy;
  try { legacy = JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { migrated: false, reason: 'Aucun fichier data/wishlist.json trouvé.' };
    throw error;
  }
  const existing = await getStoredStore();
  if (existing) return { migrated: false, reason: 'La base contient déjà une wishlist ; aucune donnée n’a été écrasée.' };
  await supabaseRequest('wishlist_state', { method: 'POST', body: { id: 1, state: legacy, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
  return { migrated: true, items: Array.isArray(legacy.items) ? legacy.items.length : 0 };
}
function validText(value, max, required = false) {
  return typeof value === 'string' && value.trim().length <= max && (!required || value.trim().length > 0);
}
function validPrice(value, required = false) {
  if (!required && (value === '' || value === null || value === undefined)) return true;
  return (typeof value === 'string' || typeof value === 'number') && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1_000_000;
}
function validItem(input) {
  if (!input || !validText(input.name, 120, true) || !validText(input.description || '', 1000) || !validText(input.category || '', 60) || !validText(input.imageUrl || '', 2000) || !validText(input.shopUrl || '', 2000)) return false;
  for (const value of [input.imageUrl, input.shopUrl]) {
    if (!value) continue;
    try { if (new URL(value).protocol !== 'https:') return false; } catch { return false; }
  }
  const variants = input.variants === undefined ? [] : input.variants;
  if (!Array.isArray(variants) || variants.length > 8 || !validPrice(input.price)) return false;
  return variants.every((variant) => variant && validText(variant.label, 80, true) && validPrice(variant.price, true));
}
function normalizeItem(input, id = crypto.randomUUID()) {
  return { id, name: input.name.trim(), description: (input.description || '').trim(), imageUrl: (input.imageUrl || '').trim(), price: input.price === '' || input.price == null ? null : Number(input.price), variants: (input.variants || []).map((variant) => ({ label: variant.label.trim(), price: Number(variant.price) })), category: (input.category || '').trim(), shopUrl: (input.shopUrl || '').trim() };
}
function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168) ) || (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) || (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7));
  // N’autorise que l’espace global unicast IPv6 (2000::/3), hors blocs spéciaux connus.
  return /^[23]/.test(normalized) && !normalized.startsWith('2001:db8:') && !normalized.startsWith('2001:0000:') && !normalized.startsWith('2001:0:');
}
function decodeHtml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|euro);/gi, (entity, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', euro: '€' })[code.toLowerCase()];
  });
}
function readAmazonPrice(html, pageUrl) {
  const host = new URL(pageUrl).hostname.toLowerCase();
  if (!/(^|\.)amazon\.(?:fr|de|es|it|nl|be|se|pl|ie|lu)$/.test(host)) return null;
  function classValue(name) {
    const tags = html.match(/<span\b[^>]*>/gi) || [];
    const opening = tags.find((tag) => tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/).includes(name));
    if (!opening) return '';
    const start = html.indexOf(opening) + opening.length;
    const closing = html.indexOf('</span>', start);
    return closing < 0 ? '' : decodeHtml(html.slice(start, closing).replace(/<[^>]*>/g, '').trim());
  }
  const wholeText = classValue('a-price-whole');
  if (!wholeText) return null;
  const decimalText = classValue('a-price-decimal');
  const fractionText = classValue('a-price-fraction').replace(/\D/g, '');
  const symbolText = classValue('a-price-symbol');
  const euroMarket = /(^|\.)amazon\.(?:fr|de|es|it|nl|be|ie|lu)$/.test(host);
  if (symbolText && !symbolText.includes('€')) return null;
  if (!symbolText && !euroMarket) return null;
  const whole = wholeText.replace(/\D/g, '');
  if (!whole || (decimalText && !fractionText)) return null;
  const fraction = fractionText ? fractionText.slice(0, 2).padEnd(2, '0') : '';
  const amount = Number(fraction ? `${whole}.${fraction}` : whole);
  return Number.isFinite(amount) && amount <= 1_000_000 ? amount : null;
}
function readAmazonImage(html, pageUrl) {
  const host = new URL(pageUrl).hostname.toLowerCase();
  if (!/(^|\.)amazon\.(?:fr|de|es|it|nl|be|se|pl|ie|lu)$/.test(host)) return '';
  const tag = html.match(/<img\b(?=[^>]*\bid\s*=\s*["']landingImage["'])[^>]*>/i)?.[0];
  if (!tag) return '';
  function attribute(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
  }
  const highResolution = attribute('data-old-hires');
  if (highResolution) return highResolution;
  try {
    const images = JSON.parse(attribute('data-a-dynamic-image'));
    const best = Object.entries(images).sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]))[0]?.[0];
    if (best) return best;
  } catch { /* L’image src standard reste une solution de repli. */ }
  return attribute('src');
}
function extractProductMetadata(html, pageUrl) {
  const metadata = {};
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content && metadata[key] === undefined) metadata[key] = decodeHtml(attrs.content.trim());
  }
  const productScripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const structured = [];
  for (const script of productScripts) {
    try {
      const parsed = JSON.parse(decodeHtml(script[1].trim()));
      const pending = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (pending.length && structured.length < 200) {
        const item = pending.shift();
        if (!item || typeof item !== 'object') continue;
        structured.push(item);
        if (Array.isArray(item['@graph'])) pending.push(...item['@graph']);
        if (Array.isArray(item)) pending.push(...item);
      }
    } catch { /* Une autre source de métadonnées peut tout de même être disponible. */ }
  }
  const product = structured.find((entry) => (Array.isArray(entry['@type']) ? entry['@type'] : [entry['@type']]).some((type) => typeof type === 'string' && type.toLowerCase() === 'product'));
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const image = Array.isArray(product?.image) ? product.image[0] : (typeof product?.image === 'object' ? product.image.url : product?.image);
  let title = metadata['og:title'] || metadata['twitter:title'] || product?.name || '';
  if (!title) title = decodeHtml((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const description = metadata['og:description'] || metadata['description'] || metadata['twitter:description'] || product?.description || '';
  let imageUrl = readAmazonImage(html, pageUrl) || metadata['og:image'] || metadata['og:image:secure_url'] || metadata['twitter:image'] || image || '';
  try { imageUrl = imageUrl ? new URL(imageUrl, pageUrl).href : ''; } catch { imageUrl = ''; }
  if (imageUrl && new URL(imageUrl).protocol !== 'https:') imageUrl = '';
  const amazonPrice = readAmazonPrice(html, pageUrl);
  const rawPrice = amazonPrice != null ? amazonPrice : metadata['product:price:amount'] || metadata['og:price:amount'] || offer?.price || offer?.lowPrice || offer?.priceSpecification?.price;
  const currency = (amazonPrice != null ? 'EUR' : metadata['product:price:currency'] || metadata['og:price:currency'] || offer?.priceCurrency || offer?.priceSpecification?.priceCurrency || '').toUpperCase();
  const parsedPrice = rawPrice == null ? null : Number(String(rawPrice).replace(',', '.'));
  const price = (!currency || currency === 'EUR') && Number.isFinite(parsedPrice) && parsedPrice >= 0 && parsedPrice <= 1_000_000 ? parsedPrice : null;
  return { title: String(title).replace(/\s+/g, ' ').trim().slice(0, 120), description: String(description).replace(/\s+/g, ' ').trim().slice(0, 1000), imageUrl: imageUrl.slice(0, 2000), price };
}
async function resolvePublicHost(hostname) {
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literal)) {
    if (!isPublicAddress(literal)) throw new Error('host_not_public');
    return [{ address: literal, family: net.isIP(literal) }];
  }
  if (literal === 'localhost' || literal.endsWith('.localhost') || literal.endsWith('.local') || literal.endsWith('.internal')) throw new Error('host_not_public');
  let timeoutId;
  let addresses;
  try {
    addresses = await Promise.race([
      dns.lookup(literal, { all: true, verbatim: true }),
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('dns_timeout')), 5000); }),
    ]);
  } finally { clearTimeout(timeoutId); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('host_not_public');
  return addresses;
}
function requestPage(url, addresses) {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const request = https.request({
      protocol: 'https:', hostname, port: 443, path: `${url.pathname}${url.search}`, method: 'GET',
      servername: net.isIP(hostname) ? undefined : hostname,
      headers: { 'User-Agent': 'HerbierWishlist/1.0 (+product metadata preview)', Accept: 'text/html,application/xhtml+xml;q=0.9', 'Accept-Encoding': 'identity' },
      lookup: (_host, options, callback) => {
        if (options?.all) callback(null, addresses);
        else {
          const selected = addresses.find((entry) => entry.family === options?.family) || addresses[0];
          callback(null, selected.address, selected.family);
        }
      },
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        resolve({ redirect: location || '' });
        return;
      }
      const contentType = response.headers['content-type'] || '';
      if (status < 200 || status >= 300 || (contentType && !/^text\/(html|xhtml\+xml)\b/i.test(contentType))) {
        const contentType = response.headers['content-type'] || '(missing content-type)';
        response.resume(); reject(new Error(`HTTPS response ${status}; content-type: ${contentType}`)); return;
      }
      const chunks = []; let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_PRODUCT_HTML_BYTES) { response.destroy(new Error(`page_too_large: exceeded ${MAX_PRODUCT_HTML_BYTES} bytes`)); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const html = Buffer.concat(chunks);
        if (!contentType && !looksLikeHtml(html)) { reject(new Error('HTTPS response has no Content-Type and body is not recognizable as HTML.')); return; }
        resolve({ html: html.toString('utf8') });
      });
      response.on('error', reject);
    });
    request.setTimeout(8000, () => request.destroy(new Error('page_timeout')));
    request.on('error', reject);
    request.end();
  });
}
function requestPageWithCurl(url, addresses) {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const address = addresses.find((entry) => entry.family === 4) || addresses[0];
    const pinnedAddress = address.family === 6 ? `[${address.address}]` : address.address;
    const resolveEntry = `${host}:443:${pinnedAddress}`;
    const args = [
      '--disable', '--silent', '--show-error', '--globoff', '--noproxy', '*',
      '--proto', '=https', '--connect-timeout', '5', '--max-time', '10',
      '--max-filesize', String(MAX_PRODUCT_HTML_BYTES), '--include', '--resolve', resolveEntry,
      '--url', url.href,
    ];
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; const stderrChunks = []; let size = 0; let stderrSize = 0; let settled = false;
    const fail = (error) => { if (settled) return; settled = true; reject(error); };
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_PRODUCT_HTML_BYTES + 100_000) { child.kill(); fail(new Error(`curl response exceeded ${MAX_PRODUCT_HTML_BYTES} bytes`)); return; }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (stderrSize >= 4000) return;
      const kept = chunk.subarray(0, 4000 - stderrSize); stderrChunks.push(kept); stderrSize += kept.length;
    });
    child.on('error', (error) => fail(new Error(`curl spawn error: ${error.message}`)));
    child.on('close', (code, signal) => {
      if (settled) return;
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      if (code !== 0) { fail(new Error(`curl exit code ${code ?? 'null'}${signal ? ` (signal ${signal})` : ''}${stderr ? `: ${stderr}` : ''}`)); return; }
      const output = Buffer.concat(chunks);
      let cursor = 0; let status = 0; let headers = {};
      while (cursor < output.length) {
        const end = output.indexOf('\r\n\r\n', cursor);
        if (end < 0) break;
        const block = output.subarray(cursor, end).toString('latin1');
        const statusLine = block.match(/^HTTP\/\S+\s+(\d+)/i);
        if (!statusLine) break;
        status = Number(statusLine[1]); headers = {};
        for (const line of block.split('\r\n').slice(1)) {
          const separator = line.indexOf(':');
          if (separator > 0) headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
        }
        cursor = end + 4;
        if (status >= 200) break;
      }
      if (!status) { fail(new Error('page_unavailable')); return; }
      if ([301, 302, 303, 307, 308].includes(status)) { resolve({ redirect: headers.location || '' }); return; }
      const contentType = headers['content-type'] || '';
      const body = output.subarray(cursor);
      if (status < 200 || status >= 300 || (contentType && !/^text\/(html|xhtml\+xml)\b/i.test(contentType))) { fail(new Error(`curl received HTTP ${status}; content-type: ${contentType || '(missing content-type)'}`)); return; }
      if (!contentType && !looksLikeHtml(body)) { fail(new Error(`curl received HTTP ${status} without Content-Type; response body is not recognizable as HTML`)); return; }
      resolve({ html: body.toString('utf8') });
    });
    const timeout = setTimeout(() => { child.kill(); fail(new Error('page_timeout')); }, 11_000);
    child.once('close', () => clearTimeout(timeout));
  });
}
function isAmazonRetailHost(hostname) { return /(^|\.)amazon\.(?:fr|de|es|it|nl|be|se|pl|ie|lu)$/.test(hostname.toLowerCase()); }
async function fetchProductMetadata(rawUrl, redirects = 0) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) throw new Error('invalid_url');
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('invalid_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('invalid_url');
  const addresses = await resolvePublicHost(url.hostname);
  let result;
  try { result = isAmazonRetailHost(url.hostname) ? await requestPageWithCurl(url, addresses) : await requestPage(url, addresses); }
  catch (error) {
    if (!isAmazonRetailHost(url.hostname)) throw error;
    try { result = await requestPage(url, addresses); }
    catch (fallbackError) { throw new Error(`${error.message}; Node HTTPS fallback: ${fallbackError.message}`); }
  }
  if (result.redirect) {
    if (redirects >= 3) throw new Error('too_many_redirects');
    return fetchProductMetadata(new URL(result.redirect, url).href, redirects + 1);
  }
  if (/(^|\b)(robot check|validatecaptcha|automated access to amazon data)(\b|$)/i.test(result.html)) throw new Error('Amazon returned an anti-bot or CAPTCHA page (HTTP 200).');
  const data = extractProductMetadata(result.html, url.href);
  if (!data.title && !data.description && !data.imageUrl && data.price === null) throw new Error('metadata_missing');
  return { ...data, shopUrl: url.href };
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/status') return json(req, res, 200, { configured: isConfigured() });
  if (url.pathname.startsWith('/api/')) {
    if (!isConfigured()) return json(req, res, 503, { error: 'Configure le mot de passe admin, la clé de session et les identifiants Supabase.' });
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const ip = req.socket.remoteAddress || 'local';
      const entry = attempts.get(ip) || { count: 0, until: 0 };
      if (entry.until > Date.now()) return json(req, res, 429, { error: 'Trop de tentatives. Réessaie dans quelques minutes.' });
      const body = await readBody(req).catch(() => ({}));
      if (!safeEqual(body.password || '', ADMIN_PASSWORD)) {
        entry.count += 1;
        if (entry.count >= 6) { entry.until = Date.now() + 10 * 60 * 1000; entry.count = 0; }
        attempts.set(ip, entry);
        return json(req, res, 401, { error: 'Mot de passe incorrect.' });
      }
      attempts.delete(ip);
      const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString('base64url');
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return json(req, res, 200, { ok: true }, { 'Set-Cookie': `herbier_session=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}` });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') return json(req, res, 200, { ok: true }, { 'Set-Cookie': 'herbier_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return json(req, res, 403, { error: 'Requête refusée.' });
    }
    if (url.pathname === '/api/access' && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      const ip = req.socket.remoteAddress || 'local';
      const entry = attempts.get(`share:${ip}`) || { count: 0, until: 0 };
      if (entry.until > Date.now()) return json(req, res, 429, { error: 'Trop d’essais. Réessaie dans quelques minutes.' });
      const store = await readStore();
      const supplied = typeof body.code === 'string' ? hash(body.code.trim().toUpperCase()) : hash('invalid');
      if (!safeEqual(supplied, store.shareCodeHash)) {
        entry.count += 1;
        if (entry.count >= 8) { entry.until = Date.now() + 10 * 60 * 1000; entry.count = 0; }
        attempts.set(`share:${ip}`, entry);
        return json(req, res, 401, { error: 'Ce code ne donne pas accès à la liste. Vérifie-le et réessaie.' });
      }
      attempts.delete(`share:${ip}`);
      const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS, codeHash: store.shareCodeHash })).toString('base64url');
      return json(req, res, 200, { access: true }, { 'Set-Cookie': `herbier_access=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` });
    }
    if (url.pathname === '/api/wishlist' && req.method === 'GET') {
      const store = await readStore();
      const grant = accessGrant(req);
      if (!grant || !safeEqual(grant.codeHash || '', store.shareCodeHash)) return json(req, res, 401, { error: 'Accès requis.' });
      return json(req, res, 200, { title: store.title, description: store.description, items: store.items });
    }
    if (url.pathname === '/api/admin/session' && req.method === 'GET') return json(req, res, 200, { authenticated: hasSession(req) });
    if (!hasSession(req)) return json(req, res, 401, { error: 'Connecte-toi pour accéder à cette page.' });
    if (url.pathname === '/api/admin/preview' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'local';
      const key = `preview:${ip}`;
      const entry = attempts.get(key) || { count: 0, until: 0 };
      if (entry.until > Date.now()) return json(req, res, 429, { error: 'Trop de demandes. Réessaie dans quelques minutes.' });
      let body;
      try { body = await readBody(req); }
      catch { return json(req, res, 400, { error: 'Le lien fourni est invalide.' }); }
      try {
        const metadata = await fetchProductMetadata(body.url);
        attempts.delete(key);
        return json(req, res, 200, metadata);
      } catch (error) {
        entry.count += 1;
        if (entry.count >= 8) { entry.until = Date.now() + 10 * 60 * 1000; entry.count = 0; }
        attempts.set(key, entry);
        const debug = String(error.message || error).slice(0, 4000);
        if (error.message === 'invalid_url' || error.message === 'host_not_public') return json(req, res, 400, { error: 'Utilise un lien HTTPS public, sans identifiant ni port personnalisé.', debug });
        if (error.message === 'metadata_missing') return json(req, res, 422, { error: 'Aucune information produit détectée. Tu peux compléter les champs manuellement.', debug });
        return json(req, res, 422, { error: 'Cette page ne peut pas être lue automatiquement. Tu peux compléter les champs manuellement.', debug });
      }
    }
    const store = await readStore();
    if (url.pathname === '/api/admin/wishlist' && req.method === 'GET') return json(req, res, 200, { title: store.title, description: store.description, items: store.items });
    if (url.pathname === '/api/admin/wishlist' && req.method === 'PUT') {
      const body = await readBody(req);
      if (!validText(body.title, 120, true) || !validText(body.description, 1000)) return json(req, res, 400, { error: 'Le titre ou la description est trop long ou manquant.' });
      store.title = body.title.trim(); store.description = body.description.trim();
      await writeStore(store);
      return json(req, res, 200, { ok: true });
    }
    if (url.pathname === '/api/admin/items' && req.method === 'POST') {
      const body = await readBody(req);
      if (!validItem(body)) return json(req, res, 400, { error: 'Vérifie les champs. Les liens d’image et de boutique doivent utiliser HTTPS.' });
      const item = normalizeItem(body); store.items.push(item); await writeStore(store);
      return json(req, res, 201, item);
    }
    const itemRoute = url.pathname.match(/^\/api\/admin\/items\/([\w-]+)$/);
    if (itemRoute && (req.method === 'PUT' || req.method === 'DELETE')) {
      const index = store.items.findIndex((item) => item.id === itemRoute[1]);
      if (index < 0) return json(req, res, 404, { error: 'Article introuvable.' });
      if (req.method === 'DELETE') store.items.splice(index, 1);
      else {
        const body = await readBody(req);
        if (!validItem(body)) return json(req, res, 400, { error: 'Vérifie les champs. Les liens d’image et de boutique doivent utiliser HTTPS.' });
        store.items[index] = normalizeItem(body, itemRoute[1]);
      }
      await writeStore(store);
      return json(req, res, 200, { ok: true });
    }
    if (url.pathname === '/api/admin/share-code' && req.method === 'POST') {
      const code = makeCode(); store.shareCodeHash = hash(code); await writeStore(store);
      return json(req, res, 200, { code });
    }
    return json(req, res, 404, { error: 'Page introuvable.' });
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' ? 'admin.html' : url.pathname.slice(1);
  const resolved = path.resolve(ROOT, 'public', requested);
  if (!resolved.startsWith(path.resolve(ROOT, 'public') + path.sep)) return send(res, 404, 'Introuvable');
  try {
    const content = await fs.readFile(resolved);
    res.writeHead(200, { 'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    res.end(content);
  } catch { send(res, 404, 'Introuvable'); }
}

function requestHandler(req, res) {
  return handle(req, res).catch((error) => {
    console.error('Erreur serveur:', error.message);
    if (!res.headersSent) send(res, 500, { error: 'Une erreur est survenue. Réessaie dans un instant.' });
    else res.end();
  });
}

function createHttpServer() {
  return http.createServer(requestHandler);
}

if (require.main === module) createHttpServer().listen(PORT, () => console.log(`Herbier est prêt sur http://localhost:${PORT}`));

module.exports = Object.assign(requestHandler, { handle, createHttpServer, hash, validItem, normalizeItem, isPublicAddress, readAmazonPrice, readAmazonImage, extractProductMetadata, fetchProductMetadata, supabaseRequest, readStore, writeStore, migrateLegacyStore });
