const accessForm = document.querySelector('#access-form');
const accessError = document.querySelector('#access-error');
const gateView = document.querySelector('#gate-view');
const wishlistView = document.querySelector('#wishlist-view');
const grid = document.querySelector('#items-grid');
const emptyState = document.querySelector('#empty-state');
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
accessForm.addEventListener('submit', async (event) => {
  event.preventDefault(); accessError.textContent = '';
  const button = accessForm.querySelector('button'); button.disabled = true; button.querySelector('span').textContent = 'Vérification…';
  try {
    await request('/api/access', { method: 'POST', body: JSON.stringify({ code: new FormData(accessForm).get('code') }) });
    const list = await request('/api/wishlist');
    document.querySelector('#list-title').textContent = list.title;
    document.querySelector('#list-description').textContent = list.description;
    renderItems(list.items);
    gateView.classList.add('hidden'); wishlistView.classList.remove('hidden');
    wishlistView.querySelector('h1').focus?.();
  } catch (error) { accessError.textContent = error.message === 'Accès requis.' ? 'Une erreur est survenue. Vérifie le code puis réessaie.' : error.message; }
  finally { button.disabled = false; button.querySelector('span').textContent = 'Découvrir'; }
});
document.querySelector('#close-list').addEventListener('click', () => { wishlistView.classList.add('hidden'); gateView.classList.remove('hidden'); accessForm.reset(); document.querySelector('#share-code').focus(); });
