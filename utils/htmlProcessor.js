const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const { findLongestValidPrefix } = require('./dictionaryUtils');

function processTextNodes($, element, dictionary) {
  $(element).contents().each(function () {
    if (this.type === 'text') {
      const processedText = $(this).text().replace(/\b([a-zA-Z'-]+)/g, function (word) {
        const prefixLength = findLongestValidPrefix(word, dictionary);

        if (prefixLength > 0 && prefixLength > 3) {
          return `<b>${word.slice(0, prefixLength)}</b>${word.slice(prefixLength)}`;
        } else {
          const midpoint = Math.ceil(word.length / 2);
          return `<b>${word.slice(0, midpoint)}</b>${word.slice(midpoint)}`;
        }
      });

      $(this).replaceWith(processedText);
    } else if (this.type === 'tag' && this.tagName !== 'img') {
      processTextNodes($, this, dictionary); // Recursively process child nodes, skip images
    }
  });
}

async function processContent(filePath, dictionary) {
  const content = await fs.readFile(filePath, 'utf-8');
  const $ = cheerio.load(content);

  $('p, span, div').each(function () {
    processTextNodes($, this, dictionary);
  });

  await fs.writeFile(filePath, $.html(), 'utf-8');
}

async function processHtmlFiles(dir, dictionary) {
  const files = await fs.readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      await processHtmlFiles(filePath, dictionary);
    } else if (file.endsWith('.html') || file.endsWith('.xhtml')) {
      await processContent(filePath, dictionary);
    }
  }
}

module.exports = {
  processHtmlFiles
};
