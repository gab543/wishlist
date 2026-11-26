const accessForm = document.querySelector('#access-form');
const accessError = document.querySelector('#access-error');
const gateView = document.querySelector('#gate-view');
const wishlistView = document.querySelector('#wishlist-view');
const grid = document.querySelector('#items-grid');
const emptyState = document.querySelector('#empty-state');
const codeStep = document.querySelector('#code-step');
const shareCodeInput = document.querySelector('#share-code');
const memberStep = document.querySelector('#member-step');
const memberName = document.querySelector('#member-name');
const memberPassword = document.querySelector('#member-password');
const memberGreeting = document.querySelector('#member-greeting');
const memberNameLabel = document.querySelector('#member-name-label');
const memberPasswordLabel = document.querySelector('#member-password-label');
const memberSubmit = document.querySelector('#member-submit');
const memberNote = document.querySelector('#member-note');
memberName.required = false;
memberPassword.required = false;
shareCodeInput.required = false;
let memberMode = 'login';
let rememberedName = '';
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Une erreur est survenue. Réessaie.');
  return data;
}
function renderItems(items) {
  grid.replaceChildren();
  emptyState.classList.toggle('hidden', items.length !== 0);
  grid.classList.toggle('hidden', items.length === 0);
  for (const [index, item] of items.entries()) {
    const card = document.createElement('article'); card.className = 'wish-card'; card.style.animationDelay = `${Math.min(index * 55, 330)}ms`;
    if (item.imageUrl) {
      const image = document.createElement('img'); image.className = 'wish-image'; image.src = item.imageUrl; image.alt = item.name; image.width = 600; image.height = 535; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { const fallback = document.createElement('div'); fallback.className = 'wish-image wish-placeholder'; fallback.setAttribute('aria-hidden', 'true'); fallback.textContent = 'h.'; image.replaceWith(fallback); }, { once: true });
      card.append(image);
    } else {
      const placeholder = document.createElement('div'); placeholder.className = 'wish-image wish-placeholder'; placeholder.setAttribute('aria-hidden', 'true'); placeholder.textContent = 'h.'; card.append(placeholder);
    }
    if (item.category) { const category = document.createElement('p'); category.className = 'wish-category'; category.textContent = item.category; card.append(category); }
    const title = document.createElement('h2'); title.textContent = item.name; card.append(title);
    if (item.description) { const description = document.createElement('p'); description.className = 'wish-description'; description.textContent = item.description; card.append(description); }
    const bottom = document.createElement('div'); bottom.className = 'wish-card-bottom';
    const variants = Array.isArray(item.variants) ? item.variants : [];
    if (variants.length) {
      const options = document.createElement('ul'); options.className = 'wish-options';
      if (item.price != null) addPriceOption(options, 'À l’unité', item.price);
      for (const variant of variants) addPriceOption(options, variant.label, variant.price);
      card.append(options);
    } else if (item.price != null) { const price = document.createElement('span'); price.className = 'wish-price'; price.textContent = euro.format(item.price); bottom.append(price); }
    if (item.shopUrl) { const link = document.createElement('a'); link.className = 'shop-link'; link.href = item.shopUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Voir la boutique ↗'; bottom.append(link); }
    if (bottom.childNodes.length) card.append(bottom);
    grid.append(card);
  }
}
function addPriceOption(list, labelText, priceValue) {
  const row = document.createElement('li'); row.className = 'wish-option';
  const label = document.createElement('span'); label.className = 'wish-option-label'; label.textContent = labelText;
  const price = document.createElement('span'); price.className = 'wish-option-price'; price.textContent = euro.format(priceValue);
  row.append(label, price); list.append(row);
}
function showCodeStep() {
  codeStep.classList.remove('hidden'); memberStep.classList.add('hidden');
  shareCodeInput.required = true; memberName.required = false; memberPassword.required = false;
  memberPassword.value = ''; accessError.textContent = '';
  document.querySelector('#share-code').focus();
}
function showMemberStep(mode, name = '') {
  memberMode = mode; codeStep.classList.add('hidden'); memberStep.classList.remove('hidden');
  shareCodeInput.required = false;
  const registering = mode === 'register';
  if (!registering && name) rememberedName = name;
  memberName.classList.remove('hidden');
  memberNameLabel.classList.remove('hidden');
  memberName.required = true;
  memberPassword.required = true;
  memberName.value = name;
  memberPassword.value = '';
  memberGreeting.textContent = registering ? 'Première connexion ? Créez votre accès à la wishlist.' : name ? `Bonjour ${name}, retrouvez votre wishlist avec votre code.` : 'Entrez votre nom et votre code pour retrouver la wishlist.';
  memberPasswordLabel.textContent = 'Code à 4 chiffres';
  memberPassword.autocomplete = 'off';
  memberSubmit.querySelector('span').textContent = registering ? 'Créer mon accès' : 'Ouvrir ma wishlist';
  document.querySelector('#switch-code').textContent = registering ? 'J’ai déjà un accès' : 'Première connexion ? Rejoindre une wishlist';
  memberNote.textContent = registering ? 'Choisissez 4 chiffres faciles à retenir, par exemple une date de naissance.' : 'Code oublié ? Demandez à la personne qui vous a invité de renouveler le code de partage.';
  accessError.textContent = '';
  (registering || !name ? memberName : memberPassword).focus();
}
async function openWishlist() {
  const list = await request('/api/wishlist');
  document.querySelector('#list-title').textContent = list.title;
  document.querySelector('#list-description').textContent = list.description;
  renderItems(list.items);
  gateView.classList.add('hidden'); wishlistView.classList.remove('hidden');
  wishlistView.querySelector('h1').focus?.();
}
accessForm.addEventListener('submit', async (event) => {
  event.preventDefault(); accessError.textContent = '';
  const enteringCode = memberStep.classList.contains('hidden');
  if (enteringCode && !shareCodeInput.value.trim()) {
    accessError.textContent = 'Saisissez le code de partage.'; shareCodeInput.focus(); return;
  }
  if (!enteringCode && !memberName.value.trim()) {
    accessError.textContent = 'Saisissez votre nom.'; memberName.focus(); return;
  }
  if (!enteringCode && !/^\d{4}$/.test(memberPassword.value)) {
    accessError.textContent = 'Saisissez un code personnel composé de 4 chiffres.'; memberPassword.focus(); return;
  }
  const button = enteringCode ? accessForm.querySelector('#code-step button') : memberSubmit;
  button.disabled = true;
  const originalText = button.querySelector('span').textContent;
  button.querySelector('span').textContent = 'Un instant…';
  try {
    if (enteringCode) {
      await request('/api/access', { method: 'POST', body: JSON.stringify({ code: new FormData(accessForm).get('code') }) });
      document.querySelector('#share-code').value = '';
      showMemberStep('register', rememberedName);
      return;
    }
    if (memberMode === 'register') {
      const created = await request('/api/member/register', { method: 'POST', body: JSON.stringify({ name: memberName.value, pin: memberPassword.value }) });
      rememberedName = created.name;
      showMemberStep('login', created.name);
    } else {
      const loggedIn = await request('/api/member/login', { method: 'POST', body: JSON.stringify({ name: memberName.value, pin: memberPassword.value }) });
      rememberedName = loggedIn.name;
    }
    await openWishlist();
  } catch (error) { accessError.textContent = error.message; }
  finally {
    button.disabled = false;
    button.querySelector('span').textContent = button === memberSubmit
      ? (memberMode === 'register' ? 'Créer mon accès' : 'Ouvrir ma wishlist')
      : originalText;
  }
});
document.querySelector('#switch-code').addEventListener('click', async () => {
  if (memberMode === 'register') showMemberStep('login', memberName.value.trim() || rememberedName);
  else {
    rememberedName = memberName.value.trim() || rememberedName;
    showCodeStep();
  }
});
document.querySelector('#back-to-login').addEventListener('click', () => showMemberStep('login', rememberedName));
document.querySelector('#close-list').addEventListener('click', async () => {
  await request('/api/member/logout', { method: 'POST', body: '{}' }).catch(() => {});
  wishlistView.classList.add('hidden'); gateView.classList.remove('hidden');
  showMemberStep('login', rememberedName);
});
(async () => {
  try {
    const visitor = await request('/api/visitor/status');
    showMemberStep('login', visitor.known ? visitor.name : '');
  } catch (error) { accessError.textContent = error.message; }
})();
