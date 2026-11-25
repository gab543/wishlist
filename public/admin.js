const $ = (selector) => document.querySelector(selector);
const loginPanel = $('#login-panel');
const dashboard = $('#dashboard');
const loginForm = $('#login-form');
const settingsForm = $('#settings-form');
const itemDialog = $('#item-dialog');
const itemForm = $('#item-form');
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
let items = [];

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Une erreur est survenue. Réessaie.'); error.debug = data.debug; throw error; }
  return data;
}
function message(text, error = false) { const node = $('#dashboard-message'); node.textContent = text; node.style.color = error ? '#a74f3c' : ''; }
async function showDashboard() {
  loginPanel.classList.add('hidden'); dashboard.classList.remove('hidden');
  const data = await api('/api/admin/wishlist');
  $('#wishlist-title').value = data.title; $('#wishlist-description').value = data.description;
  items = data.items; renderAdminItems();
}
function renderAdminItems() {
  const list = $('#admin-items'); list.replaceChildren();
  $('#item-count').textContent = String(items.length);
  $('#admin-empty').classList.toggle('hidden', items.length > 0);
  for (const item of items) {
    const row = document.createElement('article'); row.className = 'admin-item';
    if (item.imageUrl) { const image = document.createElement('img'); image.className = 'admin-thumb'; image.src = item.imageUrl; image.alt = ''; image.width = 57; image.height = 57; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; row.append(image); }
    else { const thumb = document.createElement('span'); thumb.className = 'admin-thumb admin-thumb-placeholder'; thumb.setAttribute('aria-hidden', 'true'); thumb.textContent = 'h.'; row.append(thumb); }
    const copy = document.createElement('div'); copy.className = 'admin-item-copy'; const title = document.createElement('h3'); title.textContent = item.name; copy.append(title);
    const prices = [];
    if (item.price != null) prices.push(`À l’unité ${euro.format(item.price)}`);
    for (const variant of item.variants || []) prices.push(`${variant.label} ${euro.format(variant.price)}`);
    const details = [item.category, ...prices].filter(Boolean).join(' · ');
    const info = document.createElement('p'); info.textContent = details || item.description || 'Article sans détail'; copy.append(info); row.append(copy);
    const actions = document.createElement('div'); actions.className = 'admin-item-actions';
    const edit = document.createElement('button'); edit.className = 'small-action'; edit.type = 'button'; edit.textContent = 'Modifier'; edit.addEventListener('click', () => openItem(item));
    const remove = document.createElement('button'); remove.className = 'small-action delete'; remove.type = 'button'; remove.textContent = 'Supprimer'; remove.addEventListener('click', async () => {
      if (!window.confirm(`Supprimer « ${item.name} » ?`)) return;
      try { await api(`/api/admin/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); items = items.filter((entry) => entry.id !== item.id); renderAdminItems(); message('Article supprimé.'); }
      catch (error) { message(error.message, true); }
    });
    actions.append(edit, remove); row.append(actions); list.append(row);
  }
}
function openItem(item = null) {
  itemForm.reset(); $('#item-error').textContent = '';
  $('#variant-list').replaceChildren();
  $('#import-message').textContent = 'Les informations trouvées resteront modifiables avant l’enregistrement.';
  $('#import-message').classList.remove('import-error');
  $('#dialog-title').textContent = item ? 'Modifier une envie' : 'Ajouter une envie';
  for (const key of ['id', 'name', 'description', 'category', 'price', 'imageUrl', 'shopUrl']) itemForm.elements[key].value = item?.[key] ?? '';
  for (const variant of item?.variants || []) addVariantRow(variant);
  $('#import-url').value = item?.shopUrl ?? '';
  itemDialog.showModal(); $('#item-name').focus();
}
function addVariantRow(variant = {}) {
  const row = document.createElement('div'); row.className = 'variant-row';
  const labelField = document.createElement('label'); labelField.textContent = 'Format';
  const labelInput = document.createElement('input'); labelInput.className = 'variant-label'; labelInput.type = 'text'; labelInput.maxLength = 80; labelInput.required = true; labelInput.placeholder = 'Lot de 3'; labelInput.value = variant.label || '';
  labelField.append(labelInput);
  const priceField = document.createElement('label'); priceField.textContent = 'Prix (€)';
  const priceInput = document.createElement('input'); priceInput.className = 'variant-price'; priceInput.type = 'number'; priceInput.min = '0'; priceInput.max = '1000000'; priceInput.step = '0.01'; priceInput.inputMode = 'decimal'; priceInput.required = true; priceInput.placeholder = '18'; priceInput.value = variant.price ?? '';
  priceField.append(priceInput);
  const remove = document.createElement('button'); remove.className = 'variant-remove small-action delete'; remove.type = 'button'; remove.textContent = 'Supprimer'; remove.setAttribute('aria-label', 'Supprimer cette variante'); remove.addEventListener('click', () => row.remove());
  row.append(labelField, priceField, remove); $('#variant-list').append(row);
}
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); $('#login-error').textContent = '';
  const button = loginForm.querySelector('button'); button.disabled = true;
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: new FormData(loginForm).get('password') }) }); await showDashboard(); }
  catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
});
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await api('/api/admin/wishlist', { method: 'PUT', body: JSON.stringify({ title: settingsForm.elements.title.value, description: settingsForm.elements.description.value }) }); message('Les informations de la liste sont enregistrées.'); }
  catch (error) { message(error.message, true); }
});
$('#add-item').addEventListener('click', () => openItem());
$('#add-variant').addEventListener('click', () => {
  if ($('#variant-list').children.length >= 8) { $('#item-error').textContent = 'Un article peut avoir jusqu’à 8 variantes.'; return; }
  $('#item-error').textContent = ''; addVariantRow();
});
$('#import-product').addEventListener('click', async () => {
  const input = $('#import-url'); const note = $('#import-message'); const button = $('#import-product');
  note.textContent = ''; note.classList.remove('import-error');
  if (!input.value) { note.textContent = 'Collez d’abord un lien de boutique.'; note.classList.add('import-error'); input.focus(); return; }
  button.disabled = true; button.textContent = 'Lecture…';
  try {
    const data = await api('/api/admin/preview', { method: 'POST', body: JSON.stringify({ url: input.value }) });
    const filled = [];
    if (data.title) { itemForm.elements.name.value = data.title; filled.push('nom'); }
    if (data.description) { itemForm.elements.description.value = data.description; filled.push('description'); }
    if (data.imageUrl) { itemForm.elements.imageUrl.value = data.imageUrl; filled.push('image'); }
    if (data.price != null) { itemForm.elements.price.value = data.price; filled.push('prix'); }
    if (data.shopUrl) { itemForm.elements.shopUrl.value = data.shopUrl; input.value = data.shopUrl; }
    note.textContent = filled.length ? `Informations récupérées (${filled.join(', ')}). Vérifiez-les avant d’enregistrer.` : 'Lien ajouté. Complétez les informations manuellement.';
  } catch (error) {
    note.textContent = error.debug ? `${error.message}\nDétail technique (temporaire) : ${error.debug}` : error.message;
    note.classList.add('import-error');
  }
  finally { button.disabled = false; button.textContent = 'Récupérer'; }
});
itemForm.addEventListener('submit', async (event) => {
  event.preventDefault(); $('#item-error').textContent = '';
  const values = Object.fromEntries(new FormData(itemForm));
  const id = values.id; delete values.id;
  values.variants = [...$('#variant-list').querySelectorAll('.variant-row')].map((row) => ({ label: row.querySelector('.variant-label').value, price: row.querySelector('.variant-price').value }));
  try {
    const saved = await api(id ? `/api/admin/items/${encodeURIComponent(id)}` : '/api/admin/items', { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) });
    if (id) items = items.map((item) => item.id === id ? { ...values, id } : item); else items.push(saved);
    renderAdminItems(); itemDialog.close(); message(id ? 'Article modifié.' : 'Article ajouté.');
  } catch (error) { $('#item-error').textContent = error.message; }
});
$('#close-dialog').addEventListener('click', () => itemDialog.close());
$('#cancel-dialog').addEventListener('click', () => itemDialog.close());
itemDialog.addEventListener('click', (event) => { if (event.target === itemDialog) itemDialog.close(); });
$('#logout-button').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); dashboard.classList.add('hidden'); loginPanel.classList.remove('hidden'); loginForm.reset(); });
$('#rotate-code').addEventListener('click', async () => {
  if (!window.confirm('Créer un nouveau code ? L’ancien ne fonctionnera plus.')) return;
  try { const result = await api('/api/admin/share-code', { method: 'POST', body: '{}' }); $('#new-code').textContent = result.code; $('#new-code-panel').classList.remove('hidden'); message('Nouveau code créé. Copiez-le maintenant.'); }
  catch (error) { message(error.message, true); }
});
$('#copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#new-code').textContent); $('#copy-code').textContent = 'Copié'; setTimeout(() => { $('#copy-code').textContent = 'Copier'; }, 1500); }
  catch { message('La copie automatique est indisponible. Sélectionnez le code pour le copier.', true); }
});
(async () => {
  try { const status = await api('/api/status'); if (!status.configured) { loginPanel.insertAdjacentHTML('beforeend', '<p class="admin-config">Pour démarrer, configurez <code>ADMIN_PASSWORD</code>, <code>SESSION_SECRET</code>, <code>SUPABASE_URL</code> et <code>SUPABASE_SECRET_KEY</code> dans <code>.env</code>. Exécutez aussi le fichier <code>supabase/schema.sql</code> dans le SQL Editor de Supabase.</p>'); return; } const session = await api('/api/admin/session'); if (session.authenticated) await showDashboard(); }
  catch (error) { $('#login-error').textContent = error.message; }
})();
