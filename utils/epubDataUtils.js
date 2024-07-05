const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const sizeOf = require('image-size');

const epubDataPath = path.join(__dirname, '..', 'processed', 'epubData.json');

async function extractEpubData(processedDir) {
  const epubFiles = await fs.readdir(processedDir);
  const epubData = [];

  for (const file of epubFiles) {
    const filePath = path.join(processedDir, file);
    const fileStat = await fs.stat(filePath);

    if (fileStat.isFile() && file.endsWith('.epub')) {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      const metaData = { filename: file };

      zipEntries.forEach(entry => {
        if (entry.entryName.includes('cover') && (entry.entryName.endsWith('.jpg') || entry.entryName.endsWith('.jpeg') || entry.entryName.endsWith('.png') || entry.entryName.endsWith('.gif')|| entry.entryName.endsWith('.svg'))) {
          const imgBuffer = zip.readFile(entry);
          const dimensions = sizeOf(imgBuffer);
          metaData.cover = `data:image/${dimensions.type};base64,${imgBuffer.toString('base64')}`;
        }

        if (entry.entryName.includes('content.opf')) {
          const content = zip.readAsText(entry);
          const titleMatch = content.match(/<dc:title>([^<]*)<\/dc:title>/);
          const authorMatch = content.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/);

          if (titleMatch) metaData.title = titleMatch[1];
          if (authorMatch) metaData.author = authorMatch[1];
        }
      });

      epubData.push(metaData);
    }
  }

  await fs.writeJson(epubDataPath, epubData);
}

async function getEpubs() {
  if (await fs.pathExists(epubDataPath)) {
    return fs.readJson(epubDataPath);
  } else {
    return [];
  }
}

module.exports = { extractEpubData, getEpubs };
