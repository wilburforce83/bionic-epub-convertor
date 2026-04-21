const fs = require('fs-extra');
const path = require('path');

function isUploadBookFilename(filename) {
  return path.extname(String(filename || '')).toLowerCase() === '.epub';
}

async function listUploadBookPaths(uploadsDir) {
  const resolvedUploadsDir = path.resolve(String(uploadsDir || '.'));

  if (!(await fs.pathExists(resolvedUploadsDir))) {
    return [];
  }

  const discoveredPaths = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile() || !isUploadBookFilename(entry.name)) {
        continue;
      }

      discoveredPaths.push(path.resolve(entryPath));
    }
  }

  await walk(resolvedUploadsDir);

  discoveredPaths.sort((left, right) => (
    path.relative(resolvedUploadsDir, left).localeCompare(path.relative(resolvedUploadsDir, right))
  ));

  return discoveredPaths;
}

module.exports = {
  isUploadBookFilename,
  listUploadBookPaths
};
