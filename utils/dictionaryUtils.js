const fs = require('fs-extra');
const path = require('path');

async function loadDictionary(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return new Set(data.split(/\r?\n/));
}

function findLongestValidPrefix(word, dictionary) {
  let longestPrefixLength = 0;

  for (let i = word.length; i > 0; i--) {
    if (dictionary.has(word.slice(0, i))) {
      longestPrefixLength = i;
      break;
    }
  }

  const maxAllowedLength = Math.floor(word.length / 1.7);
  if (longestPrefixLength > maxAllowedLength) {
    return maxAllowedLength;
  }

  return longestPrefixLength;
}


module.exports = {
  loadDictionary,
  findLongestValidPrefix
};
