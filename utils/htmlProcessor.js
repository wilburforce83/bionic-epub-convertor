const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const { findLongestValidPrefix } = require('./dictionaryUtils');

const SKIPPED_TAGS = new Set(['img', 'script', 'style', 'svg', 'math', 'code', 'pre']);

function processTextNodes($, element, dictionary) {
  $(element).contents().each(function () {
    if (this.type === 'text') {
      // Replace &nbsp; with a regular space
      const text = (this.data || '').replace(/\u00A0/g, ' ');

      if (!text.trim()) {
        return;
      }

      const processedText = text.replace(/\b([a-zA-Z'-]+)/g, function (word) {
        const prefixLength = findLongestValidPrefix(word, dictionary);
        var midpoint = Math.floor(word.length / 2);

        if (midpoint < 1) {
          midpoint = 1;
        }

        if (prefixLength > 0 && prefixLength >= midpoint && word.length > 1) {
          return `<b>${word.slice(0, prefixLength)}</b>${word.slice(prefixLength)}`;
        } else {
          return `<b>${word.slice(0, midpoint)}</b>${word.slice(midpoint)}`;
        }
      });

      // Load the processed text into a new cheerio instance to ensure tags are correctly formed
      const wrappedText = cheerio.load(`<root>${processedText}</root>`, {
        xmlMode: true,
        decodeEntities: false
      });
      $(this).replaceWith(wrappedText('root').html() || '');
    } else if (this.type === 'tag' && !SKIPPED_TAGS.has((this.tagName || '').toLowerCase())) {
      processTextNodes($, this, dictionary); // Recursively process child nodes, skip images
    }
  });
}

function cleanHtml($) {
  $('span').each(function () {
    if (!$(this).attr('style')) {
      $(this).replaceWith($(this).html()); // Unwrap span tags without attributes
    }
  });

  $('b').each(function () {
    if ($(this).children().length === 1 && $(this).children().first().is('b')) {
      $(this).replaceWith($(this).html()); // Unwrap nested bold tags
    }
  });
}

async function processContent(filePath, dictionary) {
  const content = await fs.readFile(filePath, 'utf-8');
  const $ = cheerio.load(content, { xmlMode: true, decodeEntities: false });
  const body = $('body');

  if (body.length) {
    body.each(function () {
      processTextNodes($, this, dictionary);
    });
  } else if ($.root().children().length) {
    processTextNodes($, $.root(), dictionary);
  } else {
    return { processed: false, reason: 'missing-content' };
  }

  cleanHtml($);

  await fs.writeFile(filePath, $.xml(), 'utf-8');
  return { processed: true };
}

async function processHtmlFiles(dir, dictionary) {
  const result = {
    processedFiles: 0,
    skippedFiles: 0,
    errors: []
  };

  const files = await fs.readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      const nestedResult = await processHtmlFiles(filePath, dictionary);
      result.processedFiles += nestedResult.processedFiles;
      result.skippedFiles += nestedResult.skippedFiles;
      result.errors.push(...nestedResult.errors);
    } else if (/\.(html|xhtml)$/i.test(file.name)) {
      try {
        const processedResult = await processContent(filePath, dictionary);
        if (processedResult.processed) {
          result.processedFiles += 1;
        } else {
          result.skippedFiles += 1;
        }
      } catch (error) {
        result.errors.push({
          filePath,
          message: error.message
        });
      }
    }
  }

  return result;
}

module.exports = {
  processHtmlFiles
};
