const fs = require('fs-extra');
const path = require('path');

async function loadDictionary(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return new Set(data.split(/\r?\n/));
}

function findLongestValidPrefix(word, dictionary) {
  for (let i = word.length; i > 0; i--) {
    if (dictionary.has(word.slice(0, i))) {
      return i;
    }
  }
  return 0;
}

module.exports = {
  loadDictionary,
  findLongestValidPrefix
};
