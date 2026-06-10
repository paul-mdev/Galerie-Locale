import './style.css';

const app = document.querySelector('#app');

const tierOrder = ['S', 'A', 'B', 'C', null];
const tierLabelMap = new Map([
  ['S', 'S'],
  ['A', 'A'],
  ['B', 'B'],
  ['C', 'C'],
  [null, 'Sans catégorie']
]);

const state = {
  categories: [],
  images: [],
  loading: true,
  error: '',
  selectedImage: null,
  showDetails: localStorage.getItem('showImageDetails') !== 'false',
  selectedCategory: 'all',
  compactGrid: localStorage.getItem('compactGrid') === 'true',
  viewMode: localStorage.getItem('viewMode') || 'categories',
  conflictNames: [],
  conflictCount: 0
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return '';
  }

  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

function tierRank(tier) {
  return tierOrder.indexOf(tier);
}

function tierLabel(tier) {
  return tierLabelMap.get(tier) || 'Sans catégorie';
}

function compareImages(left, right) {
  const tierDifference = tierRank(left.tier) - tierRank(right.tier);

  if (tierDifference !== 0) {
    return tierDifference;
  }

  const nameDifference = left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });

  if (nameDifference !== 0) {
    return nameDifference;
  }

  return left.path.localeCompare(right.path, 'fr', { sensitivity: 'base' });
}

function sortImages(images) {
  return [...images].sort(compareImages);
}

function applyTierLocally(fileName, tier) {
  const nextTier = tier ?? null;

  state.images = sortImages(
    state.images.map((image) => (image.fileName === fileName ? { ...image, tier: nextTier } : image))
  );

  state.categories = state.categories
    .map((category) => ({
      ...category,
      images: sortImages(
        category.images.map((image) => (image.fileName === fileName ? { ...image, tier: nextTier } : image))
      )
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }));
}

function groupImagesByTier(images) {
  return tierOrder.map((tier) => ({
    tier,
    images: sortImages(images.filter((image) => image.tier === tier))
  })).filter((section) => section.images.length > 0);
}

function openImage(image) {
  state.selectedImage = image;
  render();
}

function closeImage() {
  state.selectedImage = null;
  render();
}

function toggleDetails() {
  state.showDetails = !state.showDetails;
  localStorage.setItem('showImageDetails', String(state.showDetails));
  render();
}

function toggleGridSize() {
  state.compactGrid = !state.compactGrid;
  localStorage.setItem('compactGrid', String(state.compactGrid));
  render();
}

function setViewMode(viewMode) {
  state.viewMode = viewMode;
  localStorage.setItem('viewMode', viewMode);
  render();
}

function setSelectedCategory(categoryName) {
  if (state.selectedCategory === categoryName) {
    return;
  }

  const previousScrollY = window.scrollY;
  state.selectedCategory = categoryName;
  render();

  requestAnimationFrame(() => {
    window.scrollTo({ top: previousScrollY });
  });
}

async function loadImages() {
  state.loading = true;
  state.error = '';
  render();

  try {
    const response = await fetch('/api/images');

    if (!response.ok) {
      throw new Error(`Erreur API ${response.status}`);
    }

    const data = await response.json();
    state.categories = Array.isArray(data.categories) ? data.categories : [];
    state.images = Array.isArray(data.images) ? data.images : [];
    state.conflictNames = Array.isArray(data.conflictNames) ? data.conflictNames : [];
    state.conflictCount = Number.isFinite(data.conflictCount) ? data.conflictCount : state.conflictNames.length;
  } catch (error) {
    state.error = error.message || 'Impossible de charger les images';
    state.categories = [];
    state.images = [];
    state.conflictNames = [];
    state.conflictCount = 0;
  } finally {
    state.loading = false;
    render();
  }
}

async function updateImageTier(fileName, tier) {
  const response = await fetch('/api/tier', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fileName, tier })
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const conflictWarning = errorPayload.warning ? ` ${errorPayload.warning}` : '';
    throw new Error(errorPayload.error || `Erreur API ${response.status}${conflictWarning}`);
  }

  const payload = await response.json().catch(() => ({}));
  applyTierLocally(fileName, payload.tier ?? tier ?? null);
  render();
}

function renderConflictBanner() {
  if (state.conflictCount === 0) {
    return '';
  }

  const names = state.conflictNames.slice(0, 5).map((name) => `<span class="conflict-banner__chip">${escapeHtml(name)}</span>`).join('');
  const suffix = state.conflictCount > 5 ? `<span class="conflict-banner__more">+${state.conflictCount - 5}</span>` : '';

  return `
    <section class="conflict-banner" role="status" aria-live="polite">
      <strong>${state.conflictCount} nom${state.conflictCount > 1 ? 's' : ''} de fichier${state.conflictCount > 1 ? 's' : ''} en conflit.</strong>
      <span>Le classement est bloqué pour les doublons tant que le nom existe plusieurs fois.</span>
      <div class="conflict-banner__chips">${names}${suffix}</div>
    </section>
  `;
}

function renderTierButtons(image) {
  return tierOrder.map((tier) => `
    <button
      class="tier-button ${image.tier === tier ? 'tier-button--active' : ''}"
      type="button"
      data-tier-button="true"
      data-file-name="${escapeHtml(image.fileName)}"
      data-tier="${tier === null ? '' : tier}"
      ${image.duplicateConflict ? 'disabled' : ''}
      aria-pressed="${image.tier === tier ? 'true' : 'false'}"
      title="${tierLabel(tier)}"
    >
      ${tier === null ? '—' : tier}
    </button>
  `).join('');
}

function renderImageCard(image, { showCategory } = {}) {
  const categorySource = showCategory ? escapeHtml(image.category) : '\u00a0';

  return `
    <article class="card ${image.duplicateConflict ? 'card--conflict' : ''}">
      <button class="card__preview" type="button" data-image-path="${escapeHtml(image.path)}">
        <img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(image.name)}" loading="lazy" />
        <div class="card__meta">
          ${state.showDetails ? `
            <span class="card__title">${escapeHtml(image.name)}</span>
            <span class="card__details">${escapeHtml(formatBytes(image.size))} · ${escapeHtml(formatDate(image.modifiedAt))}</span>
          ` : ''}
          <span class="card__source ${showCategory ? '' : 'card__source--placeholder'}">${categorySource}</span>
          <span class="card__tier-badge ${image.tier === null ? 'card__tier-badge--empty' : ''}">${escapeHtml(tierLabel(image.tier))}</span>
          ${image.duplicateConflict ? '<span class="card__warning">Nom dupliqué, classement bloqué</span>' : ''}
        </div>
      </button>
      <div class="card__tiers">
        ${renderTierButtons(image)}
      </div>
    </article>
  `;
}

function renderGallery() {
  if (state.loading) {
    return '<section class="empty-state">Chargement des images…</section>';
  }

  if (state.error) {
    return `
      <section class="empty-state empty-state--error">
        <h2>Impossible de charger la galerie</h2>
        <p>${escapeHtml(state.error)}</p>
        <button class="action-button" id="retry-button">Réessayer</button>
      </section>
    `;
  }

  const visibleCategories = state.selectedCategory === 'all'
    ? state.categories
    : state.categories.filter((category) => category.name === state.selectedCategory);
  const visibleImages = visibleCategories.reduce((sum, category) => sum + category.images.length, 0);
  const tierSections = groupImagesByTier(state.images);

  if (state.images.length === 0) {
    return `
      <section class="empty-state">
        <h2>Aucune image trouvée</h2>
        <p>Ajoute des images dans un dossier de premier niveau sous <strong>img</strong>. Les sous-dossiers sont pris en compte à l’intérieur de chaque catégorie.</p>
        <button class="action-button" id="refresh-button">Actualiser</button>
      </section>
    `;
  }

  return `
    <section class="toolbar">
      <div>
        <p class="eyebrow">Galerie locale</p>
        <h2>${state.viewMode === 'categories'
          ? `${visibleImages} image${visibleImages > 1 ? 's' : ''} dans ${state.selectedCategory === 'all' ? state.categories.length : 1} catégorie${state.selectedCategory === 'all' && state.categories.length > 1 ? 's' : ''}`
          : `${state.images.length} image${state.images.length > 1 ? 's' : ''} en vue tierlist`
        }</h2>
      </div>
      <div class="toolbar__actions">
        <label class="category-picker" for="view-mode-select">
          <span class="sr-only">Changer de vue</span>
          <select id="view-mode-select" class="category-picker__select">
            <option value="categories" ${state.viewMode === 'categories' ? 'selected' : ''}>Par catégorie</option>
            <option value="tierlist" ${state.viewMode === 'tierlist' ? 'selected' : ''}>Tierlist globale</option>
          </select>
        </label>
        ${state.viewMode === 'categories' ? `
        <label class="category-picker" for="category-select">
          <span class="sr-only">Filtrer par catégorie</span>
          <select id="category-select" class="category-picker__select">
            <option value="all" ${state.selectedCategory === 'all' ? 'selected' : ''}>Toutes les catégories</option>
            ${state.categories
              .map(
                (category) => `
                  <option value="${escapeHtml(category.name)}" ${state.selectedCategory === category.name ? 'selected' : ''}>
                    ${escapeHtml(category.name)} (${category.images.length})
                  </option>
                `
              )
              .join('')}
          </select>
        </label>
        ` : ''}
        <button class="action-button action-button--ghost" id="grid-size-button" type="button">
          ${state.compactGrid ? 'Taille normale' : 'Taille réduite'}
        </button>
        <button class="action-button action-button--ghost" id="toggle-details-button" type="button">
          ${state.showDetails ? 'Masquer les détails' : 'Afficher les détails'}
        </button>
        <button class="action-button" id="refresh-button" type="button">Actualiser</button>
      </div>
    </section>
    ${renderConflictBanner()}
    ${state.viewMode === 'categories'
      ? visibleCategories
        .map((category) => `
          <section class="category">
            <header class="category__header">
              <div>
                <p class="eyebrow">Catégorie</p>
                <h2>${escapeHtml(category.name)}</h2>
              </div>
              <span class="category__count">${category.images.length} image${category.images.length > 1 ? 's' : ''}</span>
            </header>
            <section class="grid ${state.compactGrid ? 'grid--compact' : ''}" aria-label="Galerie de ${escapeHtml(category.name)}">
              ${category.images.map((image) => renderImageCard(image)).join('')}
            </section>
          </section>
        `)
        .join('')
      : tierSections
        .map((section) => `
          <section class="category">
            <header class="category__header">
              <div>
                <p class="eyebrow">Tier</p>
                <h2>${escapeHtml(tierLabel(section.tier))}</h2>
              </div>
              <span class="category__count">${section.images.length} image${section.images.length > 1 ? 's' : ''}</span>
            </header>
            <section class="grid ${state.compactGrid ? 'grid--compact' : ''}" aria-label="Tier ${escapeHtml(tierLabel(section.tier))}">
              ${section.images.map((image) => renderImageCard(image, { showCategory: true })).join('')}
            </section>
          </section>
        `)
        .join('')}
  `;
}

function renderModal() {
  if (!state.selectedImage) {
    return '';
  }

  return `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Image en plein écran">
      <button class="modal__backdrop" type="button" aria-label="Fermer l'image"></button>
      <div class="modal__content">
        <div class="modal__body">
          <img class="modal__image" src="${escapeHtml(state.selectedImage.previewUrl)}" alt="${escapeHtml(state.selectedImage.name)}" />
        </div>
      </div>
    </div>
  `;
}

function render() {
  document.body.style.overflow = state.selectedImage ? 'hidden' : '';

  app.innerHTML = `
    <main class="shell">
      ${renderGallery()}
    </main>
    ${renderModal()}
  `;

  const refreshButton = document.querySelector('#refresh-button');
  if (refreshButton) {
    refreshButton.addEventListener('click', loadImages);
  }

  const toggleDetailsButton = document.querySelector('#toggle-details-button');
  if (toggleDetailsButton) {
    toggleDetailsButton.addEventListener('click', toggleDetails);
  }

  const viewModeSelect = document.querySelector('#view-mode-select');
  if (viewModeSelect) {
    viewModeSelect.addEventListener('change', (event) => {
      setViewMode(event.target.value);
    });
  }

  const gridSizeButton = document.querySelector('#grid-size-button');
  if (gridSizeButton) {
    gridSizeButton.addEventListener('click', toggleGridSize);
  }

  const categorySelect = document.querySelector('#category-select');
  if (categorySelect) {
    categorySelect.addEventListener('change', (event) => {
      setSelectedCategory(event.target.value);
    });
  }

  const retryButton = document.querySelector('#retry-button');
  if (retryButton) {
    retryButton.addEventListener('click', loadImages);
  }

  document.querySelectorAll('[data-image-path]').forEach((button) => {
    button.addEventListener('click', () => {
      const imagePath = button.dataset.imagePath;
      const selectedImage = state.images.find((image) => image.path === imagePath)
        || state.categories.flatMap((category) => category.images).find((image) => image.path === imagePath);

      if (selectedImage) {
        openImage(selectedImage);
      }
    });
  });

  document.querySelectorAll('[data-tier-button="true"]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) {
        return;
      }

      const fileName = button.dataset.fileName;
      const tier = button.dataset.tier === '' ? null : button.dataset.tier;

      try {
        await updateImageTier(fileName, tier);
      } catch (error) {
        state.error = error.message || 'Impossible de changer le tier';
        render();
      }
    });
  });

  const backdrop = document.querySelector('.modal__backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeImage);
  }

  const modal = document.querySelector('.modal');
  if (modal) {
    modal.addEventListener('click', closeImage);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.selectedImage) {
    closeImage();
  }
});

loadImages();