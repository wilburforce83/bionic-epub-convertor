require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const cron = require('node-cron');
const { v2: webdav } = require('webdav-server');
const session = require('express-session');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const SimpleJsonDB = require('simple-json-db');
const AdmZip = require('adm-zip');
const xml = require('xmlbuilder');

const { loadDictionary } = require('./utils/dictionaryUtils');
const { extractResources, createEpub } = require('./utils/fileUtils');
const { processHtmlFiles } = require('./utils/htmlProcessor');
const { extractEpubData, getEpubs } = require('./utils/epubDataUtils');

const app = express();
const rootDir = __dirname;
const db = new SimpleJsonDB(path.join(rootDir, 'db', 'db.json'));
const readingProgressDb = new SimpleJsonDB(path.join(rootDir, 'db', 'reading-progress.json'));

const defaultUploadsDir = path.join(rootDir, 'uploads');
const defaultProcessedDir = path.join(rootDir, 'processed');
const tempDir = path.join(rootDir, 'temp');
const resourcesDir = path.join(tempDir, 'resources');
const incomingTempDir = path.join(tempDir, 'incoming');
const failedDir = path.join(rootDir, 'failed');
const dictionaryFilePath = path.join(rootDir, 'dictionary.txt');

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 100 * 1024 * 1024);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;

function parsePort(value, fallback, key) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }

  if (value !== undefined && value !== null && value !== '') {
    console.warn(`Invalid port for ${key}, falling back to ${fallback}.`);
  }

  return fallback;
}

function resolveDirectorySetting(value, fallback, key) {
  if (!value) {
    return fallback;
  }

  if (!path.isAbsolute(value)) {
    console.warn(`Ignoring non-absolute ${key} setting: ${value}`);
    return fallback;
  }

  return value;
}

function normalizeBaseUrl(value) {
  if (!value) {
    return '';
  }

  const trimmedValue = String(value).trim().replace(/\/+$/, '');
  if (!trimmedValue) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `http://${trimmedValue}`;
}

function readConfigValue(envKey, dbKey) {
  return process.env[envKey] || (dbKey && db.has(dbKey) ? db.get(dbKey) : '');
}

const THEME_COLOR_OPTIONS = [
  { key: 'ember', label: 'Ember', hex: '#d05834' },
  { key: 'cobalt', label: 'Cobalt', hex: '#4668df' },
  { key: 'teal', label: 'Teal', hex: '#0f8c7c' },
  { key: 'gold', label: 'Gold', hex: '#b77a22' },
  { key: 'plum', label: 'Plum', hex: '#8f55b6' }
];
const THEME_COLOR_MAP = Object.fromEntries(THEME_COLOR_OPTIONS.map((option) => [option.key, option]));
const DEFAULT_THEME_COLOR = 'ember';

function normalizeThemeColorKey(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return THEME_COLOR_MAP[normalizedValue] ? normalizedValue : DEFAULT_THEME_COLOR;
}

function getThemeColorSetting() {
  return normalizeThemeColorKey(readConfigValue('THEME_COLOR', 'themeColor'));
}

function getPublicAppConfig() {
  return {
    success: true,
    defaultThemeMode: 'dark',
    themeColor: getThemeColorSetting(),
    themeColors: THEME_COLOR_OPTIONS
  };
}

const uploadsDir = resolveDirectorySetting(
  readConfigValue('UPLOAD_PATH', 'uploadPath'),
  defaultUploadsDir,
  'uploadPath'
);
const processedDir = resolveDirectorySetting(
  readConfigValue('LIBRARY_PATH', 'libraryPath'),
  defaultProcessedDir,
  'libraryPath'
);
const webdavPort = parsePort(readConfigValue('WEBDAV_PORT', 'webdavPort'), 1900, 'webdavPort');
const PORT = parsePort(readConfigValue('MAIN_PORT', 'opdsPort'), 3000, 'opdsPort');
const webdavUsername = String(readConfigValue('WEBDAV_USERNAME', 'webdavUsername') || '').trim();
const webdavPassword = String(readConfigValue('WEBDAV_PASSWORD', 'webdavPassword') || '').trim();
const sessionSecret = String(readConfigValue('SESSION_SECRET', 'sessionSecret') || '').trim();
const configuredBaseUrl = normalizeBaseUrl(readConfigValue('BASE_URL', 'baseUrl'));
const allowServerRestart = process.env.ALLOW_SERVER_RESTART === 'true';

if (!webdavUsername || !webdavPassword) {
  throw new Error('WEBDAV_USERNAME and WEBDAV_PASSWORD must be configured before starting Dyslibria.');
}

if (!sessionSecret) {
  throw new Error('SESSION_SECRET must be configured before starting Dyslibria.');
}

app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto'
  }
}));

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: incomingTempDir,
  createParentPath: true,
  abortOnLimit: true,
  limits: {
    fileSize: MAX_UPLOAD_BYTES
  }
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.static(path.join(rootDir, 'public')));

function safeCompareStrings(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function credentialsMatch(username, password) {
  return safeCompareStrings(username, webdavUsername) && safeCompareStrings(password, webdavPassword);
}

function parseBasicAuthHeader(req) {
  const authHeader = req.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch (error) {
    return null;
  }
}

function isSessionAuthenticated(req) {
  return req.session && req.session.authenticated === true;
}

function shouldRedirectToLogin(req) {
  const extension = path.extname(String(req.path || '')).toLowerCase();
  if (extension && extension !== '.html') {
    return false;
  }

  const fetchDest = req.get('sec-fetch-dest');
  if (fetchDest && !['document', 'iframe', 'empty'].includes(fetchDest)) {
    return false;
  }

  if (String(req.path || '').startsWith('/api/')) {
    return false;
  }

  return Boolean(req.accepts('html'));
}

function respondUnauthenticated(req, res) {
  if (shouldRedirectToLogin(req)) {
    res.redirect('/login');
    return;
  }

  if (String(req.path || '').startsWith('/api/') || req.accepts('json')) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  res.status(401).type('text/plain').send('Authentication required.');
}

function isAuthenticated(req, res, next) {
  if (isSessionAuthenticated(req)) {
    next();
    return;
  }

  respondUnauthenticated(req, res);
}

function requireCatalogAuth(req, res, next) {
  if (isSessionAuthenticated(req)) {
    next();
    return;
  }

  const credentials = parseBasicAuthHeader(req);
  if (credentials && credentialsMatch(credentials.username, credentials.password)) {
    next();
    return;
  }

  res.set('WWW-Authenticate', 'Basic realm="Dyslibria Catalog"');
  res.status(401).json({ success: false, message: 'Authentication required.' });
}

function createRateLimiter({ windowMs, maxAttempts, keyFn }) {
  const attempts = new Map();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const timestamps = (attempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

    if (timestamps.length >= maxAttempts) {
      res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
      return;
    }

    timestamps.push(now);
    attempts.set(key, timestamps);
    next();
  };
}

const loginRateLimiter = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  maxAttempts: LOGIN_MAX_ATTEMPTS,
  keyFn: (req) => req.ip
});

function sanitizeFileStem(fileName) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const sanitized = baseName
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);

  return sanitized || 'book';
}

function sanitizeEpubFilename(requestedFilename) {
  const filename = path.basename(String(requestedFilename || ''));

  if (filename !== requestedFilename || path.extname(filename).toLowerCase() !== '.epub') {
    return null;
  }

  return filename;
}

function getReadingProgressUser(req) {
  if (req.session && typeof req.session.username === 'string' && req.session.username.trim()) {
    return req.session.username.trim();
  }

  return webdavUsername;
}

function getReadingProgressKey(userId, filename) {
  return `${userId}::${filename}`;
}

function readStoredProgress(userId, filename) {
  const storedValue = readingProgressDb.get(getReadingProgressKey(userId, filename));
  if (!storedValue || typeof storedValue !== 'object') {
    return null;
  }

  return storedValue;
}

function sanitizeProgressPayload(payload) {
  const location = typeof payload.location === 'string' ? payload.location.trim() : '';
  if (!location || location.length > 4096) {
    throw new Error('A valid reading location is required.');
  }

  const progressPercent = Number(payload.progressPercent);
  const safeProgressPercent = Number.isFinite(progressPercent)
    ? Math.max(0, Math.min(100, Math.round(progressPercent)))
    : 0;

  const pageNumber = Number(payload.pageNumber);
  const totalPages = Number(payload.totalPages);

  return {
    location,
    progressPercent: safeProgressPercent,
    chapterLabel: String(payload.chapterLabel || '').trim().slice(0, 400),
    pageLabel: String(payload.pageLabel || '').trim().slice(0, 200),
    pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.round(pageNumber) : null,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.round(totalPages) : null,
    href: String(payload.href || '').trim().slice(0, 400),
    title: String(payload.title || '').trim().slice(0, 300),
    author: String(payload.author || '').trim().slice(0, 300)
  };
}

const queuedUploadPaths = new Set();
const queuedOutputFilenames = new Set();
const watcherIgnoredPaths = new Set();
const fileQueue = [];
const conversionLogs = [];
let isProcessing = false;
let dictionaryPromise = null;

function appendConversionLog(level, message) {
  conversionLogs.push({
    id: uuidv4(),
    level,
    message,
    timestamp: new Date().toISOString()
  });

  if (conversionLogs.length > 250) {
    conversionLogs.splice(0, conversionLogs.length - 250);
  }
}

function getRuntimeStatus() {
  return {
    processing: isProcessing,
    queueLength: fileQueue.length,
    logs: conversionLogs.slice().reverse()
  };
}

async function getMetadataReady() {
  return fs.pathExists(path.join(rootDir, 'db', 'epubData.json'));
}

async function ensureDirectoriesExist() {
  await fs.ensureDir(uploadsDir);
  await fs.ensureDir(processedDir);
  await fs.ensureDir(tempDir);
  await fs.ensureDir(resourcesDir);
  await fs.ensureDir(incomingTempDir);
  await fs.ensureDir(failedDir);
  await fs.ensureDir(path.join(rootDir, 'db'));
}

async function getDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = loadDictionary(dictionaryFilePath);
  }

  return dictionaryPromise;
}

function validateArchiveEntries(entries) {
  if (!entries.length) {
    throw new Error('The uploaded EPUB archive is empty.');
  }

  if (!entries.some((entry) => entry.entryName === 'mimetype')) {
    throw new Error('The EPUB archive is missing the mimetype file.');
  }

  if (!entries.some((entry) => entry.entryName === 'META-INF/container.xml')) {
    throw new Error('The EPUB archive is missing META-INF/container.xml.');
  }
}

function validateUploadedEpub(epubFile) {
  if (!epubFile || !epubFile.tempFilePath) {
    throw new Error('No uploaded file data was found.');
  }

  if (path.extname(epubFile.name || '').toLowerCase() !== '.epub') {
    throw new Error('Only .epub files are supported.');
  }

  const zip = new AdmZip(epubFile.tempFilePath);
  const entries = zip.getEntries();
  validateArchiveEntries(entries);

  const mimetypeEntry = zip.getEntry('mimetype');
  const mimetype = zip.readAsText(mimetypeEntry).trim();
  if (mimetype !== 'application/epub+zip') {
    throw new Error('The uploaded archive does not look like a valid EPUB.');
  }
}

async function allocateOutputFilename(originalName) {
  const stem = sanitizeFileStem(originalName);
  let candidate = `${stem}.epub`;
  let suffix = 1;

  while (
    queuedOutputFilenames.has(candidate) ||
    (await fs.pathExists(path.join(processedDir, candidate)))
  ) {
    candidate = `${stem}-${suffix}.epub`;
    suffix += 1;
  }

  return candidate;
}

function enqueueFile(job) {
  if (queuedUploadPaths.has(job.uploadPath) || queuedOutputFilenames.has(job.outputFilename)) {
    return false;
  }

  queuedUploadPaths.add(job.uploadPath);
  queuedOutputFilenames.add(job.outputFilename);
  fileQueue.push(job);

  if (!isProcessing) {
    void processNextFile();
  }

  appendConversionLog('info', `Queued ${job.outputFilename} for conversion.`);

  return true;
}

async function quarantineFailedUpload(job) {
  const quarantinePath = path.join(
    failedDir,
    `${path.basename(job.outputFilename, '.epub')}-${job.id}.epub`
  );

  if (await fs.pathExists(job.uploadPath)) {
    await fs.move(job.uploadPath, quarantinePath, { overwrite: true });
  }
}

async function processEpubJob(job) {
  let quarantined = false;
  const tempOutputPath = path.join(tempDir, `${job.id}.epub`);
  const finalOutputPath = path.join(processedDir, job.outputFilename);

  try {
    console.log(`Starting to process EPUB file: ${job.uploadPath}`);
    appendConversionLog('info', `Starting conversion for ${job.outputFilename}.`);

    await ensureDirectoriesExist();
    await fs.emptyDir(resourcesDir);

    await extractResources(job.uploadPath, resourcesDir);

    const dictionary = await getDictionary();
    const processingResult = await processHtmlFiles(resourcesDir, dictionary);

    if (processingResult.errors.length > 0) {
      const firstError = processingResult.errors[0];
      throw new Error(`HTML processing failed in ${firstError.filePath}: ${firstError.message}`);
    }

    if (processingResult.processedFiles === 0) {
      throw new Error('No HTML or XHTML content files were found to convert.');
    }

    const createResult = await createEpub(resourcesDir, tempOutputPath);
    if (!createResult.success) {
      throw new Error(createResult.message);
    }

    await fs.move(tempOutputPath, finalOutputPath, { overwrite: true });
    await extractEpubData(processedDir);
    console.log(`Successfully processed: ${job.uploadPath}`);
    appendConversionLog('success', `Finished converting ${job.outputFilename}.`);
  } catch (error) {
    console.error(`Error processing EPUB ${job.uploadPath}: ${error.message}`, error);
    appendConversionLog('error', `Failed converting ${job.outputFilename}: ${error.message}`);
    await fs.remove(tempOutputPath);
    await quarantineFailedUpload(job);
    quarantined = true;
  } finally {
    queuedUploadPaths.delete(job.uploadPath);
    queuedOutputFilenames.delete(job.outputFilename);

    if (!quarantined) {
      await fs.remove(job.uploadPath);
    }
  }
}

async function processNextFile() {
  if (isProcessing) {
    return;
  }

  const nextJob = fileQueue.shift();
  if (!nextJob) {
    return;
  }

  isProcessing = true;

  try {
    await processEpubJob(nextJob);
  } finally {
    isProcessing = false;

    if (fileQueue.length > 0) {
      setTimeout(() => {
        void processNextFile();
      }, 250);
    }
  }
}

async function handleWatchedUpload(filePath) {
  if (watcherIgnoredPaths.has(filePath)) {
    watcherIgnoredPaths.delete(filePath);
    return;
  }

  if (path.extname(filePath).toLowerCase() !== '.epub') {
    return;
  }

  const outputFilename = await allocateOutputFilename(path.basename(filePath));
  enqueueFile({
    id: uuidv4(),
    uploadPath: filePath,
    outputFilename
  });
  appendConversionLog('info', `Detected new upload ${path.basename(filePath)}.`);
}

function startUploadsWatcher() {
  chokidar.watch(uploadsDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  }).on('add', (filePath) => {
    void handleWatchedUpload(filePath);
  });
}

function getBaseUrl(req) {
  return configuredBaseUrl || `${req.protocol}://${req.get('host')}`;
}

function createStableId(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function createOpdsFeed(epubs, baseUrl) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const feedId = `urn:sha1:${createStableId(`${normalizedBaseUrl}:${processedDir}`)}`;
  const feed = xml.create('feed', { encoding: 'UTF-8' })
    .att('xmlns', 'http://www.w3.org/2005/Atom')
    .att('xmlns:dc', 'http://purl.org/dc/terms/')
    .att('xmlns:opds', 'http://opds-spec.org/2010/catalog')
    .ele('title', 'Dyslibria Library').up()
    .ele('id', feedId).up()
    .ele('updated', new Date().toISOString()).up()
    .ele('author')
      .ele('name', 'Dyslibria').up()
    .up()
    .ele('link')
      .att('rel', 'self')
      .att('href', `${normalizedBaseUrl}/opds`)
      .att('type', 'application/atom+xml;profile=opds-catalog;kind=navigation').up()
    .ele('link')
      .att('rel', 'start')
      .att('href', `${normalizedBaseUrl}/opds`)
      .att('type', 'application/atom+xml;profile=opds-catalog;kind=navigation').up();

  epubs.forEach((epub) => {
    const lastModified = new Date(epub.lastModified);
    const validLastModified = Number.isNaN(lastModified.getTime()) ? new Date() : lastModified;
    const entryId = `urn:sha1:${createStableId(epub.filename)}`;

    const entry = feed.ele('entry');
    entry.ele('title', epub.title || epub.filename).up();

    if (epub.author) {
      entry.ele('author').ele('name', epub.author).up().up();
    }

    entry.ele('id', entryId).up();
    entry.ele('updated', validLastModified.toISOString()).up();
    entry.ele('content', { type: 'text' }, `Available: ${epub.filename}`).up();
    entry.ele('link')
      .att('rel', 'http://opds-spec.org/acquisition/open-access')
      .att('href', `${normalizedBaseUrl}/epub/${encodeURIComponent(epub.filename)}`)
      .att('type', 'application/epub+zip').up();
  });

  return feed.end({ pretty: true });
}

function normalizeSettingsUpdate(payload) {
  const updates = {};

  if (payload.webdavPort !== undefined) {
    updates.webdavPort = String(parsePort(payload.webdavPort, webdavPort, 'webdavPort'));
  }

  if (payload.opdsPort !== undefined) {
    updates.opdsPort = String(parsePort(payload.opdsPort, PORT, 'opdsPort'));
  }

  if (payload.uploadPath !== undefined) {
    const uploadPath = String(payload.uploadPath || '').trim();
    if (uploadPath && !path.isAbsolute(uploadPath)) {
      throw new Error('Upload path must be absolute.');
    }

    updates.uploadPath = uploadPath;
  }

  if (payload.libraryPath !== undefined) {
    const libraryPath = String(payload.libraryPath || '').trim();
    if (libraryPath && !path.isAbsolute(libraryPath)) {
      throw new Error('Library path must be absolute.');
    }

    updates.libraryPath = libraryPath;
  }

  if (payload.baseUrl !== undefined) {
    updates.baseUrl = normalizeBaseUrl(payload.baseUrl);
  }

  if (payload.themeColor !== undefined) {
    updates.themeColor = normalizeThemeColorKey(payload.themeColor);
  }

  return updates;
}

// Basic route to serve the login page
app.get('/healthz', async (req, res) => {
  const metadataReady = await getMetadataReady();

  res.json({
    status: 'ok',
    processing: isProcessing,
    queueLength: fileQueue.length,
    metadataReady
  });
});

app.get('/api/app-config', (req, res) => {
  res.json(getPublicAppConfig());
});

app.get('/api/system-status', isAuthenticated, async (req, res) => {
  const metadataReady = await getMetadataReady();
  const runtimeStatus = getRuntimeStatus();
  res.json({
    success: true,
    metadataReady,
    processing: runtimeStatus.processing,
    queueLength: runtimeStatus.queueLength,
    logCount: runtimeStatus.logs.length,
    latestLog: runtimeStatus.logs[0] || null
  });
});

app.get('/api/conversion-logs', isAuthenticated, (req, res) => {
  res.json({
    success: true,
    logs: getRuntimeStatus().logs
  });
});

app.delete('/api/conversion-logs', isAuthenticated, (req, res) => {
  conversionLogs.length = 0;
  res.json({ success: true });
});

app.get('/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(rootDir, 'public', 'login.html'));
});

// Handle login
app.post('/login', loginRateLimiter, async (req, res) => {
  const { username = '', password = '' } = req.body;

  if (!credentialsMatch(username, password)) {
    res.redirect('/login');
    return;
  }

  req.session.regenerate((error) => {
    if (error) {
      console.error('Error regenerating session after login:', error);
      res.status(500).send('Unable to start session.');
      return;
    }

    req.session.authenticated = true;
    req.session.username = username;
    req.session.save((saveError) => {
      if (saveError) {
        console.error('Error saving session after login:', saveError);
        res.status(500).send('Unable to persist session.');
        return;
      }

      res.redirect('/authenticated/index.html');
    });
  });
});

// Root route that redirects to login if not authenticated
app.get('/', isAuthenticated, (req, res) => {
  res.redirect('/authenticated/index.html');
});

// Serve authenticated content
app.use('/authenticated', isAuthenticated, express.static(path.join(rootDir, 'authenticated')));
app.use('/processed', requireCatalogAuth, express.static(processedDir));

// Route to get the list of EPUBs
app.get('/epubs', requireCatalogAuth, async (req, res) => {
  try {
    const epubs = await getEpubs();
    epubs.sort((a, b) => {
      const authorA = a.author || '';
      const authorB = b.author || '';
      return authorA.localeCompare(authorB);
    });
    res.json(epubs);
  } catch (err) {
    console.error('Error fetching EPUBs:', err);
    res.status(500).json({ success: false, message: 'Error fetching EPUBs.' });
  }
});

// Route to serve EPUB files
app.get('/epub/:filename', requireCatalogAuth, async (req, res) => {
  const filename = sanitizeEpubFilename(req.params.filename);

  if (!filename) {
    res.status(400).json({ success: false, message: 'Invalid EPUB file name.' });
    return;
  }

  res.sendFile(filename, { root: processedDir }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ success: false, message: 'EPUB file not found.' });
    }
  });
});

app.get('/api/reading-progress', isAuthenticated, (req, res) => {
  const userId = getReadingProgressUser(req);
  const entries = Object.values(readingProgressDb.JSON())
    .filter((entry) => entry && entry.userId === userId && entry.filename)
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || 0) || 0;
      const rightTime = Date.parse(right.updatedAt || 0) || 0;
      return rightTime - leftTime;
    });

  res.json({
    success: true,
    progress: entries
  });
});

app.get('/api/reading-progress/:filename', isAuthenticated, (req, res) => {
  const filename = sanitizeEpubFilename(req.params.filename);

  if (!filename) {
    res.status(400).json({ success: false, message: 'Invalid EPUB file name.' });
    return;
  }

  const userId = getReadingProgressUser(req);
  const progress = readStoredProgress(userId, filename);
  res.json({ success: true, progress });
});

app.post('/api/reading-progress/:filename', isAuthenticated, async (req, res) => {
  const filename = sanitizeEpubFilename(req.params.filename);

  if (!filename) {
    res.status(400).json({ success: false, message: 'Invalid EPUB file name.' });
    return;
  }

  const epubPath = path.join(processedDir, filename);
  if (!(await fs.pathExists(epubPath))) {
    res.status(404).json({ success: false, message: 'EPUB file not found.' });
    return;
  }

  try {
    const sanitizedProgress = sanitizeProgressPayload(req.body || {});
    const userId = getReadingProgressUser(req);
    const storedRecord = {
      ...sanitizedProgress,
      filename,
      userId,
      updatedAt: new Date().toISOString()
    };

    readingProgressDb.set(getReadingProgressKey(userId, filename), storedRecord);
    res.json({ success: true, progress: storedRecord });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Invalid reading progress payload.' });
  }
});

// Route to update the EPUB database
app.post('/update-database', isAuthenticated, async (req, res) => {
  try {
    appendConversionLog('info', 'Manual library refresh requested.');
    await extractEpubData(processedDir);
    appendConversionLog('success', 'Library metadata refresh completed.');
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating database:', err);
    appendConversionLog('error', `Library refresh failed: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error updating database.' });
  }
});

// Route to upload and process EPUB files
app.post('/upload', isAuthenticated, async (req, res) => {
  if (!req.files || !req.files.epubFiles) {
    res.status(400).json({ success: false, message: 'No EPUB files were uploaded.' });
    return;
  }

  const epubFiles = Array.isArray(req.files.epubFiles) ? req.files.epubFiles : [req.files.epubFiles];
  const stagedJobs = [];
  const queuedFiles = [];

  try {
    for (const epubFile of epubFiles) {
      validateUploadedEpub(epubFile);
    }

    for (const epubFile of epubFiles) {
      const outputFilename = await allocateOutputFilename(epubFile.name);
      const uploadPath = path.join(uploadsDir, `${uuidv4()}.epub`);
      watcherIgnoredPaths.add(uploadPath);
      setTimeout(() => watcherIgnoredPaths.delete(uploadPath), 30000);

      await epubFile.mv(uploadPath);
      stagedJobs.push({
        id: uuidv4(),
        uploadPath,
        outputFilename
      });

      if (epubFile.tempFilePath && epubFile.tempFilePath !== uploadPath) {
        await fs.remove(epubFile.tempFilePath);
      }
    }

    for (const job of stagedJobs) {
      enqueueFile(job);
      queuedFiles.push(job.outputFilename);
    }
  } catch (err) {
    console.error('Error handling uploaded EPUB file:', err);
    appendConversionLog('error', `Upload rejected: ${err.message || 'Invalid EPUB file.'}`);

    for (const epubFile of epubFiles) {
      if (epubFile.tempFilePath) {
        await fs.remove(epubFile.tempFilePath);
      }
    }

    for (const job of stagedJobs) {
      watcherIgnoredPaths.delete(job.uploadPath);
      await fs.remove(job.uploadPath);
    }

    res.status(400).json({ success: false, message: err.message || 'Invalid EPUB file.' });
    return;
  }

  res.json({
    success: true,
    message: 'EPUB files uploaded successfully.',
    queuedFiles
  });
  appendConversionLog('info', `Accepted ${queuedFiles.length} upload${queuedFiles.length === 1 ? '' : 's'} into the conversion queue.`);
});

// Route to get settings
app.get('/settings', isAuthenticated, (req, res) => {
  try {
    res.json({
      webdavPort: String(webdavPort),
      opdsPort: String(PORT),
      uploadPath: uploadsDir,
      libraryPath: processedDir,
      baseUrl: configuredBaseUrl,
      themeColor: getThemeColorSetting(),
      themeColors: THEME_COLOR_OPTIONS
    });
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ success: false, message: 'Error fetching settings.' });
  }
});

// Route to update settings
app.post('/settings', isAuthenticated, (req, res) => {
  try {
    const currentSettings = db.JSON();
    const updates = normalizeSettingsUpdate(req.body);
    const restartSensitiveKeys = ['webdavPort', 'opdsPort', 'uploadPath', 'libraryPath', 'baseUrl'];
    const requiresRestart = Object.keys(updates).some((key) => restartSensitiveKeys.includes(key));

    db.JSON({
      ...currentSettings,
      ...updates
    });
    db.sync();
    res.json({ success: true, requiresRestart });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(400).json({ success: false, message: err.message || 'Error updating settings.' });
  }
});

// Route to restart the server
app.post('/restart-server', isAuthenticated, (req, res) => {
  if (!allowServerRestart) {
    res.status(501).json({
      success: false,
      message: 'Server restart is disabled. Restart the process manually.'
    });
    return;
  }

  res.json({ success: true, message: 'Server is restarting...' });
  setTimeout(() => {
    execFile('pm2', ['restart', 'dyslibria'], (error, stdout, stderr) => {
      if (error) {
        console.error(`PM2 restart error: ${error.message}`);
        return;
      }

      if (stdout) {
        console.log(`pm2 stdout: ${stdout}`);
      }

      if (stderr) {
        console.error(`pm2 stderr: ${stderr}`);
      }
    });
  }, 1000);
});

// Schedule the database update every 4 hours
cron.schedule('0 */4 * * *', async () => {
  try {
    await extractEpubData(processedDir);
    console.log('Database updated successfully');
  } catch (err) {
    console.error('Error updating database:', err);
  }
});

// OPDS route
app.get('/opds', requireCatalogAuth, async (req, res) => {
  try {
    const epubs = await getEpubs();
    const feed = createOpdsFeed(epubs, getBaseUrl(req));
    res.type('application/atom+xml').send(feed);
  } catch (err) {
    console.error('Error generating OPDS feed:', err);
    res.status(500).send('Failed to generate OPDS feed');
  }
});

async function startApplication() {
  await ensureDirectoriesExist();
  await extractEpubData(processedDir);
  startUploadsWatcher();

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

  const webdavServer = new webdav.WebDAVServer({
    httpAuthentication: new webdav.HTTPBasicAuthentication((user, pass, callback) => {
      callback(credentialsMatch(user, pass));
    }),
    privilegeManager: new webdav.SimplePathPrivilegeManager()
  });

  webdavServer.setFileSystem('/processed', new webdav.PhysicalFileSystem(processedDir), (success) => {
    if (success) {
      console.log('WebDAV server is serving the processed folder.');
    } else {
      console.error('Failed to set up the WebDAV file system.');
    }
  });

  webdavServer.start(webdavPort);
  console.log(`WebDAV server is running on http://localhost:${webdavPort}`);
}

startApplication().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
