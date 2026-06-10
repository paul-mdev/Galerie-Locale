import express from 'express';
import { existsSync, createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const imgRoot = path.join(__dirname, 'img');
const distRoot = path.join(__dirname, 'dist');
const dataDir = path.join(__dirname, 'data');
const libraryStatePath = path.join(dataDir, 'library-state.json');

const imageExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif', '.apng',
  '.tif', '.tiff', '.jfif', '.heic', '.heif', '.cur'
]);

const contentTypeByExtension = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif'],
  ['.apng', 'image/apng'],
  ['.tif', 'image/tiff'],
  ['.tiff', 'image/tiff'],
  ['.jfif', 'image/jpeg'],
  ['.heic', 'image/heic'],
  ['.heif', 'image/heif'],
  ['.cur', 'image/x-icon']
]);

app.disable('x-powered-by');
app.use(express.json());

const tierOrder = ['S', 'A', 'B', 'C', null];
const tierSet = new Set(['S', 'A', 'B', 'C']);

function isImageFile(fileName) {
  return imageExtensions.has(path.extname(fileName).toLowerCase());
}

function getContentType(fileName) {
  return contentTypeByExtension.get(path.extname(fileName).toLowerCase()) || 'application/octet-stream';
}

function isValidTier(value) {
  return value === null || tierSet.has(value);
}

function tierRank(tier) {
  const index = tierOrder.indexOf(tier);
  return index === -1 ? tierOrder.length - 1 : index;
}

function compareImages(left, right) {
  return tierRank(left.tier) - tierRank(right.tier)
    || left.fileName.localeCompare(right.fileName, 'fr')
    || left.path.localeCompare(right.path, 'fr');
}

async function readLibraryState() {
  try {
    const raw = await readFile(libraryStatePath, 'utf8');
    const parsed = JSON.parse(raw);
    const tiers = parsed && typeof parsed === 'object' && parsed.tiers && typeof parsed.tiers === 'object'
      ? parsed.tiers
      : {};

    return { tiers };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { tiers: {} };
    }

    throw error;
  }
}

async function writeLibraryState(state) {
  await mkdir(dataDir, { recursive: true });

  const tempPath = `${libraryStatePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tempPath, libraryStatePath);
}

async function scanImageFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await scanImageFiles(absolutePath));
      continue;
    }

    if (!entry.isFile() || !isImageFile(entry.name)) {
      continue;
    }

    const fileInfo = await stat(absolutePath);
    const relativePath = path.relative(imgRoot, absolutePath).split(path.sep).join('/');

    files.push({
      name: entry.name,
      fileName: entry.name,
      path: relativePath,
      size: fileInfo.size,
      modifiedAt: fileInfo.mtimeMs,
      previewUrl: `/api/image?path=${encodeURIComponent(relativePath)}`
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path, 'fr'));
}

async function buildImageMetadata(absolutePath, categoryName) {
  const fileInfo = await stat(absolutePath);
  const relativePath = path.relative(imgRoot, absolutePath).split(path.sep).join('/');
  const fileName = path.basename(absolutePath);

  return {
    name: fileName,
    fileName,
    category: categoryName,
    path: relativePath,
    size: fileInfo.size,
    modifiedAt: fileInfo.mtimeMs,
    previewUrl: `/api/image?path=${encodeURIComponent(relativePath)}`
  };
}

async function scanCategory(categoryDirectory, categoryName) {
  const entries = await readdir(categoryDirectory, { withFileTypes: true });
  const images = [];

  for (const entry of entries) {
    const absolutePath = path.join(categoryDirectory, entry.name);

    if (entry.isDirectory()) {
      images.push(...await scanCategory(absolutePath, categoryName));
      continue;
    }

    if (!entry.isFile() || !isImageFile(entry.name)) {
      continue;
    }

    images.push(await buildImageMetadata(absolutePath, categoryName));
  }

  return images.sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

async function scanCategories() {
  if (!existsSync(imgRoot)) {
    return [];
  }

  const entries = await readdir(imgRoot, { withFileTypes: true });
  const categories = [];
  const rootImages = [];

  for (const entry of entries) {
    const absolutePath = path.join(imgRoot, entry.name);

    if (entry.isFile() && isImageFile(entry.name)) {
      rootImages.push(await buildImageMetadata(absolutePath, 'Racine'));
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const images = await scanCategory(absolutePath, entry.name);

    if (images.length > 0) {
      categories.push({
        name: entry.name,
        images
      });
    }
  }

  if (rootImages.length > 0) {
    categories.unshift({
      name: 'Racine',
      images: rootImages.sort((left, right) => left.name.localeCompare(right.name, 'fr'))
    });
  }

  return categories.sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

function countDuplicateNames(categories) {
  const counts = new Map();

  for (const category of categories) {
    for (const image of category.images) {
      counts.set(image.fileName, (counts.get(image.fileName) || 0) + 1);
    }
  }

  return counts;
}

function applyLibraryState(categories, tiers) {
  const duplicateCounts = countDuplicateNames(categories);

  return categories.map((category) => ({
    ...category,
    images: category.images
      .map((image) => {
        const duplicateConflict = (duplicateCounts.get(image.fileName) || 0) > 1;
        const tier = duplicateConflict ? null : tiers[image.fileName] ?? null;

        return {
          ...image,
          tier,
          duplicateConflict,
          duplicateCount: duplicateCounts.get(image.fileName) || 0
        };
      })
      .sort(compareImages)
  }));
}

function flattenImages(categories) {
  return categories.flatMap((category) => category.images);
}

async function loadAnnotatedLibrary() {
  const [categories, libraryState] = await Promise.all([
    scanCategories(),
    readLibraryState()
  ]);

  const annotatedCategories = applyLibraryState(categories, libraryState.tiers || {});
  const total = annotatedCategories.reduce((sum, category) => sum + category.images.length, 0);
  const flatImages = flattenImages(annotatedCategories);
  const duplicateImages = flatImages.filter((image) => image.duplicateConflict).length;
  const conflictNames = [...new Set(flatImages.filter((image) => image.duplicateConflict).map((image) => image.fileName))]
    .sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' }));

  return {
    categories: annotatedCategories,
    images: flatImages,
    total,
    duplicateImages,
    conflictNames,
    conflictCount: conflictNames.length
  };
}

function filterByTier(categories, tier) {
  return categories.map((category) => ({
    ...category,
    images: category.images.filter((image) => image.tier === tier)
  })).filter((category) => category.images.length > 0);
}

function splitByTiers(categories) {
  return tierOrder.map((tier) => ({
    tier,
    categories: filterByTier(categories, tier)
  })).filter((section) => section.categories.length > 0);
}

app.get('/api/images', async (_request, response) => {
  try {
    const library = await loadAnnotatedLibrary();

    response.json({
      categories: library.categories,
      images: library.images,
      total: library.total,
      duplicateImages: library.duplicateImages,
      conflictNames: library.conflictNames,
      conflictCount: library.conflictCount,
      tiers: tierOrder.filter((tier) => tier !== null)
    });
  } catch (error) {
    response.status(500).json({ error: 'Unable to scan images', details: error.message });
  }
});

app.get('/api/library-state', async (_request, response) => {
  try {
    const libraryState = await readLibraryState();
    response.json(libraryState);
  } catch (error) {
    response.status(500).json({ error: 'Unable to load library state', details: error.message });
  }
});

app.put('/api/tier', async (request, response) => {
  try {
    const { fileName, tier } = request.body || {};

    if (typeof fileName !== 'string' || fileName.trim() === '') {
      response.status(400).json({ error: 'Missing fileName' });
      return;
    }

    if (!isValidTier(tier)) {
      response.status(400).json({ error: 'Invalid tier' });
      return;
    }

    const library = await loadAnnotatedLibrary();
    const images = flattenImages(library.categories);
    const matches = images.filter((image) => image.fileName === fileName);

    if (matches.length === 0) {
      response.status(404).json({ error: 'Image not found' });
      return;
    }

    if (matches.length > 1) {
      response.status(409).json({ error: 'Duplicate file name', duplicateCount: matches.length });
      return;
    }

    const libraryState = await readLibraryState();

    if (tier === null) {
      delete libraryState.tiers[fileName];
    } else {
      libraryState.tiers[fileName] = tier;
    }

    await writeLibraryState(libraryState);
    response.json({ ok: true, fileName, tier });
  } catch (error) {
    response.status(500).json({ error: 'Unable to save tier', details: error.message });
  }
});

app.get('/api/image', (request, response) => {
  const requestedPath = request.query.path;

  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    response.status(400).send('Missing path');
    return;
  }

  const normalizedPath = path.normalize(requestedPath).replace(/^([/\\])+/, '');
  const absolutePath = path.resolve(imgRoot, normalizedPath);
  const insideRoot = absolutePath === imgRoot || absolutePath.startsWith(`${imgRoot}${path.sep}`);

  if (!insideRoot || !existsSync(absolutePath)) {
    response.status(404).send('Image not found');
    return;
  }

  response.type(getContentType(absolutePath));
  response.setHeader('Cache-Control', 'public, max-age=3600');
  createReadStream(absolutePath).pipe(response);
});

if (existsSync(distRoot)) {
  app.use(express.static(distRoot, { extensions: ['html'] }));

  app.get('/', (_request, response) => {
    response.sendFile(path.join(distRoot, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Image viewer server running on http://0.0.0.0:${port}`);
});