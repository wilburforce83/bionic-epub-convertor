const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');

const { createEpub, resolveZipEntryPath } = require('../utils/fileUtils');
const { processHtmlFiles } = require('../utils/htmlProcessor');
const { extractEpubData, getEpubs } = require('../utils/epubDataUtils');
const {
  deleteLibraryBookFiles,
  listLibraryBookFilenames,
  removeReadingProgressForUserAndFilename
} = require('../utils/libraryMaintenance');
const { createMinimalEpub } = require('./helpers/epubTestUtils');

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmVsAAAAASUVORK5CYII=';

test('resolveZipEntryPath rejects zip-slip style archive entries', async () => {
  const tempDir = await makeTempDir('dyslibria-zip-slip-');
  const outputPath = path.join(tempDir, 'extracted');

  await assert.throws(
    () => resolveZipEntryPath(outputPath, '../escape.txt'),
    /Unsafe archive entry path|escapes extraction directory/
  );
  assert.equal(await fs.pathExists(path.join(tempDir, 'escape.txt')), false);
});

test('processHtmlFiles converts readable text but leaves preformatted blocks alone', async () => {
  const tempDir = await makeTempDir('dyslibria-html-');
  const filePath = path.join(tempDir, 'chapter.xhtml');

  await fs.writeFile(
    filePath,
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <p>This smoke test should be converted.</p>
    <pre>Literal sample text</pre>
  </body>
</html>`
  );

  const result = await processHtmlFiles(tempDir, new Set());
  const content = await fs.readFile(filePath, 'utf-8');

  assert.equal(result.processedFiles, 1);
  assert.deepEqual(result.errors, []);
  assert.match(content, /<p><b>Th<\/b>is <b>sm<\/b>oke <b>te<\/b>st/);
  assert.match(content, /<pre>Literal sample text<\/pre>/);
  assert.doesNotMatch(content, /<pre><b>/);
});

test('processHtmlFiles escapes stray ampersands without double-escaping valid entities', async () => {
  const tempDir = await makeTempDir('dyslibria-entities-');
  const filePath = path.join(tempDir, 'entities.xhtml');

  await fs.writeFile(
    filePath,
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <p>AT&T and Tom &amp; Jerry & Blues</p>
    <pre>R&D && Co.</pre>
  </body>
</html>`
  );

  const result = await processHtmlFiles(tempDir, new Set());
  const content = await fs.readFile(filePath, 'utf-8');

  assert.equal(result.processedFiles, 1);
  assert.deepEqual(result.errors, []);
  assert.match(content, /<b>A<\/b>T&amp;<b>T<\/b>/);
  assert.match(content, /<b>T<\/b>om &amp; <b>Je<\/b>rry &amp; <b>Bl<\/b>ues/);
  assert.match(content, /<pre>R&amp;D &amp;&amp; Co\.<\/pre>/);
  assert.doesNotMatch(content, /&amp;amp;/);
  assert.doesNotMatch(content, /&amp;<b>a<\/b>mp;/);
});

test('processHtmlFiles can handle XHTML fragments without a body wrapper', async () => {
  const tempDir = await makeTempDir('dyslibria-fragment-');
  const filePath = path.join(tempDir, 'fragment.xhtml');

  await fs.writeFile(filePath, '<p>Loose fragment text only.</p>');

  const result = await processHtmlFiles(tempDir, new Set());
  const content = await fs.readFile(filePath, 'utf-8');

  assert.equal(result.processedFiles, 1);
  assert.match(content, /<p><b>Lo<\/b>ose <b>frag<\/b>ment <b>te<\/b>xt <b>on<\/b>ly\.<\/p>/);
});

test('createEpub writes EPUB entry paths using forward slashes', async (t) => {
  t.mock.method(console, 'log', () => {});

  const tempDir = await makeTempDir('dyslibria-create-');
  const resourcesPath = path.join(tempDir, 'resources');
  const outputPath = path.join(tempDir, 'created.epub');

  await fs.ensureDir(path.join(resourcesPath, 'META-INF'));
  await fs.ensureDir(path.join(resourcesPath, 'OEBPS', 'Text'));
  await fs.writeFile(path.join(resourcesPath, 'mimetype'), 'application/epub+zip');
  await fs.writeFile(
    path.join(resourcesPath, 'META-INF', 'container.xml'),
    '<?xml version="1.0" encoding="UTF-8"?><container></container>'
  );
  await fs.writeFile(
    path.join(resourcesPath, 'OEBPS', 'Text', 'chapter.xhtml'),
    '<p>hello world</p>'
  );

  const result = await createEpub(resourcesPath, outputPath);
  const entryNames = new AdmZip(outputPath).getEntries().map((entry) => entry.entryName);

  assert.equal(result.success, true);
  assert.ok(entryNames.includes('OEBPS/Text/chapter.xhtml'));
  assert.equal(entryNames.some((entryName) => entryName.includes('\\')), false);
});

test('extractEpubData keeps invalid files on disk and filters them from normal listings', async (t) => {
  t.mock.method(console, 'error', () => {});

  const tempDir = await makeTempDir('dyslibria-metadata-');
  const processedDir = path.join(tempDir, 'processed');
  const cachePath = path.join(tempDir, 'db', 'epubData.json');

  await fs.ensureDir(processedDir);
  await createMinimalEpub(path.join(processedDir, 'VALID.EPUB'), {
    title: 'Valid Book',
    author: 'Codex'
  });
  await fs.writeFile(path.join(processedDir, 'broken.epub'), 'definitely not an epub');

  await extractEpubData(processedDir, { cachePath });

  const visibleBooks = await getEpubs({ cachePath });
  const allBooks = await getEpubs({ cachePath, includeInvalid: true });
  const brokenBook = allBooks.find((book) => book.filename === 'broken.epub');

  assert.equal(await fs.pathExists(path.join(processedDir, 'broken.epub')), true);
  assert.deepEqual(
    visibleBooks.map((book) => book.filename).sort(),
    ['VALID.EPUB']
  );
  assert.equal(allBooks.length, 2);
  assert.ok(brokenBook);
  assert.equal(brokenBook.isValid, false);
  assert.ok(brokenBook.processingError);
});

test('extractEpubData keeps an explicit cover image when the EPUB declares one in OPF metadata', async () => {
  const tempDir = await makeTempDir('dyslibria-cover-');
  const processedDir = path.join(tempDir, 'processed');
  const cachePath = path.join(tempDir, 'db', 'epubData.json');

  await fs.ensureDir(processedDir);
  await createMinimalEpub(path.join(processedDir, 'with-cover.epub'), {
    title: 'Cover Book',
    author: 'Codex',
    coverFileName: 'images/cover.png',
    coverImageBase64: tinyPngBase64
  });

  await extractEpubData(processedDir, { cachePath });

  const books = await getEpubs({ cachePath });

  assert.equal(books.length, 1);
  assert.equal(books[0].title, 'Cover Book');
  assert.equal(books[0].author, 'Codex');
  assert.match(books[0].cover, /^data:image\/png;base64,/);
});

test('libraryMaintenance lists and deletes only EPUB library files', async () => {
  const tempDir = await makeTempDir('dyslibria-library-delete-');
  const processedDir = path.join(tempDir, 'processed');

  await fs.ensureDir(processedDir);
  await createMinimalEpub(path.join(processedDir, 'keep.epub'));
  await createMinimalEpub(path.join(processedDir, 'remove.epub'));
  await fs.writeFile(path.join(processedDir, 'notes.txt'), 'not a book');

  const filenames = await listLibraryBookFilenames(processedDir);
  const deletedFilenames = await deleteLibraryBookFiles(processedDir, ['remove.epub', 'notes.txt']);

  assert.deepEqual(filenames, ['keep.epub', 'remove.epub']);
  assert.deepEqual(deletedFilenames, ['remove.epub']);
  assert.equal(await fs.pathExists(path.join(processedDir, 'keep.epub')), true);
  assert.equal(await fs.pathExists(path.join(processedDir, 'remove.epub')), false);
  assert.equal(await fs.pathExists(path.join(processedDir, 'notes.txt')), true);
});

test('libraryMaintenance removes both current and legacy reading progress keys for one user and filename', () => {
  const entries = {
    'user-1::book.epub': {
      filename: 'book.epub',
      userId: 'user-1',
      username: 'reader-one'
    },
    'reader-one::book.epub': {
      filename: 'book.epub',
      userId: 'reader-one',
      username: 'reader-one'
    },
    'user-1::other.epub': {
      filename: 'other.epub',
      userId: 'user-1',
      username: 'reader-one'
    },
    'user-2::book.epub': {
      filename: 'book.epub',
      userId: 'user-2',
      username: 'reader-two'
    }
  };

  const result = removeReadingProgressForUserAndFilename(entries, {
    id: 'user-1',
    username: 'reader-one'
  }, 'book.epub');

  assert.equal(result.removedCount, 2);
  assert.deepEqual(Object.keys(result.nextEntries).sort(), ['user-1::other.epub', 'user-2::book.epub']);
});
