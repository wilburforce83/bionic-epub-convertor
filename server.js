const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const { loadDictionary } = require('./utils/dictionaryUtils');
const { extractResources, createEpub } = require('./utils/fileUtils');
const { processHtmlFiles } = require('./utils/htmlProcessor');

const app = express();
const PORT = 3000;

const rootDir = __dirname;
const uploadsDir = path.join(rootDir, 'uploads');
const processedDir = path.join(rootDir, 'processed');
const tempDir = path.join(rootDir, 'temp');
const resourcesDir = path.join(tempDir, 'resources');
const dictionaryFilePath = path.join(rootDir, 'dictionary.txt');

// Middleware to handle file uploads
app.use(fileUpload());
app.use(express.static(path.join(rootDir, 'public')));
app.use('/processed', express.static(processedDir));

// Ensure directories exist
async function ensureDirectoriesExist() {
  await fs.ensureDir(uploadsDir);
  await fs.ensureDir(processedDir);
  await fs.ensureDir(tempDir);
  await fs.ensureDir(resourcesDir);
}

// Basic route to serve a welcome message or HTML file
app.get('/', (req, res) => {
  res.send('Welcome to the EPUB processor. Use the /upload route to upload an EPUB file.');
});

// Route to upload and process EPUB file
app.post('/upload', async (req, res) => {
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
      res.json({ success: true, downloadUrl: result.downloadUrl });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  } catch (err) {
    console.error('Error processing EPUB:', err);
    res.status(500).json({ success: false, message: 'Error processing EPUB file.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
