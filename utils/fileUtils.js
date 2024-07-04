const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const xmlbuilder = require('xmlbuilder');

async function extractResources(epubPath, outputPath) {
  const zip = new AdmZip(epubPath);
  zip.extractAllTo(outputPath, true);
}

async function createEpub(resourcesPath, outputPath) {
  try {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    output.on('close', () => {
        console.log(`${archive.pointer()} total bytes`);
        console.log('EPUB file has been created successfully.');
    });

    archive.on('error', (err) => {
        throw err;
    });

    archive.pipe(output);

    // Add mimetype file (uncompressed)
    archive.append('application/epub+zip', { name: 'mimetype', store: true });

    // Add the rest of the files
    archive.directory(resourcesPath, false);

    // Finalize the archive
    archive.finalize();

    return { success: true, downloadUrl: `/processed/${path.basename(outputPath)}` };
  } catch (err) {
    console.error('Error creating EPUB:', err);
    return { success: false, message: 'Error creating EPUB file.' };
  }
}

module.exports = {
  extractResources,
  createEpub
};
