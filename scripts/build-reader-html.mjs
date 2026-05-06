import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReaderDocument } from '@wilburforce83/reader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.resolve(repoRoot, 'authenticated/reader.html');

const html = renderReaderDocument({
  assetBasePath: '.',
  appThemeScriptUrl: '/app-theme.js',
  extraStylesheetHrefs: ['semantic.min.css'],
  extraScriptUrls: ['pwa.js'],
  manifestHref: '/manifest.json',
  faviconHref: '/favicon.ico',
  appleTouchIconHref: '/icons/apple-touch-icon.png',
  documentTitle: 'Dyslibria Reader',
  shell: {
    bookQueryParam: 'file',
    bookIdTemplate: '{fileStem}',
    bookTitleTemplate: '{bookTitle}',
    epubUrlTemplate: '/epubs/{file}',
    progressUrlTemplate: '/api/reading-progress/{file}',
    appConfigUrl: '/api/app-config',
    closeUrl: 'index.html',
    showCloseButton: true,
    persistSettings: true,
    persistLocation: true,
    persistProgress: true,
    settingsStorageKey: 'dyslibria:reader-settings:v1',
    locationStorageKeyTemplate: 'dyslibria:reader:{file}',
    loadingEyebrow: 'Reading now',
    loadingDetail: 'Preparing reader shell',
    progressEyebrow: 'Reading progress',
    progressDetail: 'Reading progress saves automatically.',
    closeLabel: 'Close book',
  },
});

fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Generated packaged reader document at ${outputPath}`);
