const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const JSZip = require('jszip');

async function createZipArchive(outputPath, entries) {
  await fs.ensureDir(path.dirname(outputPath));

  const zip = new AdmZip();
  for (const entry of entries) {
    zip.addFile(entry.name, Buffer.from(entry.content || '', 'utf-8'));
  }

  zip.writeZip(outputPath);
  return outputPath;
}

async function createMinimalEpub(outputPath, options = {}) {
  const {
    title = 'Test Book',
    author = 'Test Author',
    chapterText = 'This is a test chapter.',
    chapterFileName = 'chapter1.xhtml',
    chapterMarkup,
    coverFileName,
    coverImageBase64,
    extraFiles = []
  } = options;

  await fs.ensureDir(path.dirname(outputPath));

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
  const manifestItems = [
    `<item id="chapter1" href="${chapterFileName}" media-type="application/xhtml+xml"/>`
  ];
  const metadataExtras = [];

  if (coverFileName && coverImageBase64) {
    manifestItems.push(
      `<item id="cover-image" href="${coverFileName}" media-type="${getMediaTypeFromFilename(coverFileName)}" properties="cover-image"/>`
    );
    metadataExtras.push('<meta name="cover" content="cover-image"/>');
  }

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:identifier id="BookId">urn:uuid:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}</dc:identifier>
    <dc:language>en</dc:language>
    ${metadataExtras.join('\n    ')}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`
  );
  zip.file(
    `OEBPS/${chapterFileName}`,
    chapterMarkup || `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <p>${chapterText}</p>
  </body>
</html>`
  );

  if (coverFileName && coverImageBase64) {
    zip.file(`OEBPS/${coverFileName}`, Buffer.from(coverImageBase64, 'base64'));
  }

  for (const extraFile of extraFiles) {
    if (!extraFile || !extraFile.fileName) {
      continue;
    }

    const encoding = extraFile.encoding === 'base64' ? 'base64' : 'utf-8';
    zip.file(`OEBPS/${extraFile.fileName}`, Buffer.from(extraFile.content || '', encoding));
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

function getMediaTypeFromFilename(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
    default:
      return 'image/png';
  }
}

module.exports = {
  createMinimalEpub,
  createZipArchive
};
