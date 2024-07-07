const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const cron = require('node-cron');
const { v2: webdav } = require('webdav-server');
const session = require('express-session');
const bodyParser = require('body-parser');
const { loadDictionary } = require('./utils/dictionaryUtils');
const { extractResources, createEpub } = require('./utils/fileUtils');
const { processHtmlFiles } = require('./utils/htmlProcessor');
const { extractEpubData, getEpubs } = require('./utils/epubDataUtils');
const SimpleJsonDB = require('simple-json-db');
const AdmZip = require('adm-zip');
const xml = require('xmlbuilder');
const app = express();
const rootDir = __dirname;
var uploadsDir = path.join(rootDir, 'uploads');
var processedDir = path.join(rootDir, 'processed');
const tempDir = path.join(rootDir, 'temp');
const resourcesDir = path.join(tempDir, 'resources');
const dictionaryFilePath = path.join(rootDir, 'dictionary.txt');
var webdavPort = process.env.WEBDAV_PORT || 1900;
var PORT = process.env.MAIN_PORT || 3000;
const webdavUsername = process.env.WEBDAV_USERNAME || "dys";
const webdavPassword = process.env.WEBDAV_PASSWORD || "password";
console.log(webdavUsername, webdavPassword);
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const BASE_URL = process.env.BASE_URL || 'localhost:' + PORT;


const result = dotenv.config();

if (result.error) {
  console.error('Dotenv config error:', result.error);
} else {
  console.log('Dotenv config success:', result.parsed);
}

// Initialize SimpleJsonDB for settings
const db = new SimpleJsonDB(path.join('./db/db.json'));

if (db.has('webdavPort')) {
  webdavPort = db.get('webdavPort');
  console.log('using saved webdav port: ', webdavPort);
}

if (db.has('libraryPath')) {
  processedDir = db.get('libraryPath');
  console.log('using saved processed path: ', processedDir);
}

if (db.has('uploadPath')) {
  uploadsDir = db.get('uploadPath');
  console.log('using saved processed path: ', uploadsDir);
}

if (db.has('opdsPort')) {
  PORT = db.get('opdsPort');
  console.log('using saved port: ', PORT);
}

// Session middleware
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // set secure to true if using https
}));

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Middleware to handle file uploads
app.use(fileUpload());
app.use(express.static(path.join(rootDir, 'public')));
app.use('/processed', express.static(processedDir));

// Middleware to protect authenticated routes
function isAuthenticated(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Ensure directories exist
async function ensureDirectoriesExist() {
  await fs.ensureDir(uploadsDir);
  await fs.ensureDir(processedDir);
  await fs.ensureDir(tempDir);
  await fs.ensureDir(resourcesDir);
}

// Basic route to serve the login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'login.html'));
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('username :', username);
  console.log('password :', password);
  if (username === webdavUsername && password === webdavPassword) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login');
  }
});

// Root route that redirects to login if not authenticated
app.get('/', isAuthenticated, (req, res) => {
  res.redirect('/authenticated/index.html');
});

// Serve authenticated content
app.use('/authenticated', isAuthenticated, express.static(path.join(rootDir, 'authenticated')));
app.use('/epub', express.static(processedDir));

// Route to get the list of EPUBs
app.get('/epubs', async (req, res) => {
  try {
    const epubs = await getEpubs();
    // Sort epubs by author name alphabetically, ensuring no undefined values
    epubs.sort((a, b) => {
      const authorA = a.author || ''; // Default to empty string if undefined
      const authorB = b.author || ''; // Default to empty string if undefined
      return authorA.localeCompare(authorB);
    });
    res.json(epubs);
  } catch (err) {
    console.error('Error fetching EPUBs:', err);
    res.status(500).json({ success: false, message: 'Error fetching EPUBs.' });
  }
});


// Route to serve EPUB files
app.get('/epub/:filename', (req, res) => {
  const { filename } = req.params;
  const epubPath = path.join(processedDir, filename);
  res.sendFile(epubPath, err => {
    if (err) {
      res.status(404).json({ success: false, message: 'EPUB file not found.' });
    }
  });
});

// Route to update the EPUB database
app.post('/update-database', isAuthenticated, async (req, res) => {
  try {
    await extractEpubData(processedDir);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating database:', err);
    res.status(500).json({ success: false, message: 'Error updating database.' });
  }
});

// Route to upload and process EPUB files
app.post('/upload', isAuthenticated, async (req, res) => {
  if (!req.files || !req.files.epubFiles) {
    return res.status(400).json({ success: false, message: 'No EPUB files were uploaded.' });
  }

  const epubFiles = Array.isArray(req.files.epubFiles) ? req.files.epubFiles : [req.files.epubFiles];

  for (const epubFile of epubFiles) {
    const uploadPath = path.join(uploadsDir, epubFile.name);

    // Validate EPUB file
    try {
      const zip = new AdmZip(epubFile.data);
      zip.getEntries(); // This will throw if the zip file is invalid
    } catch (err) {
      console.error('Invalid EPUB file:', err);
      return res.status(400).json({ success: false, message: 'Invalid EPUB file.' });
    }

    // Add the file to the queue if it's not already there
    if (!fileQueue.includes(uploadPath)) {
      try {
        // Save the uploaded file
        await epubFile.mv(uploadPath);
        fileQueue.push(uploadPath);
      } catch (err) {
        console.error('Error saving EPUB file:', err);
        return res.status(500).json({ success: false, message: 'Error saving EPUB file.' });
      }
    }
  }

  if (!isProcessing) {
    processNextFile();
  }

  res.json({ success: true, message: 'EPUB files uploaded successfully.' });
});

// Function to process EPUB file
async function processEpubFile() {
  if (fileQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const epubPath = fileQueue.shift(); // Dequeue the next file to process

  const processedPath = path.join(processedDir, `${path.basename(epubPath)}`);

  try {
    console.log(`Starting to process EPUB file: ${epubPath}`);

    // Ensure directories exist
    await ensureDirectoriesExist();

    // Clear temp folder
    await fs.emptyDir(resourcesDir);

    console.log(`Extracting resources from: ${epubPath}`);
    // Extract resources from the original EPUB
    await extractResources(epubPath, resourcesDir);

    // Load the dictionary
    console.log(`Loading dictionary from: ${dictionaryFilePath}`);
    const dictionary = await loadDictionary(dictionaryFilePath);

    // Process HTML files within the resources folder
    console.log(`Processing HTML files in: ${resourcesDir}`);
    await processHtmlFiles(resourcesDir, dictionary);

    // Create new EPUB with processed content
    console.log(`Creating new EPUB: ${processedPath}`);
    const result = await createEpub(resourcesDir, processedPath, epubPath);

    if (result.success) {
      console.log(`Successfully processed: ${epubPath}`);
      await extractEpubData(processedDir); // Update the EPUB data after processing
    } else {
      console.error(`Error processing ${epubPath}: ${result.message}`);
    }
  } catch (err) {
    console.error(`Error processing EPUB: ${err.message}`, err);
  } finally {
    // Delete the file from uploads directory
    try {
      await fs.remove(epubPath);
      console.log(`Deleted file from uploads directory: ${epubPath}`);
    } catch (err) {
      console.error('Error deleting EPUB file:', err);
    }

    // Delay before processing the next file
    setTimeout(processNextFile, 1000); // Adjust the delay as needed
  }
}

const fileQueue = [];
let isProcessing = false;

// Process next file in the queue
function processNextFile() {
  if (fileQueue.length === 0) {
    isProcessing = false;
    return;
  }
  isProcessing = true;
  const nextFile = fileQueue[0];
  processEpubFile(nextFile);
}

/// Watch for new files in the uploads directory
chokidar.watch(uploadsDir).on('add', (filePath) => {
  console.log(`File ${filePath} has been added`);
  if (!fileQueue.includes(filePath) && fs.existsSync(filePath)) {
    fileQueue.push(filePath);
    if (!isProcessing) {
      processNextFile();
    }
  }
});

// Route to get settings
app.get('/settings', isAuthenticated, (req, res) => {
  try {
    const settings = db.JSON();
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ success: false, message: 'Error fetching settings.' });
  }
});

// Route to update settings
app.post('/settings', isAuthenticated, (req, res) => {
  try {
    const settings = req.body;
    console.log(settings);
    db.JSON(settings);
    db.sync();
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ success: false, message: 'Error updating settings.' });
  }
});

// Route to restart the server
app.post('/restart-server', isAuthenticated, (req, res) => {
  res.json({ success: true, message: 'Server is restarting...' });
  setTimeout(() => {
    exec('pm2 restart dyslibria', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });
  }, 1000); // Delay to ensure the response is sent before the server restarts
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

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// WebDAV Configuration
const webdavServer = new webdav.WebDAVServer({
  httpAuthentication: new webdav.HTTPBasicAuthentication((user, pass, callback) => {
    callback(user === webdavUsername && pass === webdavPassword);
  }),
  privilegeManager: new webdav.SimplePathPrivilegeManager()
});

// Set up the file system to serve
webdavServer.setFileSystem('/processed', new webdav.PhysicalFileSystem(processedDir), (success) => {
  if (success) {
    console.log(`WebDAV server is serving the "processed" folder.`);
  } else {
    console.error('Failed to set up the file system.');
  }
});

// Start the WebDAV server
webdavServer.start(webdavPort);
console.log(`WebDAV server is running on http://localhost:${webdavPort}`);


///OPDS





function createOpdsFeed(epubs) {
  const feed = xml.create({
    feed: {
      '@xmlns': 'http://www.w3.org/2005/Atom',
      '@xmlns:dc': 'http://purl.org/dc/terms/',
      '@xmlns:opds': 'http://opds-spec.org/2010/catalog',
      title: { '#text': 'My eBook Library' },
      id: { '#text': `urn:uuid:${uuidv4()}` },
      updated: { '#text': new Date().toISOString() },
      author: {
        name: { '#text': 'Your Library Name' }
      },
      link: [
        { '@rel': 'self', '@href': `${BASE_URL}/opds`, '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation' },
        { '@rel': 'start', '@href': `${BASE_URL}/opds`, '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation' }
      ]
    }
  });

  const entries = epubs.map(epub => {
    const lastModified = new Date(epub.lastModified);
    const validLastModified = isNaN(lastModified.getTime()) ? new Date() : lastModified;

    return {
      entry: {
        title: { '#text': epub.title },
        id: { '#text': `urn:uuid:${uuidv4()}` },
        updated: { '#text': validLastModified.toISOString() },
        content: { '@type': 'text', '#text': `Available: ${epub.filename}` },
        link: {
          '@rel': 'http://opds-spec.org/acquisition',
          '@href': `${BASE_URL}/epub/${encodeURIComponent(epub.filename)}`,
          '@type': 'application/epub+zip'
        }
      }
    };
  });

  feed.ele(entries);
  return feed.end({ pretty: true });
}


// OPDS route
app.get('/opds', async (req, res) => {
  try {
    const epubs = await getEpubs(); // Reuse your existing function to get the list of EPUBs
    const feed = createOpdsFeed(epubs);
    res.type('application/atom+xml').send(feed);
  } catch (err) {
    console.error('Error generating OPDS feed:', err);
    res.status(500).send('Failed to generate OPDS feed');
  }
});


