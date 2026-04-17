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
    layout: 'auto',
    flow: 'paginated'
  };

  const pageThemes = {
    paper: {
      background: '#fffdf7',
      color: '#1b1a18',
      link: '#1f4d89'
    },
    sepia: {
      background: '#fff7eb',
      color: '#2a2018',
      link: '#87542f'
    },
    midnight: {
      background: '#1f2632',
      color: '#eef3e8',
      link: '#8fc6ff'
    }
  };

  let appPalette = window.DyslibriaTheme
    ? window.DyslibriaTheme.applyPalette(window.DyslibriaTheme.DEFAULT_COLOR_KEY, document.documentElement)
    : null;

  const fontFamilies = {
    accessible: '"Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif',
    serif: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    classic: '"Gill Sans", "Trebuchet MS", sans-serif'
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
    loadingTitle: document.getElementById('loadingTitle'),
    loadingMeta: document.getElementById('loadingMeta'),
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
    bookTitle: document.getElementById('bookTitle'),
    bookMeta: document.getElementById('bookMeta'),
    tocList: document.getElementById('tocList'),
    progressLabel: document.getElementById('progressLabel'),
    chapterLabel: document.getElementById('chapterLabel'),
    progressFill: document.getElementById('progressFill'),
    installButton: document.getElementById('installButton'),
    themeSelect: document.getElementById('themeSelect'),
    fontFamilySelect: document.getElementById('fontFamilySelect'),
    fontSizeInput: document.getElementById('fontSizeInput'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    lineHeightInput: document.getElementById('lineHeightInput'),
    lineHeightValue: document.getElementById('lineHeightValue'),
    layoutSelect: document.getElementById('layoutSelect'),
    flowSelect: document.getElementById('flowSelect')
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

  const settings = parseStoredJson(SETTINGS_STORAGE_KEY, defaultSettings);

  if (window.DyslibriaPwa) {
    window.DyslibriaPwa.bindInstallButton(elements.installButton);
  }

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
    elements.fontFamilySelect.value = settings.fontFamily;
    elements.fontSizeInput.value = settings.fontSize;
    elements.lineHeightInput.value = settings.lineHeight;
    elements.layoutSelect.value = settings.layout;
    elements.flowSelect.value = settings.flow;
    elements.fontSizeValue.textContent = `${settings.fontSize}%`;
    elements.lineHeightValue.textContent = Number(settings.lineHeight).toFixed(1);
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

  function handleSurfaceInteraction(event, contents) {
    if (!contents || !contents.window || uiState.overlay) {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    const now = Date.now();
    if (event.type === 'click' && now - uiState.lastTouchEventAt < 700) {
      return;
    }

    if (event.type === 'touchend') {
      uiState.lastTouchEventAt = now;
    }

    if (now - uiState.lastSurfaceActionAt < 250) {
      return;
    }

    const point = getPointerClientPoint(event, contents);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    if (!point || viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }

    const xRatio = point.x / viewportWidth;
    const yRatio = point.y / viewportHeight;
    uiState.lastSurfaceActionAt = now;

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

    const baseTheme = pageThemes[settings.theme] || pageThemes.paper;
    const theme = {
      ...baseTheme,
      link: settings.theme === 'midnight'
        ? ((appPalette && appPalette.linkDark) || baseTheme.link)
        : ((appPalette && appPalette.linkLight) || baseTheme.link)
    };
    const fontFamily = fontFamilies[settings.fontFamily] || fontFamilies.accessible;

    rendition.themes.default({
      'html, body': {
        'background-color': theme.background,
        color: theme.color
      },
      body: {
        'background-color': theme.background,
        color: theme.color,
        'font-family': fontFamily,
        'line-height': String(settings.lineHeight),
        'font-weight': '400',
        'text-rendering': 'optimizeLegibility',
        margin: '0',
        padding: window.innerWidth < 700 ? '7% 7.5%' : '5.5% 6.5%'
      },
      p: {
        'line-height': String(settings.lineHeight),
        margin: '0 0 1em'
      },
      'b, strong, b *, strong *': {
        'font-weight': '700 !important',
        color: theme.color
      },
      'h1, h2, h3, h4, h5, h6': {
        color: theme.color
      },
      'img, svg': {
        'max-width': '100%',
        height: 'auto'
      },
      a: {
        color: theme.link
      }
    });

    rendition.themes.fontSize(`${settings.fontSize}%`);
    rendition.flow(settings.flow);
    rendition.spread(getDisplaySpread());
    resizeRendition();
  }

  function updateMetadata(title, author) {
    const safeTitle = title || fileName || 'Untitled book';
    const safeAuthor = author || 'Unknown author';

    elements.bookTitle.textContent = safeTitle;
    elements.bookMeta.textContent = safeAuthor;
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

  function buildTocList(items, isRoot) {
    const list = document.createElement('ul');
    list.className = isRoot ? 'toc-list' : 'toc-sublist';

    items.forEach(function (item) {
      const listItem = document.createElement('li');
      const button = document.createElement('button');
      const href = item.href || '';
      const children = item.subitems || item.children || [];

      button.type = 'button';
      button.className = 'toc-link';
      button.textContent = item.label || 'Untitled chapter';
      button.dataset.href = normalizeHref(href);
      button.addEventListener('click', function () {
        if (!rendition) {
          return;
        }

        rendition.display(href);
        closeOverlay();
      });

      listItem.appendChild(button);

      if (children.length > 0) {
        listItem.appendChild(buildTocList(children, false));
      }

      list.appendChild(listItem);
    });

    return list;
  }

  function renderTocList(items) {
    elements.tocList.innerHTML = '';
    elements.tocList.appendChild(buildTocList(items, true));
  }

  function formatPageLabel(pageNumber, totalPages) {
    if (!Number.isFinite(pageNumber) || !Number.isFinite(totalPages) || pageNumber <= 0 || totalPages <= 0) {
      return '';
    }

    return `Page ${pageNumber} of ${totalPages}`;
  }

  function setActiveTocEntry(currentHref) {
    const normalizedCurrentHref = normalizeHref(currentHref);
    const tocButtons = elements.tocList.querySelectorAll('.toc-link');

    tocButtons.forEach(function (button) {
      const buttonHref = button.dataset.href || '';
      const matches = normalizedCurrentHref && (
        normalizedCurrentHref === buttonHref ||
        normalizedCurrentHref.startsWith(buttonHref) ||
        buttonHref.startsWith(normalizedCurrentHref)
      );

      button.classList.toggle('is-active', matches);
    });
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
    setActiveTocEntry(activeHref);

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

    elements.fontFamilySelect.addEventListener('change', function () {
      settings.fontFamily = this.value;
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

    window.addEventListener('resize', function () {
      applyReaderSettings();
    });

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
      elements.chapterLabel.textContent = 'No file parameter was provided.';
      elements.progressDetail.textContent = 'Open a book from the library first.';
      openOverlay('settings', { pushHistory: false });
      return;
    }

    await loadAppConfig();
    updateSettingLabels();
    applyShellTheme();
    attachEventListeners();

    try {
      const savedProgressPromise = fetchSavedProgress(fileName);
      const epubBuffer = await fetchEpubBuffer(fileName);
      book = ePub(epubBuffer);
      rendition = book.renderTo('viewer', {
        width: '100%',
        height: '100%',
        spread: getDisplaySpread()
      });

      applyReaderSettings();

      rendition.on('relocated', function (location) {
        updateProgress(location);
      });

      rendition.on('click', handleSurfaceInteraction);
      rendition.on('touchend', handleSurfaceInteraction);

      await book.ready;
      readingDirection = (book.package && book.package.metadata && book.package.metadata.direction) || 'ltr';

      const metadata = (book.package && book.package.metadata) || {};
      updateMetadata(metadata.title, metadata.creator);

      const navigation = await book.loaded.navigation;
      const tocEntries = Array.isArray(navigation) ? navigation : (navigation.toc || []);
      flatTocEntries = [];
      flattenTocEntries(tocEntries, flatTocEntries);
      renderTocList(tocEntries);

      try {
        await book.locations.generate(1600);
      } catch (error) {
        console.warn('Unable to generate reading locations before first render:', error);
      }

      const savedProgress = await savedProgressPromise;
      applySavedProgress(savedProgress);

      const startingLocation = requestedLocation || (savedProgress && savedProgress.location) || getSavedLocalLocation();
      await rendition.display(startingLocation || undefined);
      applyReaderSettings();
      resizeRendition();
      markLoaded();
      updateProgress(rendition.currentLocation());
    } catch (error) {
      console.error('Reader failed to load:', error);
      updateMetadata('Unable to open book', error.message);
      setLoadingState('Unable to open book', 'This EPUB could not be rendered in the browser.');
      elements.chapterLabel.textContent = 'This EPUB could not be rendered in the browser.';
      elements.progressDetail.textContent = 'This file could not be rendered in the browser reader.';
      openOverlay('settings', { pushHistory: false });
    }
  }

  initialiseReader();
})();
