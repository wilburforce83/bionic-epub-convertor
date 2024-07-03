const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

async function extractResources(epubPath, outputPath) {
  const zip = new AdmZip(epubPath);
  zip.extractAllTo(outputPath, true);
}

async function createEpub(resourcesPath, outputPath) {
  try {
    const zip = new AdmZip();
    zip.addLocalFile(path.join(resourcesPath, 'mimetype'));
    zip.addLocalFolder(resourcesPath, 'OEBPS');
    zip.writeZip(outputPath);

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
