const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const { findLongestValidPrefix } = require('./dictionaryUtils');

const SKIPPED_TAGS = new Set(['img', 'script', 'style', 'svg', 'math', 'code', 'pre']);
const SAFE_XML_ENTITY_PATTERN = /&(?!(?:#\d+|#x[a-fA-F0-9]+|[a-zA-Z][\w.-]*);)/g;
const XML_ENTITY_TOKEN_PATTERN = /&(?:#\d+|#x[a-fA-F0-9]+|[a-zA-Z][\w.-]*);/g;

function escapeXmlTextContent(value) {
  return String(value || '')
    .replace(SAFE_XML_ENTITY_PATTERN, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildProcessedPlainText(text, dictionary, shouldBold) {
  if (!shouldBold) {
    return escapeXmlTextContent(text);
  }

  let lastIndex = 0;
  const parts = [];
  const wordPattern = /\b([a-zA-Z'-]+)/g;
  let match;

  while ((match = wordPattern.exec(text)) !== null) {
    const [word] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(escapeXmlTextContent(text.slice(lastIndex, matchIndex)));
    }

    const prefixLength = findLongestValidPrefix(word, dictionary);
    let midpoint = Math.floor(word.length / 2);

    if (midpoint < 1) {
      midpoint = 1;
    }

    const boldLength = prefixLength > 0 && prefixLength >= midpoint && word.length > 1
      ? prefixLength
      : midpoint;

    parts.push(`<b>${escapeXmlTextContent(word.slice(0, boldLength))}</b>${escapeXmlTextContent(word.slice(boldLength))}`);
    lastIndex = matchIndex + word.length;
  }

  if (lastIndex < text.length) {
    parts.push(escapeXmlTextContent(text.slice(lastIndex)));
  }

  return parts.join('');
}

function buildProcessedText(text, dictionary, shouldBold) {
  let lastIndex = 0;
  const parts = [];
  let match;

  while ((match = XML_ENTITY_TOKEN_PATTERN.exec(text)) !== null) {
    const entity = match[0];
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(buildProcessedPlainText(text.slice(lastIndex, matchIndex), dictionary, shouldBold));
    }

    parts.push(entity);
    lastIndex = matchIndex + entity.length;
  }

  if (lastIndex < text.length) {
    parts.push(buildProcessedPlainText(text.slice(lastIndex), dictionary, shouldBold));
  }

  return parts.join('');
}

function processTextNodes($, element, dictionary, shouldBold = true) {
  $(element).contents().each(function () {
    if (this.type === 'text') {
      // Replace &nbsp; with a regular space
      const text = (this.data || '').replace(/\u00A0/g, ' ');

      if (!text.trim()) {
        return;
      }

      const processedText = buildProcessedText(text, dictionary, shouldBold);

      // Load the processed text into a new cheerio instance to ensure tags are correctly formed
      const wrappedText = cheerio.load(`<root>${processedText}</root>`, {
        xmlMode: true,
        decodeEntities: false
      });
      $(this).replaceWith(wrappedText('root').html() || '');
    } else if (this.type === 'tag') {
      processTextNodes($, this, dictionary, shouldBold && !SKIPPED_TAGS.has((this.tagName || '').toLowerCase()));
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
