const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs-extra');
const EpubGen = require('epub-gen');
const cheerio = require('cheerio');
const EPub = require('epub');
const AdmZip = require('adm-zip');

const app = express();
const PORT = 3000;

const dictionaryFilePath = path.join(__dirname, 'dictionary.txt');
const rootDir = __dirname;
const uploadsDir = path.join(rootDir, 'uploads');
const processedDir = path.join(rootDir, 'processed');
const tempDir = path.join(rootDir, 'temp');
const resourcesDir = path.join(tempDir, 'resources');

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

// Function to load the dictionary file into a Set for quick lookup
async function loadDictionary(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return new Set(data.split(/\r?\n/));
}

// Function to find the longest valid prefix
function findLongestValidPrefix(word, dictionary) {
  for (let i = word.length; i > 0; i--) {
    if (dictionary.has(word.slice(0, i))) {
      return i;
    }
  }
  return 0;
}

// Function to process text nodes within the chapter content
function processTextNodes($, element, dictionary) {
  $(element).contents().each(function () {
    if (this.type === 'text') {
      const processedText = $(this).text().replace(/\b([a-zA-Z'-]+)/g, function (word) {
        const prefixLength = findLongestValidPrefix(word, dictionary);

        if (prefixLength > 0 && prefixLength > 3) {
          return `<b>${word.slice(0, prefixLength)}</b>${word.slice(prefixLength)}`;
        } else {
          const midpoint = Math.ceil(word.length / 2);
          return `<b>${word.slice(0, midpoint)}</b>${word.slice(midpoint)}`;
        }
      });

      $(this).replaceWith(processedText);
    } else if (this.type === 'tag' && this.tagName !== 'img') {
      processTextNodes($, this, dictionary); // Recursively process child nodes, skip images
    }
  });
}

// Function to process the chapter content, ensuring only text nodes are modified
function processContent(html, dictionary) {
  const $ = cheerio.load(html);

  $('p, span, div').each(function () {
    processTextNodes($, this, dictionary);
  });

  return $.html();
}

// Function to get and process each chapter
async function getAndProcessChapters(epub, dictionary) {
  const sections = [];

  for (const section of epub.flow) {
    const chapterContent = await new Promise((resolve, reject) => {
      epub.getChapter(section.id, (err, text) => {
        if (err) {
          reject(err);
        } else {
          resolve(text);
        }
      });
    });

    const processedContent = processContent(chapterContent, dictionary);
    sections.push({
      title: section.title || 'Untitled',
      data: processedContent
    });
  }

  return sections;
}

// Function to extract resources from the EPUB file
async function extractResources(epubPath, outputPath) {
  const zip = new AdmZip(epubPath);
  zip.extractAllTo(outputPath, true);
}

// Function to adjust image paths in HTML content dynamically
function adjustImagePaths(html, baseDir) {
  const $ = cheerio.load(html);

  $('img').each(function () {
    const src = $(this).attr('src');
    if (src) {
      const resolvedPath = path.resolve(baseDir, src);
      const relativePath = path.relative(baseDir, resolvedPath).replace(/\\/g, '/');
      $(this).attr('src', relativePath);
    }
  });

  return $.html();
}

// Function to ensure all options are defined with default values
function ensureEpubOptions(options) {
  const defaultOptions = {
    title: 'Untitled',
    author: 'Unknown',
    content: [],
    output: null,
    version: 3,
    lang: 'en',
    tocTitle: 'Table of Contents',
    appendChapterTitles: true,
    tempDir: path.join(rootDir, 'temp', 'tempDir'),
  };

  return { ...defaultOptions, ...options };
}

// Function to handle errors while generating EPUB
async function generateEpub(options, processedPath, resourcesPath) {
  try {
    // Ensure options are defined
    const epubOptions = ensureEpubOptions(options);

    // Copy resources to the new EPUB
    const zip = new AdmZip();
    zip.addLocalFolder(resourcesPath, 'OEBPS');
    const tempEpubPath = path.join(rootDir, 'temp', 'temp.epub');
    zip.writeZip(tempEpubPath);

    epubOptions.tempDir = path.join(rootDir, 'temp', 'tempDir');

    console.log('EPub options:', epubOptions); // Debugging statement
    console.log('EPub content titles:', epubOptions.content.map(c => c.title)); // Debugging titles
    console.log('EPub content data first 100 chars:', epubOptions.content.map(c => (typeof c.data === 'string' ? c.data.substring(0, 100) : 'Invalid content data'))); // Debugging data

    await new EpubGen(epubOptions, processedPath).promise;
    fs.removeSync(tempEpubPath); // Clean up temporary EPUB file
    return { success: true, downloadUrl: `/processed/${path.basename(processedPath)}` };
  } catch (err) {
    console.error('Error generating EPUB:', err);
    return { success: false, message: 'Error generating EPUB file.' };
  }
}

// Function to clear temp folder
async function clearTempFolder() {
  try {
    await fs.emptyDir(tempDir);
  } catch (err) {
    console.error('Error clearing temp folder:', err);
  }
}

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
    await clearTempFolder();

    // Ensure directories exist
    await ensureDirectoriesExist();

    // Save the uploaded file
    await epubFile.mv(uploadPath);

    // Extract resources from the original EPUB
    await extractResources(uploadPath, resourcesDir);

    // Load the dictionary
    const dictionary = await loadDictionary(dictionaryFilePath);

    // Initialize the EPUB parser
    const epub = new EPub(uploadPath);

    epub.on('end', async function () {
      try {
        const sections = await getAndProcessChapters(epub, dictionary);

        // Adjust image paths in each section
        sections.forEach(section => {
          section.data = adjustImagePaths(section.data, resourcesDir);
        });

        const options = {
          title: epub.metadata.title || 'Untitled',
          author: epub.metadata.creator || 'Unknown',
          content: sections,
        };

        console.log('EPub sections:', sections); // Debugging statement

        const result = await generateEpub(options, processedPath, resourcesDir);

        if (result.success) {
          res.json({ success: true, downloadUrl: result.downloadUrl });
        } else {
          res.status(500).json({ success: false, message: result.message });
        }
      } catch (err) {
        console.error('Error processing chapters:', err);
        res.status(500).json({ success: false, message: 'Error processing EPUB file.' });
      }
    });

    epub.parse();
  } catch (err) {
    console.error('Error processing EPUB:', err);
    res.status(500).json({ success: false, message: 'Error processing EPUB file.' });
  }
});

// Test route to parse EPUB and return the content for debugging
app.post('/test-parse', async (req, res) => {
  if (!req.files || !req.files.epubFile) {
    return res.status(400).json({ success: false, message: 'No EPUB file was uploaded.' });
  }

  const epubFile = req.files.epubFile;
  const uploadPath = path.join(uploadsDir, epubFile.name);

  try {
    // Clear temp folder
    await clearTempFolder();

    // Ensure directories exist
    await ensureDirectoriesExist();

    // Save the uploaded file
    await epubFile.mv(uploadPath);

    // Extract resources from the original EPUB
    await extractResources(uploadPath, resourcesDir);

    // Load the dictionary
    const dictionary = await loadDictionary(dictionaryFilePath);

    // Initialize the EPUB parser
    const epub = new EPub(uploadPath);

    epub.on('end', async function () {
      try {
        const sections = await getAndProcessChapters(epub, dictionary);

        // Adjust image paths in each section
        sections.forEach(section => {
          section.data = adjustImagePaths(section.data, resourcesDir);
        });

        console.log('EPub sections:', sections); // Debugging statement

        res.json({ success: true, sections });
      } catch (err) {
        console.error('Error processing chapters:', err);
        res.status(500).json({ success: false, message: 'Error processing EPUB file.' });
      }
    });

    epub.parse();
  } catch (err) {
    console.error('Error processing EPUB:', err);
    res.status(500).json({ success: false, message: 'Error processing EPUB file.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
