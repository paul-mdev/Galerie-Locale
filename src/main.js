import './style.css';

const app = document.querySelector('#app');

const state = {
  categories: [],
  loading: true,
  error: '',
  selectedImage: null,
  showDetails: localStorage.getItem('showImageDetails') !== 'false',
  selectedCategory: 'all',
  compactGrid: localStorage.getItem('compactGrid') === 'true'
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

function setSelectedCategory(categoryName) {
  state.selectedCategory = categoryName;
  render();
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
  } catch (error) {
    state.error = error.message || 'Impossible de charger les images';
    state.categories = [];
  } finally {
    state.loading = false;
    render();
  }
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

  const totalImages = state.categories.reduce((sum, category) => sum + category.images.length, 0);
  const visibleCategories = state.selectedCategory === 'all'
    ? state.categories
    : state.categories.filter((category) => category.name === state.selectedCategory);
  const visibleImages = visibleCategories.reduce((sum, category) => sum + category.images.length, 0);

  if (totalImages === 0) {
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
        <h2>${visibleImages} image${visibleImages > 1 ? 's' : ''} dans ${state.selectedCategory === 'all' ? state.categories.length : 1} catégorie${state.selectedCategory === 'all' && state.categories.length > 1 ? 's' : ''}</h2>
      </div>
      <div class="toolbar__actions">
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
        <button class="action-button action-button--ghost" id="grid-size-button" type="button">
          ${state.compactGrid ? 'Taille normale' : 'Taille réduite'}
        </button>
        <button class="action-button action-button--ghost" id="toggle-details-button" type="button">
          ${state.showDetails ? 'Masquer les détails' : 'Afficher les détails'}
        </button>
        <button class="action-button" id="refresh-button" type="button">Actualiser</button>
      </div>
    </section>
    ${visibleCategories
      .map(
        (category) => `
          <section class="category ${state.compactGrid ? 'category--compact' : ''}">
            <header class="category__header">
              <div>
                <p class="eyebrow">Catégorie</p>
                <h2>${escapeHtml(category.name)}</h2>
              </div>
              <span class="category__count">${category.images.length} image${category.images.length > 1 ? 's' : ''}</span>
            </header>
            <section class="grid" aria-label="Galerie de ${escapeHtml(category.name)}">
              ${category.images
                .map(
                  (image, imageIndex) => `
                    <button class="card" type="button" data-image-path="${escapeHtml(image.path)}">
                      <img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(image.name)}" loading="lazy" />
                      ${state.showDetails ? `
                        <div class="card__meta">
                          <span class="card__title">${escapeHtml(image.name)}</span>
                          <span class="card__details">${escapeHtml(formatBytes(image.size))} · ${escapeHtml(formatDate(image.modifiedAt))}</span>
                        </div>
                      ` : ''}
                    </button>
                  `
                )
                .join('')}
            </section>
          </section>
        `
      )
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
      const selectedImage = state.categories
        .flatMap((category) => category.images)
        .find((image) => image.path === imagePath);

      if (selectedImage) {
        openImage(selectedImage);
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