const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const sanitizeHtml = require('sanitize-html');
const { findLongestValidPrefix } = require('./dictionaryUtils');

function processTextNodes($, element, dictionary) {
  $(element).contents().each(function () {
    if (this.type === 'text') {
      // Replace &nbsp; with a regular space
      let text = $(this).text().replace(/&nbsp;/g, ' ');

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
      const wrappedText = cheerio.load(processedText);
      $(this).replaceWith(wrappedText.html());
    } else if (this.type === 'tag' && this.tagName !== 'img') {
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
  const $ = cheerio.load(content, { xmlMode: true });

  // Extract the body content
  const bodyContent = $('body').html();

  // Load the body content into a new cheerio instance
  const body$ = cheerio.load(`<body>${bodyContent}</body>`, { xmlMode: true });

  // Process text nodes within the body content
  body$('p, span, div').each(function () {
    processTextNodes(body$, this, dictionary);
  });

  cleanHtml(body$); // Clean up redundant tags

  // Sanitize HTML to remove unnecessary whitespace and ensure well-formedness
  const sanitizedBody = sanitizeHtml(body$.html(), {
    allowedTags: false, // Allow all tags
    allowedAttributes: false, // Allow all attributes
    allowVulnerableTags: true
  });

  // Reassemble the final HTML
  $('body').html(sanitizedBody);
  const finalHtml = $.html();

  await fs.writeFile(filePath, finalHtml, 'utf-8'); // Save file with the same extension
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
