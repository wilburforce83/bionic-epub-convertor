const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs-extra');
const cron = require('node-cron');
const { v2: webdav } = require('webdav-server');
const session = require('express-session');
const bodyParser = require('body-parser');
const { loadDictionary } = require('./utils/dictionaryUtils');
const { extractResources, createEpub } = require('./utils/fileUtils');
const { processHtmlFiles } = require('./utils/htmlProcessor');
const { extractEpubData, getEpubs } = require('./utils/epubDataUtils');
const app = express();
const PORT = 3000;
const rootDir = __dirname;
const uploadsDir = path.join(rootDir, 'uploads');
const processedDir = path.join(rootDir, 'processed');
const tempDir = path.join(rootDir, 'temp');
const resourcesDir = path.join(tempDir, 'resources');
const dictionaryFilePath = path.join(rootDir, 'dictionary.txt');
const webdavPort = process.env.WEBDAV_PORT || 1900;
const webdavUsername = process.env.WEBDAV_USERNAME;
const webdavPassword = process.env.WEBDAV_PASSWORD;
console.log(webdavUsername, webdavPassword);

const result = dotenv.config();

if (result.error) {
  console.error('Dotenv config error:', result.error);
} else {
  console.log('Dotenv config success:', result.parsed);
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
  console.log('username :',username);
  console.log('password :',password);
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
    // Sort epubs by author name alphabetically
    epubs.sort((a, b) => a.author.localeCompare(b.author));
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

// Route to upload and process EPUB file
app.post('/upload', isAuthenticated, async (req, res) => {
  if (!req.files || !req.files.epubFile) {
    return res.status(400).json({ success: false, message: 'No EPUB file was uploaded.' });
  }

  const epubFile = req.files.epubFile;
  const uploadPath = path.join(uploadsDir, epubFile.name);
  const processedPath = path.join(processedDir, `processed-${epubFile.name}`);

  try {
    // Clear temp folder
    await fs.emptyDir(tempDir);

    // Ensure directories exist
    await ensureDirectoriesExist();

    // Save the uploaded file
    await epubFile.mv(uploadPath);

    // Extract resources from the original EPUB
    await extractResources(uploadPath, resourcesDir);

    // Load the dictionary
    const dictionary = await loadDictionary(dictionaryFilePath);

    // Process HTML files within the resources folder
    await processHtmlFiles(resourcesDir, dictionary);

    // Create new EPUB with processed content
    const result = await createEpub(resourcesDir, processedPath);

    if (result.success) {
      await extractEpubData(processedDir); // Update the EPUB data after processing
      res.json({ success: true, downloadUrl: result.downloadUrl });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  } catch (err) {
    console.error('Error processing EPUB:', err);
    res.status(500).json({ success: false, message: 'Error processing EPUB file.' });
  }
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
