const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const JSZip = require('jszip');

const MAX_ARCHIVE_ENTRIES = Number(process.env.MAX_EPUB_ARCHIVE_ENTRIES || 5000);
const MAX_EXTRACT_BYTES = Number(process.env.MAX_EPUB_EXTRACT_BYTES || 300 * 1024 * 1024);

function resolveZipEntryPath(outputPath, entryName) {
  const normalizedEntryName = entryName.replace(/\\/g, '/');

  if (!normalizedEntryName || normalizedEntryName.startsWith('/') || normalizedEntryName.includes('../')) {
    throw new Error(`Unsafe archive entry path: ${entryName}`);
  }

  const resolvedOutputPath = path.resolve(outputPath);
  const resolvedEntryPath = path.resolve(outputPath, normalizedEntryName);

  if (resolvedEntryPath !== resolvedOutputPath && !resolvedEntryPath.startsWith(`${resolvedOutputPath}${path.sep}`)) {
    throw new Error(`Archive entry escapes extraction directory: ${entryName}`);
  }

  return resolvedEntryPath;
}

async function extractResources(epubPath, outputPath) {
  const zip = new AdmZip(epubPath);
  const entries = zip.getEntries();

  if (!entries.length) {
    throw new Error('The EPUB archive is empty.');
  }

  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`The EPUB archive contains too many entries (${entries.length}).`);
  }

  let totalExtractedBytes = 0;

  for (const entry of entries) {
    const entryPath = resolveZipEntryPath(outputPath, entry.entryName);

    if (entry.isDirectory) {
      await fs.ensureDir(entryPath);
      continue;
    }

    const fileData = zip.readFile(entry);
    if (!fileData) {
      continue;
    }

    totalExtractedBytes += fileData.length;
    if (totalExtractedBytes > MAX_EXTRACT_BYTES) {
      throw new Error('The EPUB archive expands beyond the configured extraction limit.');
    }

    await fs.ensureDir(path.dirname(entryPath));
    await fs.writeFile(entryPath, fileData);
  }
}

async function createEpub(resourcesPath, outputPath) {
  try {
    const zip = new JSZip();

    // Add the mimetype file (must be first and uncompressed)
    zip.file('mimetype', 'application/epub+zip', { compression: "STORE" });

    // Recursively add files and directories to the zip archive
    async function addFilesFromDirectory(directory, parentZipFolder = '') {
      const items = await fs.readdir(directory, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(directory, item.name);
        if (item.isDirectory()) {
          // Recursively handle directories
          const dirZipPath = parentZipFolder
            ? path.posix.join(parentZipFolder, item.name)
            : item.name;
          await addFilesFromDirectory(itemPath, dirZipPath);
        } else {
          if (!parentZipFolder && item.name === 'mimetype') {
            continue;
          }

          // Read file and add to zip
          const fileData = await fs.readFile(itemPath);
          const zipPath = parentZipFolder
            ? path.posix.join(parentZipFolder, item.name)
            : item.name;
          zip.file(zipPath, fileData, { binary: true });
        }
      }
    }

    // Start adding files from the resources directory
    await addFilesFromDirectory(resourcesPath);

    // Generate zip content as a Buffer
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: {
          level: 9
      }
    });

    // Write the Buffer to the output path
    await fs.writeFile(outputPath, buffer);

    console.log(`${buffer.length} total bytes`);
    console.log('EPUB file has been created successfully.');

    return { success: true, outputPath };
  } catch (err) {
    console.error('Error creating EPUB:', err);
    return { success: false, message: 'Error creating EPUB file.' };
  }
}


module.exports = {
  resolveZipEntryPath,
  extractResources,
  createEpub
};
