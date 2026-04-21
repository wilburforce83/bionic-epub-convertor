const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');

const { isUploadBookFilename, listUploadBookPaths } = require('../utils/uploadDiscovery');

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('isUploadBookFilename matches epub files case-insensitively', () => {
  assert.equal(isUploadBookFilename('book.epub'), true);
  assert.equal(isUploadBookFilename('BOOK.EPUB'), true);
  assert.equal(isUploadBookFilename('notes.txt'), false);
});

test('listUploadBookPaths discovers nested EPUB files and ignores non-books', async () => {
  const tempDir = await makeTempDir('dyslibria-upload-scan-');
  const uploadsDir = path.join(tempDir, 'uploads');

  await fs.ensureDir(path.join(uploadsDir, 'batch-a'));
  await fs.ensureDir(path.join(uploadsDir, 'batch-b', 'nested'));
  await fs.writeFile(path.join(uploadsDir, 'root.epub'), 'root');
  await fs.writeFile(path.join(uploadsDir, 'batch-a', 'child.EPUB'), 'child');
  await fs.writeFile(path.join(uploadsDir, 'batch-b', 'nested', 'leaf.epub'), 'leaf');
  await fs.writeFile(path.join(uploadsDir, 'batch-b', 'nested', 'ignore.txt'), 'ignore');

  const discoveredPaths = await listUploadBookPaths(uploadsDir);

  assert.deepEqual(
    discoveredPaths.map((filePath) => path.relative(uploadsDir, filePath)),
    ['batch-a/child.EPUB', 'batch-b/nested/leaf.epub', 'root.epub']
  );
});

test('listUploadBookPaths returns an empty list for a missing uploads directory', async () => {
  const tempDir = await makeTempDir('dyslibria-upload-missing-');
  const missingUploadsDir = path.join(tempDir, 'missing');

  assert.deepEqual(await listUploadBookPaths(missingUploadsDir), []);
});
