const fs = require('fs-extra');
const path = require('path');

function isLibraryBookFilename(filename) {
  return path.extname(String(filename || '')).toLowerCase() === '.epub';
}

async function listLibraryBookFilenames(libraryDir) {
  const entries = await fs.readdir(libraryDir);
  const filenames = [];

  for (const entry of entries) {
    const filePath = path.join(libraryDir, entry);
    const stats = await fs.stat(filePath);

    if (stats.isFile() && isLibraryBookFilename(entry)) {
      filenames.push(entry);
    }
  }

  return filenames.sort((left, right) => left.localeCompare(right));
}

async function deleteLibraryBookFiles(libraryDir, filenames) {
  const deletedFilenames = [];

  for (const filename of filenames) {
    const safeFilename = path.basename(String(filename || ''));

    if (safeFilename !== filename || !isLibraryBookFilename(safeFilename)) {
      continue;
    }

    const filePath = path.join(libraryDir, safeFilename);
    if (!(await fs.pathExists(filePath))) {
      continue;
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      continue;
    }

    await fs.remove(filePath);
    deletedFilenames.push(safeFilename);
  }

  return deletedFilenames;
}

function filterReadingProgressEntries(entries, shouldRemove) {
  const sourceEntries = entries && typeof entries === 'object' ? entries : {};
  const nextEntries = {};
  let removedCount = 0;

  Object.entries(sourceEntries).forEach(([key, entry]) => {
    if (shouldRemove(entry, key)) {
      removedCount += 1;
      return;
    }

    nextEntries[key] = entry;
  });

  return { nextEntries, removedCount };
}

function removeReadingProgressForFilename(entries, filename) {
  return filterReadingProgressEntries(entries, (entry) => entry && entry.filename === filename);
}

function removeReadingProgressForUserAndFilename(entries, user, filename) {
  const currentKey = `${user.id}::${filename}`;
  const legacyKey = `${user.username}::${filename}`;

  return filterReadingProgressEntries(entries, (entry, key) => {
    if (!entry || entry.filename !== filename) {
      return false;
    }

    return key === currentKey ||
      key === legacyKey ||
      entry.userId === user.id ||
      entry.userId === user.username ||
      entry.username === user.username;
  });
}

module.exports = {
  deleteLibraryBookFiles,
  isLibraryBookFilename,
  listLibraryBookFilenames,
  removeReadingProgressForFilename,
  removeReadingProgressForUserAndFilename
};
