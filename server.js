import express from 'express';
import { existsSync, createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const imgRoot = path.join(__dirname, 'img');
const distRoot = path.join(__dirname, 'dist');

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

function isImageFile(fileName) {
  return imageExtensions.has(path.extname(fileName).toLowerCase());
}

function getContentType(fileName) {
  return contentTypeByExtension.get(path.extname(fileName).toLowerCase()) || 'application/octet-stream';
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

  return {
    name: path.basename(absolutePath),
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

app.get('/api/images', async (_request, response) => {
  try {
    const categories = await scanCategories();
    const total = categories.reduce((sum, category) => sum + category.images.length, 0);

    response.json({ categories, total });
  } catch (error) {
    response.status(500).json({ error: 'Unable to scan images', details: error.message });
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