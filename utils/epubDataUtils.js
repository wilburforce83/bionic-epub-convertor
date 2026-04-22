const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { imageSize } = require('image-size');

const defaultEpubDataPath = path.join(__dirname, '..', 'db', 'epubData.json');
const epubMetadataCache = new Map();

const defaultBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmVsAAAAASUVORK5CYII=';
const MAX_COVER_PREVIEW_WIDTH = 320;
const MAX_COVER_PREVIEW_HEIGHT = 480;
const MAX_FALLBACK_COVER_CANDIDATES = 4;
const MAX_DIRECT_COVER_BYTES = 256 * 1024;
const COVER_HINT_PATTERNS = [
  /cover/,
  /front/,
  /title[-_ ]?page/,
  /jacket/
];

function resolveEpubDataPath(cachePath) {
  return cachePath || defaultEpubDataPath;
}

function isEpubFilename(fileName) {
  return /\.epub$/i.test(fileName);
}

function buildFileSignature(fileStat) {
  return `${Number(fileStat && fileStat.size) || 0}:${Math.round(Number(fileStat && fileStat.mtimeMs) || 0)}`;
}

function getEntrySignature(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }

  if (entry.coverVersion) {
    return String(entry.coverVersion);
  }

  const size = Number(entry.fileSizeBytes) || 0;
  const sourceMtimeMs = Math.round(Number(entry.sourceMtimeMs) || 0);
  if (size || sourceMtimeMs) {
    return `${size}:${sourceMtimeMs}`;
  }

  const parsedLastModified = Date.parse(entry.lastModified || '');
  if (Number.isFinite(parsedLastModified)) {
    return `${size}:${Math.round(parsedLastModified)}`;
  }

  return '';
}

function isCacheEntryCurrent(entry, fileStat) {
  return getEntrySignature(entry) === buildFileSignature(fileStat);
}

function getDefaultMetaData(file, fileStat, metadataRefreshedAt) {
  return {
    filename: file,
    title: file.replace(/\.epub$/i, ''),
    author: '',
    cover: `data:image/png;base64,${defaultBase64Image}`,
    coverVersion: buildFileSignature(fileStat),
    fileSizeBytes: Number(fileStat.size) || 0,
    sourceMtimeMs: Math.round(Number(fileStat.mtimeMs) || 0),
    lastModified: fileStat.mtime.toISOString(),
    metadataRefreshedAt,
    isValid: true
  };
}

function isImageEntry(entryName) {
  const normalizedEntryName = entryName.toLowerCase();

  return normalizedEntryName.endsWith('.jpg') ||
    normalizedEntryName.endsWith('.jpeg') ||
    normalizedEntryName.endsWith('.png') ||
    normalizedEntryName.endsWith('.gif') ||
    normalizedEntryName.endsWith('.svg');
}

function normalizeArchivePath(entryName) {
  return String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function normalizeMimeSubtype(type) {
  if (type === 'jpg') {
    return 'jpeg';
  }

  if (type === 'svg') {
    return 'svg+xml';
  }

  return type;
}

function createDataUri(mimeSubtype, buffer) {
  return `data:image/${mimeSubtype};base64,${buffer.toString('base64')}`;
}

function getArchiveEntrySize(entry) {
  const size = Number(entry && entry.header && entry.header.size);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function getCoverHintScore(entryName) {
  const normalizedEntryName = normalizeArchivePath(entryName).toLowerCase();
  let score = 0;

  for (const pattern of COVER_HINT_PATTERNS) {
    if (pattern.test(normalizedEntryName)) {
      score += 100;
    }
  }

  return score;
}

function buildFallbackCoverCandidates(zipEntries) {
  return zipEntries
    .filter((entry) => isImageEntry(normalizeArchivePath(entry.entryName)))
    .sort((left, right) => {
      const scoreDifference = getCoverHintScore(right.entryName) - getCoverHintScore(left.entryName);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return getArchiveEntrySize(right) - getArchiveEntrySize(left);
    })
    .slice(0, MAX_FALLBACK_COVER_CANDIDATES);
}

function shouldRenderCoverPreviewAsPng(metadata, sourceMimeSubtype) {
  const format = String((metadata && metadata.format) || '').toLowerCase();
  return Boolean(metadata && metadata.hasAlpha) ||
    format === 'png' ||
    format === 'svg' ||
    format === 'gif' ||
    sourceMimeSubtype === 'png' ||
    sourceMimeSubtype === 'svg+xml';
}

function tryReadCoverDimensions(imgBuffer) {
  try {
    return imageSize(imgBuffer);
  } catch (error) {
    return null;
  }
}

async function tryReadCover(zip, entry) {
  try {
    const imgBuffer = zip.readFile(entry);
    if (!imgBuffer) {
      return null;
    }

    const dimensions = tryReadCoverDimensions(imgBuffer);
    const sourceMimeSubtype = normalizeMimeSubtype(String((dimensions && dimensions.type) || '').toLowerCase());
    const sourceWidth = Number(dimensions && dimensions.width) || 0;
    const sourceHeight = Number(dimensions && dimensions.height) || 0;
    const needsResize = sourceWidth > MAX_COVER_PREVIEW_WIDTH || sourceHeight > MAX_COVER_PREVIEW_HEIGHT;

    if (sourceMimeSubtype && imgBuffer.length <= MAX_DIRECT_COVER_BYTES && !needsResize) {
      return {
        type: sourceMimeSubtype,
        size: imgBuffer.length,
        value: createDataUri(sourceMimeSubtype, imgBuffer)
      };
    }

    try {
      const metadata = await sharp(imgBuffer, { failOn: 'none', animated: false }).metadata();
      const renderAsPng = shouldRenderCoverPreviewAsPng(metadata, sourceMimeSubtype);
      const outputMimeSubtype = renderAsPng ? 'png' : 'jpeg';
      const resizedImage = sharp(imgBuffer, { failOn: 'none', animated: false })
        .rotate()
        .resize({
          width: MAX_COVER_PREVIEW_WIDTH,
          height: MAX_COVER_PREVIEW_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true
        });

      const outputBuffer = renderAsPng
        ? await resizedImage.png({
          compressionLevel: 9,
          palette: true
        }).toBuffer()
        : await resizedImage.jpeg({
          quality: 70,
          mozjpeg: true
        }).toBuffer();

      if (outputBuffer.length > 0) {
        if (sourceMimeSubtype && imgBuffer.length <= MAX_DIRECT_COVER_BYTES && imgBuffer.length <= outputBuffer.length) {
          return {
            type: sourceMimeSubtype,
            size: imgBuffer.length,
            value: createDataUri(sourceMimeSubtype, imgBuffer)
          };
        }

        return {
          type: outputMimeSubtype,
          size: outputBuffer.length,
          value: createDataUri(outputMimeSubtype, outputBuffer)
        };
      }
    } catch (error) {
      // Fall back to the original asset only when it is already reasonably small.
    }

    if (sourceMimeSubtype && imgBuffer.length <= MAX_DIRECT_COVER_BYTES) {
      return {
        type: sourceMimeSubtype,
        size: imgBuffer.length,
        value: createDataUri(sourceMimeSubtype, imgBuffer)
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

function resolveManifestHref(opfEntryName, href) {
  if (!href) {
    return '';
  }

  const normalizedHref = normalizeArchivePath(href);
  const opfDirectory = path.posix.dirname(normalizeArchivePath(opfEntryName));
  const resolvedPath = opfDirectory && opfDirectory !== '.'
    ? path.posix.normalize(path.posix.join(opfDirectory, normalizedHref))
    : path.posix.normalize(normalizedHref);

  return normalizeArchivePath(resolvedPath);
}

function extractOpfMetaData(opfEntryName, content) {
  const metaData = {};

  try {
    const $ = cheerio.load(content, { xmlMode: true });
    const manifestItems = $('manifest > item').toArray().map((item) => {
      const element = $(item);

      return {
        id: element.attr('id') || '',
        href: element.attr('href') || '',
        properties: String(element.attr('properties') || '')
          .split(/\s+/)
          .filter(Boolean)
      };
    });

    const title = $('metadata > dc\\:title, metadata > title').first().text().trim();
    const author = $('metadata > dc\\:creator, metadata > creator').first().text().trim();

    if (title) {
      metaData.title = title;
    }

    if (author) {
      metaData.author = author;
    }

    const coverItemId = $('metadata > meta[name="cover"]').attr('content');
    let coverItem = null;

    if (coverItemId) {
      coverItem = manifestItems.find((item) => item.id === coverItemId);
    }

    if (!coverItem) {
      coverItem = manifestItems.find((item) => item.properties.includes('cover-image'));
    }

    if (!coverItem) {
      coverItem = manifestItems.find((item) => {
        const entryName = `${item.id} ${item.href}`.toLowerCase();
        return isImageEntry(item.href) && entryName.includes('cover');
      });
    }

    if (coverItem && coverItem.href) {
      metaData.coverEntryName = resolveManifestHref(opfEntryName, coverItem.href);
    }
  } catch (error) {
    return metaData;
  }

  return metaData;
}

function sortEpubData(entries) {
  return entries.slice().sort((left, right) => (
    String(left && left.filename || '').localeCompare(String(right && right.filename || ''), undefined, {
      sensitivity: 'base'
    })
  ));
}

function haveEntriesChanged(previousEntry, nextEntry) {
  if (!previousEntry && nextEntry) {
    return true;
  }

  if (previousEntry && !nextEntry) {
    return true;
  }

  return JSON.stringify(previousEntry || null) !== JSON.stringify(nextEntry || null);
}

async function writeCachedEpubData(cachePath, data) {
  const epubDataPath = resolveEpubDataPath(cachePath);
  const sortedData = sortEpubData(Array.isArray(data) ? data : []);

  await fs.ensureDir(path.dirname(epubDataPath));
  await fs.writeJson(epubDataPath, sortedData, { spaces: 2 });

  const fileStat = await fs.stat(epubDataPath);
  epubMetadataCache.set(epubDataPath, {
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    data: sortedData
  });

  return sortedData;
}

async function readCachedEpubData(cachePath) {
  const epubDataPath = resolveEpubDataPath(cachePath);

  if (!(await fs.pathExists(epubDataPath))) {
    epubMetadataCache.delete(epubDataPath);
    return [];
  }

  const fileStat = await fs.stat(epubDataPath);
  const cachedEntry = epubMetadataCache.get(epubDataPath);
  if (cachedEntry && cachedEntry.mtimeMs === fileStat.mtimeMs && cachedEntry.size === fileStat.size) {
    return cachedEntry.data;
  }

  const rawData = await fs.readFile(epubDataPath, 'utf-8');
  if (!rawData.trim()) {
    epubMetadataCache.set(epubDataPath, {
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      data: []
    });
    return [];
  }

  let data;
  try {
    data = JSON.parse(rawData);
  } catch (error) {
    console.error(`Error reading EPUB metadata cache: ${error.message}`);
    epubMetadataCache.delete(epubDataPath);
    return [];
  }

  if (!Array.isArray(data)) {
    epubMetadataCache.delete(epubDataPath);
    return [];
  }

  epubMetadataCache.set(epubDataPath, {
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    data
  });

  return data;
}

async function extractMetadataForFile(filePath, fileStat) {
  const resolvedFileStat = fileStat || await fs.stat(filePath);
  const fileName = path.basename(filePath);
  const metadataRefreshedAt = new Date().toISOString();
  const metaData = getDefaultMetaData(fileName, resolvedFileStat, metadataRefreshedAt);

  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    const entryMap = new Map();
    let explicitCoverEntryName = '';

    for (const entry of zipEntries) {
      const normalizedEntryName = normalizeArchivePath(entry.entryName);
      const entryName = normalizedEntryName.toLowerCase();
      entryMap.set(entryName, entry);

      if (entryName.endsWith('.opf')) {
        const content = zip.readAsText(entry);
        const opfMetaData = extractOpfMetaData(normalizedEntryName, content);

        if (opfMetaData.title) {
          metaData.title = opfMetaData.title;
        }

        if (opfMetaData.author) {
          metaData.author = opfMetaData.author;
        }

        if (!explicitCoverEntryName && opfMetaData.coverEntryName) {
          explicitCoverEntryName = opfMetaData.coverEntryName.toLowerCase();
        }
      }
    }

    const explicitCoverEntry = explicitCoverEntryName ? entryMap.get(explicitCoverEntryName) : null;
    if (explicitCoverEntry) {
      const explicitCover = await tryReadCover(zip, explicitCoverEntry);
      if (explicitCover) {
        metaData.cover = explicitCover.value;
      }
    } else {
      const fallbackCoverCandidates = buildFallbackCoverCandidates(zipEntries);

      for (const entry of fallbackCoverCandidates) {
        const fallbackCover = await tryReadCover(zip, entry);
        if (!fallbackCover) {
          continue;
        }

        metaData.cover = fallbackCover.value;
        break;
      }
    }
  } catch (error) {
    metaData.isValid = false;
    metaData.processingError = error.message;
    console.error(`Error processing file ${filePath}: ${error.message}`);
  }

  return metaData;
}

async function extractEpubData(processedDir, options = {}) {
  const previousEntries = await readCachedEpubData(options.cachePath);
  const previousEntriesByFilename = new Map(previousEntries.map((entry) => [entry.filename, entry]));
  const directoryEntries = await fs.readdir(processedDir).catch((error) => {
    if (error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });
  const nextEntries = [];
  let cacheChanged = previousEntries.length !== directoryEntries.filter(isEpubFilename).length;

  for (const file of directoryEntries.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))) {
    const filePath = path.join(processedDir, file);
    const fileStat = await fs.stat(filePath);

    if (!fileStat.isFile() || !isEpubFilename(file)) {
      continue;
    }

    const previousEntry = previousEntriesByFilename.get(file);
    if (!options.force && previousEntry && isCacheEntryCurrent(previousEntry, fileStat)) {
      nextEntries.push(previousEntry);
      continue;
    }

    const nextEntry = await extractMetadataForFile(filePath, fileStat);
    cacheChanged = cacheChanged || haveEntriesChanged(previousEntry, nextEntry);
    nextEntries.push(nextEntry);
  }

  if (!cacheChanged && previousEntries.length === nextEntries.length) {
    return sortEpubData(previousEntries);
  }

  return writeCachedEpubData(options.cachePath, nextEntries);
}

async function upsertEpubMetadataForFile(processedDir, filename, options = {}) {
  if (!isEpubFilename(filename)) {
    return null;
  }

  const filePath = path.join(processedDir, filename);
  const fileStat = await fs.stat(filePath);
  if (!fileStat.isFile()) {
    return null;
  }

  const previousEntries = await readCachedEpubData(options.cachePath);
  const previousEntry = previousEntries.find((entry) => entry.filename === filename) || null;

  if (!options.force && previousEntry && isCacheEntryCurrent(previousEntry, fileStat)) {
    return previousEntry;
  }

  const nextEntry = await extractMetadataForFile(filePath, fileStat);
  if (previousEntry && !haveEntriesChanged(previousEntry, nextEntry)) {
    return previousEntry;
  }

  const nextEntries = previousEntries.filter((entry) => entry.filename !== filename);
  nextEntries.push(nextEntry);
  await writeCachedEpubData(options.cachePath, nextEntries);
  return nextEntry;
}

async function removeEpubMetadataForFile(filename, options = {}) {
  const previousEntries = await readCachedEpubData(options.cachePath);
  const nextEntries = previousEntries.filter((entry) => entry.filename !== filename);

  if (nextEntries.length === previousEntries.length) {
    return false;
  }

  await writeCachedEpubData(options.cachePath, nextEntries);
  return true;
}

async function getEpubs(options = {}) {
  const { includeInvalid = false, cachePath } = options;
  const data = await readCachedEpubData(cachePath);

  return includeInvalid ? data : data.filter((epub) => epub.isValid !== false);
}

async function getEpubByFilename(filename, options = {}) {
  const epubs = await getEpubs({
    includeInvalid: options.includeInvalid,
    cachePath: options.cachePath
  });

  return epubs.find((epub) => epub && epub.filename === filename) || null;
}

module.exports = {
  extractEpubData,
  upsertEpubMetadataForFile,
  removeEpubMetadataForFile,
  getEpubs,
  getEpubByFilename
};
