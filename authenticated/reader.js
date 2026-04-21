(function () {
  const params = new URLSearchParams(window.location.search);
  const fileName = params.get('file');
  const requestedLocation = params.get('loc');

  const SETTINGS_STORAGE_KEY = 'dyslibria:reader-settings:v1';
  const LOCATION_STORAGE_KEY = fileName ? `dyslibria:reader:${fileName}` : '';

  const defaultSettings = {
    theme: 'paper',
    fontFamily: 'accessible',
    fontSize: 110,
    lineHeight: 1.6,
    pageMargin: 6.5,
    layout: 'auto',
    flow: 'paginated',
    disableDyslibria: false
  };

  let appPalette = window.DyslibriaTheme
    ? window.DyslibriaTheme.applyPalette(window.DyslibriaTheme.DEFAULT_COLOR_KEY, document.documentElement)
    : null;

  const fontOptions = [
    {
      id: 'accessible',
      name: 'Accessible Sans',
      family: '"Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif',
      note: 'Familiar humanist system stack with steady shapes.',
      preview: 'Calmer scanning with friendly familiar letterforms.'
    },
    {
      id: 'atkinson',
      name: 'Atkinson Hyperlegible',
      family: '"Atkinson Hyperlegible", "Avenir Next", "Segoe UI", sans-serif',
      note: 'Built for stronger character distinction and readability.',
      preview: 'Clearer letters help keep fast lines from blurring.'
    },
    {
      id: 'lexend',
      name: 'Lexend',
      family: '"Lexend", "Avenir Next", "Segoe UI", sans-serif',
      note: 'Open spacing and smoother pacing for visual tracking.',
      preview: 'Roomier word shapes can slow visual crowding down.'
    },
    {
      id: 'sourceSans',
      name: 'Source Sans 3',
      family: '"Source Sans 3", "Segoe UI", sans-serif',
      note: 'Balanced, low-noise sans for longer reading sessions.',
      preview: 'A calmer page texture keeps focus on the sentence.'
    },
    {
      id: 'publicSans',
      name: 'Public Sans',
      family: '"Public Sans", "Segoe UI", sans-serif',
      note: 'Crisp proportions with a confident, sturdy rhythm.',
      preview: 'Clean rhythm can make paragraphs feel less hectic.'
    },
    {
      id: 'notoSans',
      name: 'Noto Sans',
      family: '"Noto Sans", "Segoe UI", sans-serif',
      note: 'Consistent spacing with broad language coverage.',
      preview: 'Steady spacing supports quieter, more even reading.'
    },
    {
      id: 'ibmPlex',
      name: 'IBM Plex Sans',
      family: '"IBM Plex Sans", "Segoe UI", sans-serif',
      note: 'Compact clarity for readers who like sharper structure.',
      preview: 'Sharper contours can anchor attention on each line.'
    },
    {
      id: 'nunito',
      name: 'Nunito Sans',
      family: '"Nunito Sans", "Segoe UI", sans-serif',
      note: 'Rounded shapes for a softer, less rigid page feel.',
      preview: 'Softer curves can make dense pages feel more gentle.'
    },
    {
      id: 'merriweatherSans',
      name: 'Merriweather Sans',
      family: '"Merriweather Sans", "Trebuchet MS", sans-serif',
      note: 'Open counters with a slightly more literary texture.',
      preview: 'Readable warmth without losing structure or contrast.'
    },
    {
      id: 'literata',
      name: 'Literata',
      family: '"Literata", "Iowan Old Style", "Palatino Linotype", Georgia, serif',
      note: 'Thoughtful serif rhythm for readers who like a bookish page.',
      preview: 'Gentle serif texture can make long reading feel grounded.'
    },
    {
      id: 'sourceSerif',
      name: 'Source Serif 4',
      family: '"Source Serif 4", "Palatino Linotype", Georgia, serif',
      note: 'Clear contemporary serif with strong structure and calm flow.',
      preview: 'Sharper serifs can help word shapes feel more anchored.'
    },
    {
      id: 'figtree',
      name: 'Figtree',
      family: '"Figtree", "Avenir Next", "Segoe UI", sans-serif',
      note: 'Friendly modern shapes with clean, even word flow.',
      preview: 'Smooth curves and tidy spacing can reduce fatigue.'
    }
  ];

  const fontFamilies = Object.fromEntries(fontOptions.map(function (option) {
    return [option.id, option.family];
  }));

  const legacyFontAliases = {
    serif: 'literata',
    classic: 'ibmPlex'
  };

  const zoneConfig = {
    previousMaxX: 0.22,
    nextMinX: 0.78,
    settingsMinX: 0.24,
    settingsMaxX: 0.76,
    settingsMinY: 0.24,
    settingsMaxY: 0.62,
    progressMinX: 0.18,
    progressMaxX: 0.82,
    progressMinY: 0.66
  };

  const elements = {
    app: document.getElementById('readerApp'),
    viewerFrame: document.querySelector('.viewer-frame'),
    loadingTitle: document.getElementById('loadingTitle'),
    loadingMeta: document.getElementById('loadingMeta'),
    loadingProgressLabel: document.getElementById('loadingProgressLabel'),
    loadingProgressDetail: document.getElementById('loadingProgressDetail'),
    loadingProgressFill: document.getElementById('loadingProgressFill'),
    progressActions: document.getElementById('progressActions'),
    progressPanel: document.getElementById('progressPanel'),
    progressTitle: document.getElementById('progressTitle'),
    progressMeta: document.getElementById('progressMeta'),
    progressDetail: document.getElementById('progressDetail'),
    closeProgress: document.getElementById('closeProgress'),
    settingsPanel: document.getElementById('settingsPanel'),
    closeSettings: document.getElementById('closeSettings'),
    scrim: document.getElementById('readerScrim'),
    viewer: document.getElementById('viewer'),
    progressLabel: document.getElementById('progressLabel'),
    chapterLabel: document.getElementById('chapterLabel'),
    progressFill: document.getElementById('progressFill'),
    themeSelect: document.getElementById('themeSelect'),
    fontPresetGrid: document.getElementById('fontPresetGrid'),
    fontSizeInput: document.getElementById('fontSizeInput'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    lineHeightInput: document.getElementById('lineHeightInput'),
    lineHeightValue: document.getElementById('lineHeightValue'),
    pageMarginInput: document.getElementById('pageMarginInput'),
    pageMarginValue: document.getElementById('pageMarginValue'),
    layoutSelect: document.getElementById('layoutSelect'),
    flowSelect: document.getElementById('flowSelect'),
    disableDyslibriaInput: document.getElementById('disableDyslibriaInput')
  };

  const uiState = {
    overlay: null,
    overlayHistoryActive: false,
    lastSurfaceActionAt: 0,
    lastTouchEventAt: 0
  };

  let book = null;
  let rendition = null;
  let readingDirection = 'ltr';
  let flatTocEntries = [];
  let progressSaveTimer = null;
  let latestProgress = {
    location: '',
    progressPercent: 0,
    chapterLabel: 'Loading chapter data…',
    pageLabel: '',
    pageNumber: null,
    totalPages: null,
    href: '',
    title: '',
    author: ''
  };

  function parseStoredJson(key, fallbackValue) {
    if (!key) {
      return fallbackValue;
    }

    try {
      const value = localStorage.getItem(key);
      return value ? { ...fallbackValue, ...JSON.parse(value) } : fallbackValue;
    } catch (error) {
      return fallbackValue;
    }
  }

  function normalizeFontFamilyKey(value) {
    const normalizedValue = String(value || '').trim();
    const nextValue = legacyFontAliases[normalizedValue] || normalizedValue;
    return fontFamilies[nextValue] ? nextValue : defaultSettings.fontFamily;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createDyslibriaMarkup(text) {
    const wordPattern = /([A-Za-z][A-Za-z'-]*)/g;
    let output = '';
    let lastIndex = 0;
    let match = null;

    while ((match = wordPattern.exec(text)) !== null) {
      output += escapeHtml(text.slice(lastIndex, match.index));

      const word = match[0];
      const boldLength = Math.max(1, Math.ceil(word.length / 2));
      output += `<b>${escapeHtml(word.slice(0, boldLength))}</b>${escapeHtml(word.slice(boldLength))}`;
      lastIndex = match.index + word.length;
    }

    output += escapeHtml(text.slice(lastIndex));
    return output;
  }

  function updateFontChoiceSelection() {
    if (!elements.fontPresetGrid) {
      return;
    }

    elements.fontPresetGrid.querySelectorAll('.font-choice').forEach(function (button) {
      const isActive = button.dataset.fontId === settings.fontFamily;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function renderFontChoices() {
    if (!elements.fontPresetGrid) {
      return;
    }

    elements.fontPresetGrid.innerHTML = '';

    fontOptions.forEach(function (option) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'font-choice';
      button.dataset.fontId = option.id;
      button.style.fontFamily = option.family;
      button.setAttribute('aria-label', option.name);
      button.innerHTML = `
        <span class="font-choice-name">${createDyslibriaMarkup(option.name)}</span>
        <span class="font-choice-preview">${createDyslibriaMarkup(option.preview)}</span>
        <span class="font-choice-note">${escapeHtml(option.note)}</span>
      `;
      button.addEventListener('click', function () {
        settings.fontFamily = option.id;
        updateFontChoiceSelection();
        applyReaderSettings();
        persistSettings();
      });
      elements.fontPresetGrid.appendChild(button);
    });

    updateFontChoiceSelection();
  }

  const settings = parseStoredJson(SETTINGS_STORAGE_KEY, defaultSettings);
  settings.fontFamily = normalizeFontFamilyKey(settings.fontFamily);
  settings.disableDyslibria = Boolean(settings.disableDyslibria);

  function persistSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }

  function persistLocalLocation(cfi) {
    if (!LOCATION_STORAGE_KEY || !cfi) {
      return;
    }

    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ location: cfi }));
  }

  function getSavedLocalLocation() {
    if (!LOCATION_STORAGE_KEY) {
      return '';
    }

    try {
      const stored = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
      return stored.location || '';
    } catch (error) {
      return '';
    }
  }

  async function fetchSavedProgress(filename) {
    const fallbackLocation = getSavedLocalLocation();

    try {
      const response = await fetch(`/api/reading-progress/${encodeURIComponent(filename)}`, {
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`Progress lookup failed (${response.status})`);
      }

      const payload = await response.json();
      if (payload && payload.progress && payload.progress.location) {
        persistLocalLocation(payload.progress.location);
        return payload.progress;
      }
    } catch (error) {
      console.warn('Unable to load saved reading progress from the server:', error);
    }

    return fallbackLocation ? { location: fallbackLocation } : null;
  }

  async function saveReadingProgress(snapshot) {
    if (!fileName || !snapshot || !snapshot.location) {
      return;
    }

    try {
      const response = await fetch(`/api/reading-progress/${encodeURIComponent(fileName)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(snapshot)
      });

      if (!response.ok) {
        throw new Error(`Progress save failed (${response.status})`);
      }
    } catch (error) {
      console.warn('Unable to persist reading progress to the server:', error);
    }
  }

  function scheduleReadingProgressSave(snapshot) {
    if (progressSaveTimer) {
      clearTimeout(progressSaveTimer);
    }

    const payload = {
      location: snapshot.location,
      progressPercent: snapshot.progressPercent,
      chapterLabel: snapshot.chapterLabel,
      pageLabel: snapshot.pageLabel,
      pageNumber: snapshot.pageNumber,
      totalPages: snapshot.totalPages,
      href: snapshot.href,
      title: snapshot.title,
      author: snapshot.author
    };

    progressSaveTimer = setTimeout(function () {
      void saveReadingProgress(payload);
    }, 180);
  }

  function updateSettingLabels() {
    elements.themeSelect.value = settings.theme;
    elements.fontSizeInput.value = settings.fontSize;
    elements.lineHeightInput.value = settings.lineHeight;
    elements.pageMarginInput.value = settings.pageMargin;
    elements.layoutSelect.value = settings.layout;
    elements.flowSelect.value = settings.flow;
    elements.disableDyslibriaInput.checked = settings.disableDyslibria;
    elements.fontSizeValue.textContent = `${settings.fontSize}%`;
    elements.lineHeightValue.textContent = Number(settings.lineHeight).toFixed(1);
    elements.pageMarginValue.textContent = `${Number(settings.pageMargin).toFixed(1)}%`;
    updateFontChoiceSelection();
  }

  async function loadAppConfig() {
    if (!window.DyslibriaTheme) {
      return;
    }

    try {
      const response = await fetch('/api/app-config', {
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`Theme config lookup failed (${response.status})`);
      }

      const payload = await response.json();
      appPalette = window.DyslibriaTheme.applyPalette(
        payload.themeColor || window.DyslibriaTheme.DEFAULT_COLOR_KEY,
        document.documentElement
      );
    } catch (error) {
      appPalette = window.DyslibriaTheme.applyPalette(
        window.DyslibriaTheme.DEFAULT_COLOR_KEY,
        document.documentElement
      );
    }
  }

  function applyShellTheme() {
    elements.app.classList.remove('theme-paper', 'theme-sepia', 'theme-midnight');
    elements.app.classList.add(`theme-${settings.theme}`);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      if (window.DyslibriaTheme && appPalette) {
        metaTheme.setAttribute(
          'content',
          window.DyslibriaTheme.getMetaThemeColor(settings.theme === 'midnight' ? 'dark' : 'light', appPalette)
        );
      } else {
        metaTheme.setAttribute('content', settings.theme === 'midnight' ? '#0f1620' : '#18281f');
      }
    }
  }

  function updateOverlayState() {
    const settingsOpen = uiState.overlay === 'settings';
    const progressOpen = uiState.overlay === 'progress';
    const overlayVisible = Boolean(uiState.overlay);

    elements.settingsPanel.classList.toggle('is-open', settingsOpen);
    elements.settingsPanel.setAttribute('aria-hidden', settingsOpen ? 'false' : 'true');
    elements.progressPanel.classList.toggle('is-open', progressOpen);
    elements.progressPanel.setAttribute('aria-hidden', progressOpen ? 'false' : 'true');
    elements.scrim.classList.toggle('is-visible', overlayVisible);
    elements.progressActions.hidden = !progressOpen;
    elements.progressActions.classList.toggle('is-visible', progressOpen);
  }

  function openOverlay(name, options = {}) {
    if (uiState.overlay === name) {
      return;
    }

    if (options.pushHistory !== false && !uiState.overlayHistoryActive) {
      history.pushState({ dyslibriaOverlay: name }, '', window.location.href);
      uiState.overlayHistoryActive = true;
    }

    uiState.overlay = name;
    updateOverlayState();
  }

  function closeOverlay(options = {}) {
    if (!uiState.overlay) {
      return;
    }

    if (!options.fromHistory && uiState.overlayHistoryActive) {
      history.back();
      return;
    }

    if (options.fromHistory) {
      uiState.overlayHistoryActive = false;
    }

    uiState.overlay = null;
    updateOverlayState();
  }

  function setLoadingState(title, subtitle) {
    elements.loadingTitle.textContent = title;
    elements.loadingMeta.textContent = subtitle;
  }

  function setLoadingProgress(percent, detail) {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    const safeDetail = detail || 'Preparing reader shell';

    elements.loadingProgressLabel.textContent = `${safePercent}%`;
    elements.loadingProgressDetail.textContent = safeDetail;
    elements.loadingProgressFill.style.width = `${safePercent}%`;
  }

  function markLoaded() {
    elements.app.classList.add('is-loaded');
  }

  function normalizeHref(href) {
    return String(href || '').split('#')[0];
  }

  function getDisplaySpread() {
    if (settings.flow === 'scrolled-doc') {
      return 'none';
    }

    if (settings.layout !== 'auto') {
      return settings.layout;
    }

    return window.innerWidth >= 1200 ? 'always' : 'none';
  }

  function getReaderPageMargins() {
    const pageMargin = Math.max(3, Math.min(12, Number(settings.pageMargin) || defaultSettings.pageMargin));
    const verticalPageMargin = Math.max(2.5, Math.min(10, pageMargin - (window.innerWidth < 700 ? 0.2 : 0.8)));

    return {
      inline: pageMargin,
      block: verticalPageMargin
    };
  }

  function applyViewerMargins() {
    if (!elements.viewerFrame) {
      return;
    }

    const margins = getReaderPageMargins();
    elements.viewerFrame.style.setProperty('--reader-page-inline-margin', `${margins.inline}%`);
    elements.viewerFrame.style.setProperty('--reader-page-block-margin', `${margins.block}%`);
  }

  function resizeRendition() {
    if (!rendition || !rendition.manager || !rendition.manager.isRendered()) {
      return;
    }

    const width = elements.viewer.clientWidth;
    const height = elements.viewer.clientHeight;

    if (width > 0 && height > 0) {
      rendition.resize(width, height);
    }
  }

  function isInteractiveTarget(target) {
    return Boolean(
      target &&
      typeof target.closest === 'function' &&
      target.closest('a, button, input, textarea, select, label, summary, audio, video')
    );
  }

  function getPointerClientPoint(event, contents) {
    if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      return normalizePointerPoint({
        x: event.clientX,
        y: event.clientY
      }, contents);
    }

    const touch = (event.changedTouches && event.changedTouches[0]) ||
      (event.touches && event.touches[0]);

    if (!touch) {
      return null;
    }

    return normalizePointerPoint({
      x: touch.clientX,
      y: touch.clientY
    }, contents);
  }

  function normalizePointerPoint(point, contents) {
    const frameElement = contents &&
      contents.window &&
      contents.window.frameElement &&
      typeof contents.window.frameElement.getBoundingClientRect === 'function'
      ? contents.window.frameElement
      : null;

    if (!frameElement) {
      return point;
    }

    const frameRect = frameElement.getBoundingClientRect();
    return {
      x: frameRect.left + point.x,
      y: frameRect.top + point.y
    };
  }

  function goNext() {
    if (!rendition) {
      return;
    }

    if (readingDirection === 'rtl') {
      rendition.prev();
      return;
    }

    rendition.next();
  }

  function goPrevious() {
    if (!rendition) {
      return;
    }

    if (readingDirection === 'rtl') {
      rendition.next();
      return;
    }

    rendition.prev();
  }

  function shouldIgnoreSurfaceEvent(event) {
    const now = Date.now();
    if (event.type === 'click' && now - uiState.lastTouchEventAt < 700) {
      return true;
    }

    if (event.type === 'touchend') {
      uiState.lastTouchEventAt = now;
    }

    if (now - uiState.lastSurfaceActionAt < 250) {
      return true;
    }

    uiState.lastSurfaceActionAt = now;
    return false;
  }

  function handleViewportZoneAction(point, event) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    if (!point || viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }

    const xRatio = point.x / viewportWidth;
    const yRatio = point.y / viewportHeight;

    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    if (
      xRatio >= zoneConfig.progressMinX &&
      xRatio <= zoneConfig.progressMaxX &&
      yRatio >= zoneConfig.progressMinY
    ) {
      openOverlay('progress');
      return;
    }

    if (
      xRatio >= zoneConfig.settingsMinX &&
      xRatio <= zoneConfig.settingsMaxX &&
      yRatio >= zoneConfig.settingsMinY &&
      yRatio <= zoneConfig.settingsMaxY
    ) {
      openOverlay('settings');
      return;
    }

    if (xRatio <= zoneConfig.previousMaxX) {
      goPrevious();
      return;
    }

    if (xRatio >= zoneConfig.nextMinX) {
      goNext();
    }
  }

  function handleSurfaceInteraction(event, contents) {
    if (!contents || !contents.window || uiState.overlay) {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (shouldIgnoreSurfaceEvent(event)) {
      return;
    }

    const point = getPointerClientPoint(event, contents);
    if (!point) {
      return;
    }

    handleViewportZoneAction(point, event);
  }

  function handleShellSurfaceInteraction(event) {
    if (uiState.overlay || !elements.viewerFrame || !elements.viewerFrame.contains(event.target)) {
      return;
    }

    if (
      event.target !== elements.viewerFrame &&
      event.target !== elements.viewer
    ) {
      return;
    }

    if (shouldIgnoreSurfaceEvent(event)) {
      return;
    }

    const point = getPointerClientPoint(event, null);
    if (!point) {
      return;
    }

    handleViewportZoneAction(point, event);
  }

  function lockContentSelection(contents) {
    if (!contents || !contents.document) {
      return;
    }

    const doc = contents.document;
    const root = doc.documentElement;

    if (root && root.dataset.dyslibriaSelectionLocked === 'true') {
      return;
    }

    if (root) {
      root.dataset.dyslibriaSelectionLocked = 'true';
    }

    const styleTag = doc.createElement('style');
    styleTag.textContent = `
      html,
      body,
      body * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
      }

      * {
        -webkit-tap-highlight-color: transparent !important;
      }
    `;

    if (doc.head) {
      doc.head.appendChild(styleTag);
    } else if (doc.documentElement) {
      doc.documentElement.appendChild(styleTag);
    }

    doc.addEventListener('selectstart', function (event) {
      event.preventDefault();
    });

    doc.addEventListener('selectionchange', function () {
      const selection = doc.getSelection && doc.getSelection();
      if (selection && !selection.isCollapsed) {
        selection.removeAllRanges();
      }
    });
  }

  function buildContentPresentationStyles() {
    if (!settings.disableDyslibria) {
      return '';
    }

    return `
      b {
        font-weight: inherit !important;
      }
    `;
  }

  function applyContentPresentationOverrides(contents) {
    if (!contents || !contents.document) {
      return;
    }

    const doc = contents.document;
    let styleTag = doc.getElementById('dyslibriaContentOverrides');

    if (!styleTag) {
      styleTag = doc.createElement('style');
      styleTag.id = 'dyslibriaContentOverrides';

      if (doc.head) {
        doc.head.appendChild(styleTag);
      } else if (doc.documentElement) {
        doc.documentElement.appendChild(styleTag);
      }
    }

    styleTag.textContent = buildContentPresentationStyles();
  }

  function updateOpenContentPresentationOverrides() {
    if (!rendition || typeof rendition.getContents !== 'function') {
      return;
    }

    rendition.getContents().forEach(function (contents) {
      applyContentPresentationOverrides(contents);
    });
  }

  async function fetchEpubBuffer(filename) {
    const response = await fetch(`/epub/${encodeURIComponent(filename)}`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/epub+zip'
      }
    });

    if (!response.ok) {
      throw new Error(`Reader could not load this EPUB (${response.status}).`);
    }

    return response.arrayBuffer();
  }

  function applyReaderSettings() {
    if (!rendition) {
      return;
    }

    const fontFamily = fontFamilies[settings.fontFamily] || fontFamilies.accessible;
    const themeRules = {
      html: {
        '-webkit-text-size-adjust': '100%',
        'text-size-adjust': '100%'
      },
      body: {
        'font-family': fontFamily,
        'line-height': String(settings.lineHeight),
        'text-rendering': 'optimizeLegibility'
      },
      'img, svg, video, canvas': {
        'max-width': '100%',
        height: 'auto'
      },
      'figure, picture': {
        'max-width': '100%'
      }
    };

    applyViewerMargins();

    // Keep reader overrides ergonomic rather than editorial. The reader should
    // manage typography, sizing, and fit, while the book keeps its own colours,
    // emphasis, spacing, links, and general visual personality.
    rendition.themes.default(themeRules);

    rendition.themes.fontSize(`${settings.fontSize}%`);
    rendition.flow(settings.flow);
    rendition.spread(getDisplaySpread());
    updateOpenContentPresentationOverrides();
    resizeRendition();
  }

  function updateMetadata(title, author) {
    const safeTitle = title || fileName || 'Untitled book';
    const safeAuthor = author || 'Unknown author';

    elements.progressTitle.textContent = safeTitle;
    elements.progressMeta.textContent = safeAuthor;
    setLoadingState(safeTitle, safeAuthor);
    document.title = `${safeTitle} · Dyslibria`;

    latestProgress.title = safeTitle;
    latestProgress.author = safeAuthor;
  }

  function flattenTocEntries(items, output) {
    items.forEach(function (item) {
      output.push({
        href: normalizeHref(item.href),
        label: item.label || 'Untitled chapter'
      });

      const children = item.subitems || item.children || [];
      if (children.length > 0) {
        flattenTocEntries(children, output);
      }
    });
  }

  function formatPageLabel(pageNumber, totalPages) {
    if (!Number.isFinite(pageNumber) || !Number.isFinite(totalPages) || pageNumber <= 0 || totalPages <= 0) {
      return '';
    }

    return `Page ${pageNumber} of ${totalPages}`;
  }

  function updateProgress(location) {
    if (!location || !location.start) {
      return;
    }

    const activeHref = normalizeHref(location.start.href);
    const displayed = location.start.displayed || {};
    const activeEntry = flatTocEntries.find(function (entry) {
      return entry.href === activeHref || activeHref.startsWith(entry.href);
    });

    let percent = latestProgress.progressPercent || 0;
    let pageNumber = Number.isFinite(location.start.location) ? location.start.location + 1 : null;
    let totalPages = book && book.locations && Number.isFinite(book.locations.total)
      ? book.locations.total + 1
      : null;

    if (Number.isFinite(location.start.percentage)) {
      percent = Math.round(location.start.percentage * 100);
    }

    if (book && book.locations && location.start.cfi) {
      try {
        percent = Math.round(book.locations.percentageFromCfi(location.start.cfi) * 100);
      } catch (error) {
        percent = latestProgress.progressPercent || 0;
      }
    }

    if (!Number.isFinite(pageNumber) && displayed.page) {
      pageNumber = displayed.page;
    }

    if (!Number.isFinite(totalPages) && displayed.total) {
      totalPages = displayed.total;
    }

    const pageLabel = formatPageLabel(pageNumber, totalPages);
    const chapterParts = [];

    if (activeEntry && activeEntry.label) {
      chapterParts.push(activeEntry.label);
    }

    if (pageLabel) {
      chapterParts.push(pageLabel);
    }

    const chapterLabel = chapterParts.join(' · ') || 'Reading';

    latestProgress = {
      ...latestProgress,
      location: location.start.cfi || latestProgress.location,
      progressPercent: percent,
      chapterLabel,
      pageLabel,
      pageNumber: Number.isFinite(pageNumber) ? pageNumber : null,
      totalPages: Number.isFinite(totalPages) ? totalPages : null,
      href: activeHref
    };

    elements.progressLabel.textContent = `${percent}%`;
    elements.progressFill.style.width = `${percent}%`;
    elements.chapterLabel.textContent = chapterLabel;
    elements.progressDetail.textContent = pageLabel
      ? `${pageLabel}. Reading progress saves on the server automatically.`
      : 'Reading progress saves on the server automatically.';

    if (latestProgress.location) {
      persistLocalLocation(latestProgress.location);
      scheduleReadingProgressSave(latestProgress);
    }
  }

  function applySavedProgress(snapshot) {
    if (!snapshot) {
      return;
    }

    latestProgress = {
      ...latestProgress,
      ...snapshot
    };

    if (snapshot.title || snapshot.author) {
      updateMetadata(snapshot.title || latestProgress.title, snapshot.author || latestProgress.author);
    }

    if (typeof snapshot.progressPercent === 'number') {
      elements.progressLabel.textContent = `${snapshot.progressPercent}%`;
      elements.progressFill.style.width = `${snapshot.progressPercent}%`;
    }

    if (snapshot.chapterLabel) {
      elements.chapterLabel.textContent = snapshot.chapterLabel;
    }

    if (snapshot.pageLabel) {
      elements.progressDetail.textContent = `${snapshot.pageLabel}. Reading progress saves on the server automatically.`;
    } else {
      const fallbackPageLabel = formatPageLabel(snapshot.pageNumber, snapshot.totalPages);
      if (fallbackPageLabel) {
        elements.progressDetail.textContent = `${fallbackPageLabel}. Reading progress saves on the server automatically.`;
      }
    }
  }

  function attachEventListeners() {
    elements.closeSettings.addEventListener('click', function () {
      closeOverlay();
    });

    elements.closeProgress.addEventListener('click', function () {
      closeOverlay();
    });

    elements.scrim.addEventListener('click', function () {
      closeOverlay();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && uiState.overlay) {
        closeOverlay();
        return;
      }

      if (uiState.overlay) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        goPrevious();
      }

      if (event.key === 'ArrowRight') {
        goNext();
      }
    });

    elements.themeSelect.addEventListener('change', function () {
      settings.theme = this.value;
      applyShellTheme();
      applyReaderSettings();
      persistSettings();
    });

    elements.fontSizeInput.addEventListener('input', function () {
      settings.fontSize = Number(this.value);
      updateSettingLabels();
      applyReaderSettings();
      persistSettings();
    });

    elements.lineHeightInput.addEventListener('input', function () {
      settings.lineHeight = Number(this.value);
      updateSettingLabels();
      applyReaderSettings();
      persistSettings();
    });

    elements.pageMarginInput.addEventListener('input', function () {
      settings.pageMargin = Number(this.value);
      updateSettingLabels();
      applyReaderSettings();
      persistSettings();
    });

    elements.layoutSelect.addEventListener('change', function () {
      settings.layout = this.value;
      applyReaderSettings();
      persistSettings();
    });

    elements.flowSelect.addEventListener('change', function () {
      settings.flow = this.value;
      applyReaderSettings();
      persistSettings();
    });

    elements.disableDyslibriaInput.addEventListener('change', function () {
      settings.disableDyslibria = this.checked;
      applyReaderSettings();
      persistSettings();
    });

    window.addEventListener('resize', function () {
      applyReaderSettings();
    });

    elements.viewerFrame.addEventListener('click', handleShellSurfaceInteraction);
    elements.viewerFrame.addEventListener('touchend', handleShellSurfaceInteraction, { passive: false });

    window.addEventListener('popstate', function () {
      if (uiState.overlay && uiState.overlayHistoryActive) {
        closeOverlay({ fromHistory: true });
      }
    });
  }

  async function initialiseReader() {
    if (!fileName) {
      updateMetadata('No EPUB selected', 'Open a book from the dashboard first.');
      setLoadingState('No EPUB selected', 'Open a book from the dashboard first.');
      setLoadingProgress(0, 'Open a book from the library first.');
      elements.chapterLabel.textContent = 'No file parameter was provided.';
      elements.progressDetail.textContent = 'Open a book from the library first.';
      openOverlay('settings', { pushHistory: false });
      return;
    }

    await loadAppConfig();
    renderFontChoices();
    updateSettingLabels();
    applyShellTheme();
    applyViewerMargins();
    attachEventListeners();

    try {
      setLoadingProgress(8, 'Checking saved position');
      const savedProgressPromise = fetchSavedProgress(fileName);
      setLoadingProgress(18, 'Loading EPUB package');
      const epubBuffer = await fetchEpubBuffer(fileName);
      setLoadingProgress(34, 'Preparing browser reader');
      book = ePub(epubBuffer);
      rendition = book.renderTo('viewer', {
        width: '100%',
        height: '100%',
        spread: getDisplaySpread()
      });

      if (rendition.hooks && rendition.hooks.content) {
        rendition.hooks.content.register(function (contents) {
          lockContentSelection(contents);
          applyContentPresentationOverrides(contents);
        });
      }

      applyReaderSettings();

      rendition.on('relocated', function (location) {
        updateProgress(location);
      });

      rendition.on('click', handleSurfaceInteraction);
      rendition.on('touchend', handleSurfaceInteraction);

      setLoadingProgress(48, 'Reading package metadata');
      await book.ready;
      readingDirection = (book.package && book.package.metadata && book.package.metadata.direction) || 'ltr';

      const metadata = (book.package && book.package.metadata) || {};
      updateMetadata(metadata.title, metadata.creator);

      setLoadingProgress(62, 'Loading table of contents');
      const navigation = await book.loaded.navigation;
      const tocEntries = Array.isArray(navigation) ? navigation : (navigation.toc || []);
      flatTocEntries = [];
      flattenTocEntries(tocEntries, flatTocEntries);

      try {
        setLoadingProgress(76, 'Building page map');
        await book.locations.generate(1600);
      } catch (error) {
        console.warn('Unable to generate reading locations before first render:', error);
      }

      setLoadingProgress(88, 'Restoring reading position');
      const savedProgress = await savedProgressPromise;
      applySavedProgress(savedProgress);

      const startingLocation = requestedLocation || (savedProgress && savedProgress.location) || getSavedLocalLocation();
      setLoadingProgress(96, 'Opening book');
      await rendition.display(startingLocation || undefined);
      applyReaderSettings();
      resizeRendition();
      setLoadingProgress(100, 'Ready to read');
      markLoaded();
      updateProgress(rendition.currentLocation());
    } catch (error) {
      console.error('Reader failed to load:', error);
      updateMetadata('Unable to open book', error.message);
      setLoadingState('Unable to open book', 'This EPUB could not be rendered in the browser.');
      setLoadingProgress(100, 'Rendering failed');
      elements.chapterLabel.textContent = 'This EPUB could not be rendered in the browser.';
      elements.progressDetail.textContent = 'This file could not be rendered in the browser reader.';
      openOverlay('settings', { pushHistory: false });
    }
  }

  initialiseReader();
})();
