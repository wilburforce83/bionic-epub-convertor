const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const JSZip = require('jszip');

async function extractResources(epubPath, outputPath) {
  const zip = new AdmZip(epubPath);
  zip.extractAllTo(outputPath, true);
}

async function createEpub(resourcesPath, outputPath, uploadPath) {
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
          const dirZipPath = path.join(parentZipFolder, item.name);
          await addFilesFromDirectory(itemPath, dirZipPath);
        } else {
          // Read file and add to zip
          const fileData = await fs.readFile(itemPath);
          zip.file(path.join(parentZipFolder, item.name), fileData, { binary: true });
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

    // Cleanup the upload path
    await fs.unlink(uploadPath);

    console.log(`${buffer.length} total bytes`);
    console.log('EPUB file has been created successfully.');

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
