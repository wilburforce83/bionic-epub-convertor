import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const packageEntryPath = require.resolve('@wilburforce83/reader', {
  paths: [repoRoot],
});
const packageRoot = path.resolve(path.dirname(packageEntryPath), '..');
const sourceDir = path.resolve(packageRoot, 'dist/assets');
const targetDir = path.resolve(repoRoot, 'authenticated');
const assetEntries = [
  'reader.css',
  'reader.js',
  'epub.js',
  'jszip.min.js',
  path.join('themes', 'default', 'assets', 'reader_textures'),
];

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Reader asset bundle was not found at ${sourceDir}`);
}

for (const entryName of assetEntries) {
  const sourcePath = path.resolve(sourceDir, entryName);
  const targetPath = path.resolve(targetDir, entryName);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Expected packaged reader asset is missing: ${sourcePath}`);
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

console.log(`Synced packaged reader assets into ${targetDir}`);
