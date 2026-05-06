(function () {
  const readerApp = document.getElementById('readerApp');
  const params = new URLSearchParams(window.location.search);

  function getDatasetValue(key) {
    return readerApp ? readerApp.dataset[key] || '' : '';
  }

  function firstNonEmpty(values, fallbackValue) {
    const list = Array.isArray(values) ? values : [values];

    for (let index = 0; index < list.length; index += 1) {
      const candidate = String(list[index] || '').trim();
      if (candidate) {
        return candidate;
      }
    }

    return typeof fallbackValue === 'string' ? fallbackValue : '';
  }

  function createBookIdFromValue(value) {
    const normalizedValue = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return normalizedValue ? `reader-${normalizedValue}` : '';
  }

  function formatFallbackBookTitle(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
      return '';
    }

    const lastSegment = rawValue.split('/').pop() || rawValue;
    const withoutExtension = lastSegment.replace(/\.[a-z0-9]{1,8}$/i, '');
    const normalizedWhitespace = withoutExtension
      .replace(/[_]+/g, ' ')
      .replace(/[-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalizedWhitespace) {
      return '';
    }

    return normalizedWhitespace.replace(/\b([a-z])/g, function (_, character) {
      return character.toUpperCase();
    });
  }

  function collectQueryTemplateValues(searchParams, bookQueryParam) {
    const values = {};
    searchParams.forEach(function (value, key) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        values[key] = value;
      }
    });

    const resolvedQueryParam = String(bookQueryParam || '').trim();
    const primaryBookValue = resolvedQueryParam && values[resolvedQueryParam]
      ? String(values[resolvedQueryParam]).trim()
      : '';

    if (!primaryBookValue) {
      return values;
    }

    const lastSegment = primaryBookValue.split('/').pop() || primaryBookValue;
    const stem = lastSegment.replace(/\.[a-z0-9]{1,8}$/i, '');

    if (!values.book) {
      values.book = primaryBookValue;
    }

    if (!values.file) {
      values.file = primaryBookValue;
    }

    if (!values.fileName) {
      values.fileName = lastSegment;
    }

    if (!values.filename) {
      values.filename = lastSegment;
    }

    if (!values.fileStem) {
      values.fileStem = stem;
    }

    if (!values.bookFile) {
      values.bookFile = lastSegment;
    }

    if (!values.bookStem) {
      values.bookStem = stem;
    }

    if (!values.bookTitle) {
      values.bookTitle = formatFallbackBookTitle(lastSegment);
    }

    return values;
  }

  function interpolateTemplate(template, values, mode) {
    const rawTemplate = String(template || '').trim();

    if (!rawTemplate) {
      return '';
    }

    return rawTemplate.replace(/\{([^{}]+)\}/g, function (_, token) {
      const tokenKey = String(token || '').trim();
      const replacement = Object.prototype.hasOwnProperty.call(values, tokenKey)
        ? String(values[tokenKey] || '')
        : '';

      if (mode === 'url') {
        return encodeURIComponent(replacement);
      }

      return replacement;
    });
  }

  const hasTemplateBootstrap = Boolean(
    getDatasetValue('bookIdTemplate') ||
      getDatasetValue('bookTitleTemplate') ||
      getDatasetValue('bookAuthorTemplate') ||
      getDatasetValue('bookLanguageTemplate') ||
      getDatasetValue('epubUrlTemplate') ||
      getDatasetValue('progressUrlTemplate') ||
      getDatasetValue('appConfigUrlTemplate') ||
      getDatasetValue('closeUrlTemplate') ||
      getDatasetValue('locationStorageKeyTemplate')
  );
  const bookQueryParam = firstNonEmpty([
    getDatasetValue('bookQueryParam'),
    hasTemplateBootstrap ? 'file' : ''
  ]);
  const queryTemplateValues = collectQueryTemplateValues(params, bookQueryParam);
  const bookId = firstNonEmpty([
    getDatasetValue('bookId'),
    interpolateTemplate(getDatasetValue('bookIdTemplate'), queryTemplateValues, 'text'),
    createBookIdFromValue(queryTemplateValues.fileStem || queryTemplateValues.book || queryTemplateValues.bookTitle)
  ]);
  const initialBookTitle = firstNonEmpty([
    getDatasetValue('bookTitle'),
    interpolateTemplate(getDatasetValue('bookTitleTemplate'), queryTemplateValues, 'text'),
    queryTemplateValues.bookTitle
  ]);
  const initialBookAuthor = firstNonEmpty([
    getDatasetValue('bookAuthor'),
    interpolateTemplate(getDatasetValue('bookAuthorTemplate'), queryTemplateValues, 'text')
  ]);
  const initialBookLanguage = firstNonEmpty([
    getDatasetValue('bookLanguage'),
    interpolateTemplate(getDatasetValue('bookLanguageTemplate'), queryTemplateValues, 'text')
  ]);
  const appConfigUrl = firstNonEmpty([
    getDatasetValue('appConfigUrl'),
    interpolateTemplate(getDatasetValue('appConfigUrlTemplate'), queryTemplateValues, 'url')
  ]);
  const epubUrl = firstNonEmpty([
    getDatasetValue('epubUrl'),
    interpolateTemplate(getDatasetValue('epubUrlTemplate'), queryTemplateValues, 'url')
  ]);
  const progressUrl = firstNonEmpty([
    getDatasetValue('progressUrl'),
    interpolateTemplate(getDatasetValue('progressUrlTemplate'), queryTemplateValues, 'url')
  ]);
  const closeUrl = firstNonEmpty([
    getDatasetValue('closeUrl'),
    interpolateTemplate(getDatasetValue('closeUrlTemplate'), queryTemplateValues, 'url')
  ]);
  const requestedLocation = params.get('loc') || getDatasetValue('startLocation') || '';
  const shouldPersistSettings = parseBooleanDataAttribute(
    getDatasetValue('persistSettings'),
    true
  );
  const shouldPersistLocation = parseBooleanDataAttribute(
    getDatasetValue('persistLocation'),
    true
  );
  const shouldPersistProgress = Boolean(progressUrl) && parseBooleanDataAttribute(
    getDatasetValue('persistProgress'),
    true
  );
  const allowSettingsOverlay = !parseBooleanDataAttribute(
    getDatasetValue('hideSettings'),
    false
  );
  const allowProgressOverlay = !parseBooleanDataAttribute(
    getDatasetValue('hideProgress'),
    false
  );
  const shouldShowCloseButton = parseBooleanDataAttribute(
    getDatasetValue('showCloseButton'),
    Boolean(closeUrl)
  );
  const requestedDisableDyslibria = resolveRequestedDisableDyslibria();

  const SETTINGS_STORAGE_KEY = firstNonEmpty([
    getDatasetValue('settingsStorageKey'),
    'dyslibria:reader-settings:v1'
  ]);
  const LOCATION_STORAGE_KEY = firstNonEmpty([
    getDatasetValue('locationStorageKey'),
    interpolateTemplate(getDatasetValue('locationStorageKeyTemplate'), queryTemplateValues, 'text'),
    bookId ? `dyslibria:reader:${bookId}` : ''
  ]);
  const AUTO_SPREAD_MIN_WIDTH = 1180;
  const TAP_MAX_TRAVEL_PX = 18;
  const TAP_MAX_DURATION_MS = 420;
  const previewFunctionWords = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'can', 'for', 'from', 'help', 'in', 'keep',
    'less', 'make', 'more', 'of', 'on', 'or', 'the', 'to', 'with', 'without'
  ]);

  function parseBooleanDataAttribute(value, fallbackValue) {
    const normalizedValue = String(value || '').trim().toLowerCase();

    if (!normalizedValue) {
      return fallbackValue;
    }

    if (['1', 'true', 'yes', 'on'].indexOf(normalizedValue) >= 0) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].indexOf(normalizedValue) >= 0) {
      return false;
    }

    return fallbackValue;
  }

  function resolveRequestedDisableDyslibria() {
    const queryValue = String(params.get('dyslibria') || '').trim().toLowerCase();

    if (queryValue === 'off') {
      return true;
    }

    if (queryValue === 'on') {
      return false;
    }

    if (!readerApp) {
      return null;
    }

    const datasetValue = getDatasetValue('disableDyslibria');
    return typeof datasetValue === 'string' && datasetValue.length > 0
      ? parseBooleanDataAttribute(datasetValue, false)
      : null;
  }

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

  const numericSettingRanges = {
    fontSize: { min: 50, max: 235, step: 5, defaultValue: defaultSettings.fontSize },
    lineHeight: { min: 1.1, max: 2.5, step: 0.05, defaultValue: defaultSettings.lineHeight },
    pageMargin: { min: 3, max: 12, step: 0.5, defaultValue: defaultSettings.pageMargin }
  };

  const themeOptions = [
    { id: 'paper', name: 'Paper', mode: 'light' },
    { id: 'cream', name: 'Warm cream', mode: 'light' },
    { id: 'sepia', name: 'Soft sepia', mode: 'light' },
    { id: 'dusk', name: 'Dusk paper', mode: 'light' },
    { id: 'sage', name: 'Sage paper', mode: 'light' },
    { id: 'slate', name: 'Slate paper', mode: 'light' },
    { id: 'cotton', name: 'Cotton texture', mode: 'light' },
    { id: 'parchment', name: 'Parchment grain', mode: 'light' },
    { id: 'midnight', name: 'Midnight', mode: 'dark' }
  ];
  const themeIds = themeOptions.map(function (option) {
    return `theme-${option.id}`;
  });
  const themeModes = Object.fromEntries(themeOptions.map(function (option) {
    return [option.id, option.mode];
  }));

  let appPalette = window.DyslibriaTheme
    ? window.DyslibriaTheme.applyPalette(window.DyslibriaTheme.DEFAULT_COLOR_KEY, document.documentElement)
    : null;

  const fontOptions = [
    {
      id: 'accessible',
      name: 'Accessible Sans',
      family: '"Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif',
      preview: 'Calmer scanning with friendly familiar letterforms.'
    },
    {
      id: 'atkinson',
      name: 'Atkinson Hyperlegible',
      family: '"Atkinson Hyperlegible", "Avenir Next", "Segoe UI", sans-serif',
      preview: 'Clearer letters help keep fast lines from blurring.'
    },
    {
      id: 'lexend',
      name: 'Lexend',
      family: '"Lexend", "Avenir Next", "Segoe UI", sans-serif',
      preview: 'Roomier word shapes can slow visual crowding down.'
    },
    {
      id: 'sourceSans',
      name: 'Source Sans 3',
      family: '"Source Sans 3", "Segoe UI", sans-serif',
      preview: 'A calmer page texture keeps focus on the sentence.'
    },
    {
      id: 'publicSans',
      name: 'Public Sans',
      family: '"Public Sans", "Segoe UI", sans-serif',
      preview: 'Clean rhythm can make paragraphs feel less hectic.'
    },
    {
      id: 'notoSans',
      name: 'Noto Sans',
      family: '"Noto Sans", "Segoe UI", sans-serif',
      preview: 'Steady spacing supports quieter, more even reading.'
    },
    {
      id: 'ibmPlex',
      name: 'IBM Plex Sans',
      family: '"IBM Plex Sans", "Segoe UI", sans-serif',
      preview: 'Sharper contours can anchor attention on each line.'
    },
    {
      id: 'nunito',
      name: 'Nunito Sans',
      family: '"Nunito Sans", "Segoe UI", sans-serif',
      preview: 'Softer curves can make dense pages feel more gentle.'
    },
    {
      id: 'merriweatherSans',
      name: 'Merriweather Sans',
      family: '"Merriweather Sans", "Trebuchet MS", sans-serif',
      preview: 'Readable warmth without losing structure or contrast.'
    },
    {
      id: 'literata',
      name: 'Literata',
      family: '"Literata", "Iowan Old Style", "Palatino Linotype", Georgia, serif',
      preview: 'Gentle serif texture can make long reading feel grounded.'
    },
    {
      id: 'sourceSerif',
      name: 'Source Serif 4',
      family: '"Source Serif 4", "Palatino Linotype", Georgia, serif',
      preview: 'Sharper serifs can help word shapes feel more anchored.'
    },
    {
      id: 'figtree',
      name: 'Figtree',
      family: '"Figtree", "Avenir Next", "Segoe UI", sans-serif',
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
    closeBookButton: document.getElementById('closeBookButton'),
    themeSelect: document.getElementById('themeSelect'),
    fontPresetGrid: document.getElementById('fontPresetGrid'),
    fontSizeInput: document.getElementById('fontSizeInput'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    lineHeightInput: document.getElementById('lineHeightInput'),
    lineHeightValue: document.getElementById('lineHeightValue'),
    pageMarginInput: document.getElementById('pageMarginInput'),
    pageMarginValue: document.getElementById('pageMarginValue'),
    layoutSelect: document.getElementById('layoutSelect'),
    disableDyslibriaInput: document.getElementById('disableDyslibriaInput')
  };

  const uiState = {
    overlay: null,
    overlayHistoryActive: false,
    lastSurfaceActionAt: 0,
    lastTouchEventAt: 0,
    activeTouchGesture: null
  };

  let book = null;
  let rendition = null;
  let readingDirection = 'ltr';
  let flatTocEntries = [];
  let progressSaveTimer = null;
  let layoutRealignTimer = null;
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
    if (!shouldPersistSettings || !key) {
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

  function normalizeThemeKey(value) {
    const normalizedValue = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(themeModes, normalizedValue)
      ? normalizedValue
      : defaultSettings.theme;
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeNumericSetting(value, config) {
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : config.defaultValue;
    const clampedValue = clampNumber(safeValue, config.min, config.max);

    if (!config.step || config.step <= 0) {
      return clampedValue;
    }

    const roundedSteps = Math.round((clampedValue - config.min) / config.step);
    const normalizedValue = config.min + roundedSteps * config.step;
    const stepPrecision = String(config.step).split('.')[1];
    const precision = stepPrecision ? stepPrecision.length : 0;

    return Number(normalizedValue.toFixed(precision));
  }

  function formatSliderNumber(value, maxDecimals = 2) {
    return Number(value).toFixed(maxDecimals).replace(/\.?0+$/, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPreviewAnchorWordIndexes(words) {
    const targetCount = Math.max(1, Math.min(3, Math.round(words.length / 4)));
    const candidates = words
      .map(function (word, index) {
        const normalizedWord = word.toLowerCase();
        const isFunctionWord = previewFunctionWords.has(normalizedWord);
        return {
          index,
          word,
          score: word.length + (isFunctionWord ? 0 : 1.5) - index * 0.08
        };
      })
      .filter(function (entry) {
        return entry.word.length >= 4;
      })
      .sort(function (left, right) {
        return right.score - left.score;
      });
    const selectedIndexes = [];

    candidates.forEach(function (candidate) {
      if (selectedIndexes.length >= targetCount) {
        return;
      }

      const hasNearbyAnchor = selectedIndexes.some(function (selectedIndex) {
        return Math.abs(selectedIndex - candidate.index) < 2;
      });

      if (!hasNearbyAnchor) {
        selectedIndexes.push(candidate.index);
      }
    });

    if (!selectedIndexes.length && words.length) {
      selectedIndexes.push(0);
    }

    return new Set(selectedIndexes);
  }

  function createDyslibriaPreviewMarkup(text) {
    const wordPattern = /([A-Za-z][A-Za-z'-]*)/g;
    const matches = [];
    let match = null;

    while ((match = wordPattern.exec(text)) !== null) {
      matches.push({
        index: matches.length,
        start: match.index,
        word: match[0]
      });
    }

    const anchorIndexes = getPreviewAnchorWordIndexes(matches.map(function (entry) {
      return entry.word;
    }));
    let output = '';
    let lastIndex = 0;

    matches.forEach(function (entry) {
      output += escapeHtml(text.slice(lastIndex, entry.start));
      output += anchorIndexes.has(entry.index)
        ? `<strong class="font-choice-anchor">${escapeHtml(entry.word)}</strong>`
        : escapeHtml(entry.word);
      lastIndex = entry.start + entry.word.length;
    });

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
        <span class="font-choice-name">${escapeHtml(option.name)}</span>
        <span class="font-choice-preview">${createDyslibriaPreviewMarkup(option.preview)}</span>
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

  function renderThemeChoices() {
    if (!elements.themeSelect) {
      return;
    }

    elements.themeSelect.innerHTML = '';
    themeOptions.forEach(function (option) {
      const selectOption = document.createElement('option');
      selectOption.value = option.id;
      selectOption.textContent = option.name;
      elements.themeSelect.appendChild(selectOption);
    });
  }

  const settings = parseStoredJson(SETTINGS_STORAGE_KEY, defaultSettings);
  settings.theme = normalizeThemeKey(settings.theme);
  settings.fontFamily = normalizeFontFamilyKey(settings.fontFamily);
  settings.fontSize = normalizeNumericSetting(settings.fontSize, numericSettingRanges.fontSize);
  settings.lineHeight = normalizeNumericSetting(settings.lineHeight, numericSettingRanges.lineHeight);
  settings.pageMargin = normalizeNumericSetting(settings.pageMargin, numericSettingRanges.pageMargin);
  settings.flow = 'paginated';
  settings.disableDyslibria = Boolean(settings.disableDyslibria);
  if (requestedDisableDyslibria !== null) {
    settings.disableDyslibria = requestedDisableDyslibria;
  }

  function persistSettings() {
    if (!shouldPersistSettings || !SETTINGS_STORAGE_KEY) {
      return;
    }

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }

  function persistLocalLocation(cfi) {
    if (!shouldPersistLocation || !LOCATION_STORAGE_KEY || !cfi) {
      return;
    }

    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ location: cfi }));
  }

  function getSavedLocalLocation() {
    if (!shouldPersistLocation || !LOCATION_STORAGE_KEY) {
      return '';
    }

    try {
      const stored = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
      return stored.location || '';
    } catch (error) {
      return '';
    }
  }

  async function fetchSavedProgress() {
    const fallbackLocation = getSavedLocalLocation();

    if (!shouldPersistProgress) {
      return fallbackLocation ? { location: fallbackLocation } : null;
    }

    try {
      const response = await fetch(progressUrl, {
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
    if (!shouldPersistProgress || !snapshot || !snapshot.location) {
      return;
    }

    try {
      const response = await fetch(progressUrl, {
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
    elements.fontSizeInput.min = String(numericSettingRanges.fontSize.min);
    elements.fontSizeInput.max = String(numericSettingRanges.fontSize.max);
    elements.fontSizeInput.step = String(numericSettingRanges.fontSize.step);
    elements.lineHeightInput.min = String(numericSettingRanges.lineHeight.min);
    elements.lineHeightInput.max = String(numericSettingRanges.lineHeight.max);
    elements.lineHeightInput.step = String(numericSettingRanges.lineHeight.step);
    elements.pageMarginInput.min = String(numericSettingRanges.pageMargin.min);
    elements.pageMarginInput.max = String(numericSettingRanges.pageMargin.max);
    elements.pageMarginInput.step = String(numericSettingRanges.pageMargin.step);
    elements.themeSelect.value = settings.theme;
    elements.fontSizeInput.value = settings.fontSize;
    elements.lineHeightInput.value = settings.lineHeight;
    elements.pageMarginInput.value = settings.pageMargin;
    elements.layoutSelect.value = settings.layout;
    elements.disableDyslibriaInput.checked = settings.disableDyslibria;
    elements.fontSizeValue.textContent = `${settings.fontSize}%`;
    elements.lineHeightValue.textContent = formatSliderNumber(settings.lineHeight);
    elements.pageMarginValue.textContent = `${formatSliderNumber(settings.pageMargin, 1)}%`;
    updateFontChoiceSelection();
  }

  async function loadAppConfig() {
    if (!window.DyslibriaTheme || !appConfigUrl) {
      return;
    }

    try {
      const response = await fetch(appConfigUrl, {
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
    themeIds.forEach(function (themeClassName) {
      elements.app.classList.remove(themeClassName);
    });
    elements.app.classList.add(`theme-${settings.theme}`);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    const themeMode = themeModes[settings.theme] === 'dark' ? 'dark' : 'light';
    if (metaTheme) {
      if (window.DyslibriaTheme && appPalette) {
        metaTheme.setAttribute(
          'content',
          window.DyslibriaTheme.getMetaThemeColor(themeMode, appPalette)
        );
      } else {
        metaTheme.setAttribute('content', themeMode === 'dark' ? '#0f1620' : '#18281f');
      }
    }
  }

  function updateOverlayState() {
    const settingsOpen = allowSettingsOverlay && uiState.overlay === 'settings';
    const progressOpen = allowProgressOverlay && uiState.overlay === 'progress';
    const overlayVisible = Boolean(uiState.overlay);

    if (elements.settingsPanel) {
      elements.settingsPanel.hidden = !allowSettingsOverlay;
      elements.settingsPanel.classList.toggle('is-open', settingsOpen);
      elements.settingsPanel.setAttribute('aria-hidden', settingsOpen ? 'false' : 'true');
    }

    if (elements.progressPanel) {
      elements.progressPanel.hidden = !allowProgressOverlay;
      elements.progressPanel.classList.toggle('is-open', progressOpen);
      elements.progressPanel.setAttribute('aria-hidden', progressOpen ? 'false' : 'true');
    }

    if (elements.scrim) {
      elements.scrim.classList.toggle('is-visible', overlayVisible);
    }

    if (elements.progressActions) {
      elements.progressActions.hidden = !progressOpen;
      elements.progressActions.classList.toggle('is-visible', progressOpen);
    }
  }

  function openOverlay(name, options = {}) {
    if ((name === 'settings' && !allowSettingsOverlay) || (name === 'progress' && !allowProgressOverlay)) {
      return;
    }

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
    postReaderState('dyslibria-reader:ready');
  }

  function createReaderEventDetail(type) {
    return {
      type: type || 'dyslibria-reader:state',
      bookId: bookId,
      title: latestProgress.title || initialBookTitle || '',
      author: latestProgress.author || initialBookAuthor || '',
      language: initialBookLanguage,
      disableDyslibria: settings.disableDyslibria,
      progress: {
        ...latestProgress
      }
    };
  }

  function dispatchReaderEvent(type, detail, cancelable) {
    const payload = detail || createReaderEventDetail(type);
    const windowEvent = new CustomEvent(type, {
      detail: payload,
      cancelable: Boolean(cancelable)
    });
    window.dispatchEvent(windowEvent);
    document.dispatchEvent(new CustomEvent(type, {
      detail: payload
    }));
    return windowEvent;
  }

  function getProgressPersistenceDetail(pageLabel) {
    const safePageLabel = pageLabel ? `${pageLabel}. ` : '';

    if (shouldPersistProgress) {
      return `${safePageLabel}Reading progress saves automatically.`;
    }

    if (shouldPersistLocation) {
      return `${safePageLabel}Reading position is saved on this device.`;
    }

    return `${safePageLabel}Reading progress updates as you move through the book.`;
  }

  function normalizeHref(href) {
    return String(href || '').split('#')[0];
  }

  function getDisplaySpread() {
    return settings.layout === 'auto' ? 'auto' : settings.layout;
  }

  function getReaderPageMargins() {
    const pageMargin = normalizeNumericSetting(settings.pageMargin, numericSettingRanges.pageMargin);
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

    const width = Math.floor(elements.viewer.clientWidth);
    const height = Math.floor(elements.viewer.clientHeight);

    if (width > 0 && height > 0) {
      rendition.resize(width, height);
    }
  }

  function getStableLocationTarget() {
    if (rendition && typeof rendition.currentLocation === 'function') {
      const location = rendition.currentLocation();
      if (location && location.start && location.start.cfi) {
        return location.start.cfi;
      }
    }

    return latestProgress.location || requestedLocation || getSavedLocalLocation() || '';
  }

  function scheduleLayoutRealignment(targetLocation) {
    if (!rendition || !rendition.manager || !rendition.manager.isRendered()) {
      return;
    }

    if (layoutRealignTimer) {
      clearTimeout(layoutRealignTimer);
    }

    layoutRealignTimer = setTimeout(function () {
      layoutRealignTimer = null;

      if (!rendition) {
        return;
      }

      const nextTargetLocation = targetLocation || getStableLocationTarget();
      if (!nextTargetLocation) {
        return;
      }

      Promise.resolve(rendition.display(nextTargetLocation)).catch(function (error) {
        console.warn('Unable to realign the paginated spread after a layout change:', error);
      });
    }, 48);
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

  function shouldIgnoreSurfaceAction(options) {
    const normalizedOptions = options || {};
    const now = Date.now();

    if (!normalizedOptions.fromTouch && now - uiState.lastTouchEventAt < 700) {
      return true;
    }

    if (normalizedOptions.fromTouch) {
      uiState.lastTouchEventAt = now;
    }

    if (now - uiState.lastSurfaceActionAt < 250) {
      return true;
    }

    uiState.lastSurfaceActionAt = now;
    return false;
  }

  function getTouchFromEvent(event, identifier) {
    if (!event) {
      return null;
    }

    const touchLists = [event.changedTouches, event.touches];

    for (let listIndex = 0; listIndex < touchLists.length; listIndex += 1) {
      const touchList = touchLists[listIndex];
      if (!touchList || !touchList.length) {
        continue;
      }

      if (typeof identifier === 'number') {
        for (let touchIndex = 0; touchIndex < touchList.length; touchIndex += 1) {
          const candidate = touchList[touchIndex];
          if (candidate && candidate.identifier === identifier) {
            return candidate;
          }
        }
      }

      if (touchList[0]) {
        return touchList[0];
      }
    }

    return null;
  }

  function clearActiveTouchGesture() {
    uiState.activeTouchGesture = null;
  }

  function isTapGesture(gesture, point) {
    if (!gesture || !point) {
      return false;
    }

    const elapsed = Date.now() - gesture.startedAt;
    const deltaX = point.x - gesture.startPoint.x;
    const deltaY = point.y - gesture.startPoint.y;
    const travel = Math.hypot(deltaX, deltaY);

    return !gesture.moved && elapsed <= TAP_MAX_DURATION_MS && travel <= TAP_MAX_TRAVEL_PX;
  }

  function startTouchGesture(event, contents, scope) {
    if (!event || uiState.overlay || isInteractiveTarget(event.target)) {
      clearActiveTouchGesture();
      return;
    }

    if (!event.touches || event.touches.length !== 1) {
      clearActiveTouchGesture();
      return;
    }

    const touch = getTouchFromEvent(event);
    if (!touch) {
      clearActiveTouchGesture();
      return;
    }

    const point = normalizePointerPoint({
      x: touch.clientX,
      y: touch.clientY
    }, contents);

    if (!point) {
      clearActiveTouchGesture();
      return;
    }

    uiState.activeTouchGesture = {
      identifier: touch.identifier,
      startedAt: Date.now(),
      startPoint: point,
      lastPoint: point,
      moved: false,
      scope: scope || 'content',
      contents: contents || null
    };
  }

  function updateTouchGesture(event, contents) {
    const gesture = uiState.activeTouchGesture;
    if (!gesture) {
      return;
    }

    const touch = getTouchFromEvent(event, gesture.identifier);
    if (!touch) {
      return;
    }

    const point = normalizePointerPoint({
      x: touch.clientX,
      y: touch.clientY
    }, contents || gesture.contents);

    if (!point) {
      return;
    }

    gesture.lastPoint = point;

    if (!gesture.moved) {
      const deltaX = point.x - gesture.startPoint.x;
      const deltaY = point.y - gesture.startPoint.y;
      if (Math.hypot(deltaX, deltaY) > TAP_MAX_TRAVEL_PX) {
        gesture.moved = true;
      }
    }
  }

  function finishTouchGesture(event, contents, scope) {
    const gesture = uiState.activeTouchGesture;
    clearActiveTouchGesture();

    if (!gesture || gesture.scope !== (scope || 'content') || uiState.overlay || isInteractiveTarget(event.target)) {
      return;
    }

    const touch = getTouchFromEvent(event, gesture.identifier);
    if (!touch) {
      return;
    }

    const point = normalizePointerPoint({
      x: touch.clientX,
      y: touch.clientY
    }, contents || gesture.contents);

    if (!isTapGesture(gesture, point)) {
      return;
    }

    if (shouldIgnoreSurfaceAction({ fromTouch: true })) {
      return;
    }

    handleViewportZoneAction(point, event);
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
      allowProgressOverlay &&
      xRatio >= zoneConfig.progressMinX &&
      xRatio <= zoneConfig.progressMaxX &&
      yRatio >= zoneConfig.progressMinY
    ) {
      openOverlay('progress');
      return;
    }

    if (
      allowSettingsOverlay &&
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

    if (shouldIgnoreSurfaceAction()) {
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

    if (shouldIgnoreSurfaceAction()) {
      return;
    }

    const point = getPointerClientPoint(event, null);
    if (!point) {
      return;
    }

    handleViewportZoneAction(point, event);
  }

  function handleContentTouchStart(event, contents) {
    startTouchGesture(event, contents, 'content');
  }

  function handleContentTouchMove(event, contents) {
    updateTouchGesture(event, contents);
  }

  function handleContentTouchEnd(event, contents) {
    finishTouchGesture(event, contents, 'content');
  }

  function handleShellTouchStart(event) {
    if (
      !elements.viewerFrame ||
      !elements.viewerFrame.contains(event.target) ||
      (event.target !== elements.viewerFrame && event.target !== elements.viewer)
    ) {
      clearActiveTouchGesture();
      return;
    }

    startTouchGesture(event, null, 'shell');
  }

  function handleShellTouchMove(event) {
    updateTouchGesture(event, null);
  }

  function handleShellTouchEnd(event) {
    if (
      !elements.viewerFrame ||
      !elements.viewerFrame.contains(event.target) ||
      (event.target !== elements.viewerFrame && event.target !== elements.viewer)
    ) {
      clearActiveTouchGesture();
      return;
    }

    finishTouchGesture(event, null, 'shell');
  }

  function attachContentTouchInteractions(contents) {
    if (!contents || !contents.document) {
      return;
    }

    const doc = contents.document;
    const root = doc.documentElement;

    if (root && root.dataset.dyslibriaTouchInteractionsBound === 'true') {
      return;
    }

    if (root) {
      root.dataset.dyslibriaTouchInteractionsBound = 'true';
    }

    doc.addEventListener('touchstart', function (event) {
      handleContentTouchStart(event, contents);
    }, { passive: true });

    doc.addEventListener('touchmove', function (event) {
      handleContentTouchMove(event, contents);
    }, { passive: true });

    doc.addEventListener('touchend', function (event) {
      handleContentTouchEnd(event, contents);
    }, { passive: false });

    doc.addEventListener('touchcancel', clearActiveTouchGesture, { passive: true });
  }

  function postReaderState(type) {
    const payload = createReaderEventDetail(type);
    dispatchReaderEvent(payload.type, payload);

    if (window.parent === window || !window.parent) {
      return;
    }

    window.parent.postMessage(payload, window.location.origin);
  }

  function syncDisableDyslibriaSetting(nextValue) {
    const safeValue = Boolean(nextValue);

    if (settings.disableDyslibria === safeValue) {
      postReaderState();
      return;
    }

    settings.disableDyslibria = safeValue;
    updateSettingLabels();
    applyReaderSettings();
    persistSettings();
    postReaderState();
  }

  function handleParentMessage(event) {
    if (event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') {
      return;
    }

    if (event.data.type === 'dyslibria-reader:set-disable-dyslibria') {
      syncDisableDyslibriaSetting(event.data.disableDyslibria);
      return;
    }

    if (event.data.type === 'dyslibria-reader:request-state') {
      postReaderState();
    }
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

  function normalizeInlineText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isCoverLikeDocument(doc) {
    if (!doc || !doc.body) {
      return false;
    }

    const body = doc.body;
    const root = doc.documentElement;

    if (body.classList.contains('x-ebookmaker-coverpage')) {
      return true;
    }

    if (root && root.classList && root.classList.contains('x-ebookmaker-coverpage')) {
      return true;
    }

    if (body.querySelector('.x-ebookmaker-cover')) {
      return true;
    }

    const images = body.querySelectorAll('img, picture img');
    if (images.length !== 1) {
      return false;
    }

    if (body.querySelector('table, ul, ol, dl, pre, code, article, section, aside, main, nav')) {
      return false;
    }

    const readableBlocks = Array.from(
      body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, figcaption, blockquote')
    ).filter(function (element) {
      return normalizeInlineText(element.textContent);
    });

    if (readableBlocks.length > 0) {
      return false;
    }

    const childTags = Array.from(body.children).map(function (element) {
      return element.tagName.toLowerCase();
    });
    const compactWrapper = childTags.every(function (tagName) {
      return ['div', 'figure', 'img', 'picture', 'a', 'br'].includes(tagName);
    });

    if (!compactWrapper) {
      return false;
    }

    const bodyText = normalizeInlineText(body.textContent);
    const anchorLabels = Array.from(body.querySelectorAll('a'))
      .map(function (anchor) {
        return normalizeInlineText(anchor.textContent);
      })
      .filter(Boolean);
    const onlyCoverNavigation =
      anchorLabels.length > 0 &&
      anchorLabels.every(function (label) {
        return ['back', 'cover', 'front cover', 'title page', 'continue'].includes(label);
      });
    const titleHint = /cover|jacket|linked image/.test(normalizeInlineText(doc.title));

    return (
      titleHint ||
      bodyText === '' ||
      bodyText === 'back' ||
      bodyText === 'cover' ||
      onlyCoverNavigation
    );
  }

  function updateCoverPresentationMode(doc) {
    if (!doc || !doc.body) {
      return;
    }

    const isCoverPage = isCoverLikeDocument(doc);
    const root = doc.documentElement;
    const coverNavigationLabels = ['back', 'cover', 'front cover', 'title page', 'continue'];

    Array.from(doc.querySelectorAll('a')).forEach(function (anchor) {
      const label = normalizeInlineText(anchor.textContent);
      const isCoverNavigationLink =
        !anchor.querySelector('img, picture, svg') &&
        coverNavigationLabels.includes(label);

      if (isCoverPage && isCoverNavigationLink) {
        anchor.setAttribute('data-dyslibria-cover-nav', 'true');
      } else {
        anchor.removeAttribute('data-dyslibria-cover-nav');
      }
    });

    if (root) {
      if (isCoverPage) {
        root.setAttribute('data-dyslibria-cover-page', 'true');
      } else {
        root.removeAttribute('data-dyslibria-cover-page');
      }
    }

    if (isCoverPage) {
      doc.body.setAttribute('data-dyslibria-cover-page', 'true');
    } else {
      doc.body.removeAttribute('data-dyslibria-cover-page');
    }
  }

  function buildContentPresentationStyles() {
    const readerStyleSource = elements.app || document.documentElement;
    const readerStyles = window.getComputedStyle(readerStyleSource);
    const fontFamily = fontFamilies[settings.fontFamily] || fontFamilies.accessible;
    const pageText = readerStyles.getPropertyValue('--reader-page-text').trim() || '#1b1a18';
    const pageBackground = readerStyles.backgroundColor || '#f6f2e8';
    const pageBackgroundImage = readerStyles.backgroundImage || 'none';
    const pageBackgroundSize = readerStyles.backgroundSize || 'auto';
    const pageBackgroundRepeat = readerStyles.backgroundRepeat || 'no-repeat';
    const pageBackgroundPosition = readerStyles.backgroundPosition || 'center';
    const pageBackgroundBlendMode = readerStyles.backgroundBlendMode || 'normal';

    const dyslibriaOffRules = settings.disableDyslibria
      ? `
      b,
      strong,
      .dyslibria-tier-primary,
      .dyslibria-tier-secondary,
      .dyslibria-tier-tertiary,
      .dl-anchor-primary,
      .dl-anchor-secondary,
      .dl-anchor-tertiary,
      .dyslibria-frontload-prefix,
      .dl-prefix {
        font-weight: inherit !important;
        opacity: 1 !important;
      }

      .dyslibria-tier-spacing,
      .dl-spacing-only {
        letter-spacing: inherit !important;
      }

      .dyslibria-tier-marker,
      .dl-marker-only {
        box-shadow: none !important;
      }
    `
      : '';

    return `
      html,
      body {
        -webkit-text-size-adjust: 100% !important;
        text-size-adjust: 100% !important;
        background-color: ${pageBackground} !important;
        background-image: ${pageBackgroundImage} !important;
        background-size: ${pageBackgroundSize} !important;
        background-repeat: ${pageBackgroundRepeat} !important;
        background-position: ${pageBackgroundPosition} !important;
        background-blend-mode: ${pageBackgroundBlendMode} !important;
        color: ${pageText} !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        box-shadow: none !important;
        font-family: ${fontFamily} !important;
      }

      body {
        line-height: ${String(settings.lineHeight)} !important;
        text-rendering: optimizeLegibility;
      }

      body * {
        font-family: inherit !important;
      }

      body > main,
      body > article,
      body > section,
      body > div,
      body > .chapter,
      body > .section,
      body > .book,
      body > .calibre {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: 0 !important;
        box-shadow: none !important;
      }

      img,
      svg,
      video,
      canvas,
      figure,
      picture {
        max-width: 100% !important;
        height: auto !important;
        background: transparent !important;
        background-color: transparent !important;
      }

      a,
      a:visited {
        color: inherit !important;
        text-decoration-color: currentColor !important;
      }

      .dyslibria-engine,
      .dl-engine,
      .dyslibria-paragraph,
      .dl-paragraph,
      .dyslibria-word,
      .dl-word,
      .dyslibria-zone,
      .dl-zone,
      .dyslibria-frontload-remainder,
      .dl-frontload-remainder,
      .dyslibria-frontload-prefix,
      .dl-prefix {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        color: inherit !important;
        line-height: ${String(settings.lineHeight)} !important;
        white-space: normal !important;
      }

      html[data-dyslibria-cover-page="true"],
      body[data-dyslibria-cover-page="true"] {
        background: transparent !important;
        background-color: transparent !important;
      }

      body[data-dyslibria-cover-page="true"] {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: none !important;
        min-height: 100% !important;
      }

      body[data-dyslibria-cover-page="true"].dyslibria-engine,
      body[data-dyslibria-cover-page="true"].dl-engine {
        max-width: none !important;
      }

      body[data-dyslibria-cover-page="true"] .x-ebookmaker-cover,
      body[data-dyslibria-cover-page="true"] .x-ebookmaker-wrapper,
      body[data-dyslibria-cover-page="true"] .dyslibria-paragraph,
      body[data-dyslibria-cover-page="true"] .dl-paragraph,
      body[data-dyslibria-cover-page="true"] figure,
      body[data-dyslibria-cover-page="true"] picture,
      body[data-dyslibria-cover-page="true"] div {
        background: transparent !important;
        background-color: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: none !important;
        width: auto !important;
        height: auto !important;
        text-indent: 0 !important;
      }

      body[data-dyslibria-cover-page="true"] img,
      body[data-dyslibria-cover-page="true"] picture img {
        display: block !important;
        margin: 0 auto !important;
        max-width: 100% !important;
        max-height: 100% !important;
        object-fit: contain !important;
      }

      body[data-dyslibria-cover-page="true"] a[data-dyslibria-cover-nav="true"],
      body[data-dyslibria-cover-page="true"] br {
        display: none !important;
      }

      ${dyslibriaOffRules}
    `;
  }

  function buildRenditionThemeRules() {
    const readerStyleSource = elements.app || document.documentElement;
    const readerStyles = window.getComputedStyle(readerStyleSource);
    const fontFamily = fontFamilies[settings.fontFamily] || fontFamilies.accessible;
    const pageText = readerStyles.getPropertyValue('--reader-page-text').trim() || '#1b1a18';
    const pageBackground = readerStyles.backgroundColor || '#f6f2e8';
    const pageBackgroundImage = readerStyles.backgroundImage || 'none';
    const pageBackgroundSize = readerStyles.backgroundSize || 'auto';
    const pageBackgroundRepeat = readerStyles.backgroundRepeat || 'no-repeat';
    const pageBackgroundPosition = readerStyles.backgroundPosition || 'center';
    const pageBackgroundBlendMode = readerStyles.backgroundBlendMode || 'normal';

    return {
      html: {
        '-webkit-text-size-adjust': '100% !important',
        'text-size-adjust': '100% !important',
        'background-color': `${pageBackground} !important`,
        'background-image': `${pageBackgroundImage} !important`,
        'background-size': `${pageBackgroundSize} !important`,
        'background-repeat': `${pageBackgroundRepeat} !important`,
        'background-position': `${pageBackgroundPosition} !important`,
        'background-blend-mode': `${pageBackgroundBlendMode} !important`,
        'color': `${pageText} !important`,
        margin: '0 !important',
        padding: '0 !important',
        border: '0 !important',
        'box-shadow': 'none !important',
        'font-family': `${fontFamily} !important`
      },
      body: {
        'font-family': `${fontFamily} !important`,
        'line-height': `${String(settings.lineHeight)} !important`,
        'text-rendering': 'optimizeLegibility',
        'background-color': `${pageBackground} !important`,
        'background-image': `${pageBackgroundImage} !important`,
        'background-size': `${pageBackgroundSize} !important`,
        'background-repeat': `${pageBackgroundRepeat} !important`,
        'background-position': `${pageBackgroundPosition} !important`,
        'background-blend-mode': `${pageBackgroundBlendMode} !important`,
        'color': `${pageText} !important`,
        margin: '0 !important',
        padding: '0 !important',
        border: '0 !important',
        'box-shadow': 'none !important'
      },
      'body *': {
        'font-family': 'inherit !important'
      },
      'body > main, body > article, body > section, body > div, body > .chapter, body > .section, body > .book, body > .calibre': {
        'background': 'transparent !important',
        'background-color': 'transparent !important',
        'background-image': 'none !important',
        border: '0 !important',
        'box-shadow': 'none !important'
      },
      'img, svg, video, canvas': {
        'max-width': '100%',
        height: 'auto'
      },
      'figure, picture': {
        'max-width': '100%'
      },
      '.dyslibria-engine, .dl-engine, .dyslibria-paragraph, .dl-paragraph, .dyslibria-word, .dl-word, .dyslibria-zone, .dl-zone, .dyslibria-frontload-remainder, .dl-frontload-remainder, .dyslibria-frontload-prefix, .dl-prefix': {
        'background': 'transparent !important',
        'background-color': 'transparent !important',
        'background-image': 'none !important'
      }
    };
  }

  function applyContentPresentationOverrides(contents) {
    if (!contents || !contents.document) {
      return;
    }

    const doc = contents.document;
    updateCoverPresentationMode(doc);
    applyInlineContentRootPresentation(doc);
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

  function applyInlineContentRootPresentation(doc) {
    if (!doc) {
      return;
    }

    const readerStyleSource = elements.app || document.documentElement;
    const readerStyles = window.getComputedStyle(readerStyleSource);
    const fontFamily = fontFamilies[settings.fontFamily] || fontFamilies.accessible;
    const pageText = readerStyles.getPropertyValue('--reader-page-text').trim() || '#1b1a18';
    const pageBackground = readerStyles.backgroundColor || '#f6f2e8';
    const pageBackgroundImage = readerStyles.backgroundImage || 'none';
    const pageBackgroundSize = readerStyles.backgroundSize || 'auto';
    const pageBackgroundRepeat = readerStyles.backgroundRepeat || 'no-repeat';
    const pageBackgroundPosition = readerStyles.backgroundPosition || 'center';
    const pageBackgroundBlendMode = readerStyles.backgroundBlendMode || 'normal';
    const isCoverPage = Boolean(
      (doc.documentElement && doc.documentElement.getAttribute('data-dyslibria-cover-page') === 'true') ||
      (doc.body && doc.body.getAttribute('data-dyslibria-cover-page') === 'true')
    );
    const nonContentTagNames = new Set(['HTML', 'BODY', 'HEAD', 'STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE', 'BASE', 'NOSCRIPT']);

    [doc.documentElement, doc.body].forEach(function (element) {
      if (!element || !element.style) {
        return;
      }

      element.style.setProperty('-webkit-text-size-adjust', '100%', 'important');
      element.style.setProperty('text-size-adjust', '100%', 'important');
      element.style.setProperty('color', pageText, 'important');
      element.style.setProperty('border', '0', 'important');
      element.style.setProperty('box-shadow', 'none', 'important');
      element.style.setProperty('font-family', fontFamily, 'important');

      if (element === doc.body) {
        element.style.setProperty('line-height', String(settings.lineHeight), 'important');
      }

      if (isCoverPage) {
        element.style.setProperty('background', 'transparent', 'important');
        element.style.setProperty('background-color', 'transparent', 'important');
        element.style.setProperty('background-image', 'none', 'important');
        element.style.setProperty('background-size', 'auto', 'important');
        element.style.setProperty('background-repeat', 'no-repeat', 'important');
        element.style.setProperty('background-position', 'center', 'important');
        element.style.setProperty('background-blend-mode', 'normal', 'important');
        return;
      }

      // EPUB sources sometimes ship inline transparent backgrounds on html/body.
      // We rewrite the root styles inline so the reading document itself carries
      // the current reader theme instead of falling back to the browser's white canvas.
      element.style.setProperty('background', 'none', 'important');
      element.style.setProperty('background-color', pageBackground, 'important');
      element.style.setProperty('background-image', pageBackgroundImage, 'important');
      element.style.setProperty('background-size', pageBackgroundSize, 'important');
      element.style.setProperty('background-repeat', pageBackgroundRepeat, 'important');
      element.style.setProperty('background-position', pageBackgroundPosition, 'important');
      element.style.setProperty('background-blend-mode', pageBackgroundBlendMode, 'important');
    });

    Array.from(doc.querySelectorAll('*')).forEach(function (element) {
      if (!element || !element.style) {
        return;
      }

      if (nonContentTagNames.has(element.tagName)) {
        return;
      }

      if (typeof element.closest === 'function' && element.closest('svg, math')) {
        return;
      }

      element.style.setProperty('font-family', fontFamily, 'important');
    });
  }

  function updateOpenContentPresentationOverrides() {
    if (!rendition || typeof rendition.getContents !== 'function') {
      return;
    }

    rendition.getContents().forEach(function (contents) {
      applyContentPresentationOverrides(contents);
    });
  }

  async function fetchEpubBuffer() {
    const response = await fetch(epubUrl, {
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

    applyViewerMargins();

    // The reader should remain themeable and readable first, while Dyslibria
    // continues to control structure and emphasis inside the EPUB itself.
    rendition.themes.default(buildRenditionThemeRules());

    rendition.themes.fontSize(`${settings.fontSize}%`);
    rendition.flow('paginated');
    rendition.spread(getDisplaySpread());
    updateOpenContentPresentationOverrides();
    resizeRendition();
    scheduleLayoutRealignment();
  }

  function updateMetadata(title, author) {
    const safeTitle = title || initialBookTitle || 'Untitled book';
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
    elements.progressDetail.textContent = getProgressPersistenceDetail(pageLabel);

    if (latestProgress.location) {
      persistLocalLocation(latestProgress.location);
      scheduleReadingProgressSave(latestProgress);
    }

    dispatchReaderEvent('dyslibria-reader:progress', createReaderEventDetail('dyslibria-reader:progress'));
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
      elements.progressDetail.textContent = getProgressPersistenceDetail(snapshot.pageLabel);
    } else {
      const fallbackPageLabel = formatPageLabel(snapshot.pageNumber, snapshot.totalPages);
      if (fallbackPageLabel) {
        elements.progressDetail.textContent = getProgressPersistenceDetail(fallbackPageLabel);
      }
    }
  }

  function attachEventListeners() {
    window.addEventListener('message', handleParentMessage);

    if (elements.closeBookButton) {
      elements.closeBookButton.addEventListener('click', function (event) {
        const closeEvent = dispatchReaderEvent(
          'dyslibria-reader:close-requested',
          createReaderEventDetail('dyslibria-reader:close-requested'),
          true
        );

        if (!closeUrl || closeEvent.defaultPrevented) {
          event.preventDefault();
        }
      });
    }

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
      settings.fontSize = normalizeNumericSetting(this.value, numericSettingRanges.fontSize);
      updateSettingLabels();
      applyReaderSettings();
      persistSettings();
    });

    elements.lineHeightInput.addEventListener('input', function () {
      settings.lineHeight = normalizeNumericSetting(this.value, numericSettingRanges.lineHeight);
      updateSettingLabels();
      applyReaderSettings();
      persistSettings();
    });

    elements.pageMarginInput.addEventListener('input', function () {
      settings.pageMargin = normalizeNumericSetting(this.value, numericSettingRanges.pageMargin);
      updateSettingLabels();
      applyReaderSettings();
      persistSettings();
    });

    elements.layoutSelect.addEventListener('change', function () {
      settings.layout = this.value;
      applyReaderSettings();
      persistSettings();
    });

    elements.disableDyslibriaInput.addEventListener('change', function () {
      syncDisableDyslibriaSetting(this.checked);
    });

    window.addEventListener('resize', function () {
      applyReaderSettings();
    });

    elements.viewerFrame.addEventListener('click', handleShellSurfaceInteraction);
    elements.viewerFrame.addEventListener('touchstart', handleShellTouchStart, { passive: true });
    elements.viewerFrame.addEventListener('touchmove', handleShellTouchMove, { passive: true });
    elements.viewerFrame.addEventListener('touchend', handleShellTouchEnd, { passive: false });
    elements.viewerFrame.addEventListener('touchcancel', clearActiveTouchGesture, { passive: true });

    window.addEventListener('popstate', function () {
      if (uiState.overlay && uiState.overlayHistoryActive) {
        closeOverlay({ fromHistory: true });
      }
    });
  }

  async function initialiseReader() {
    if (!epubUrl) {
      updateMetadata('No EPUB selected', 'Open a book to start reading.');
      setLoadingState('No EPUB selected', 'Open a book to start reading.');
      setLoadingProgress(0, 'Open a book to start reading.');
      elements.chapterLabel.textContent = 'No book is currently loaded.';
      elements.progressDetail.textContent = 'Open a book to start reading.';
      openOverlay('settings', { pushHistory: false });
      return;
    }

    await loadAppConfig();
    renderThemeChoices();
    renderFontChoices();
    updateSettingLabels();
    applyShellTheme();
    applyViewerMargins();
    if (elements.closeBookButton) {
      if (shouldShowCloseButton) {
        elements.closeBookButton.href = closeUrl || '#';
        elements.closeBookButton.hidden = false;
      } else {
        elements.closeBookButton.hidden = true;
      }
    }
    attachEventListeners();

    try {
      if (initialBookTitle || initialBookAuthor) {
        updateMetadata(initialBookTitle, initialBookAuthor);
      }

      setLoadingProgress(8, 'Checking saved position');
      const savedProgressPromise = fetchSavedProgress();
      setLoadingProgress(18, 'Loading EPUB package');
      const epubBuffer = await fetchEpubBuffer();
      setLoadingProgress(34, 'Preparing browser reader');
      book = ePub(epubBuffer);
      rendition = book.renderTo('viewer', {
        width: '100%',
        height: '100%',
        spread: getDisplaySpread(),
        minSpreadWidth: AUTO_SPREAD_MIN_WIDTH
      });

      if (rendition.hooks && rendition.hooks.content) {
        rendition.hooks.content.register(function (contents) {
          lockContentSelection(contents);
          attachContentTouchInteractions(contents);
          applyContentPresentationOverrides(contents);
        });
      }

      applyReaderSettings();

      rendition.on('relocated', function (location) {
        updateProgress(location);
      });

      rendition.on('click', handleSurfaceInteraction);

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
