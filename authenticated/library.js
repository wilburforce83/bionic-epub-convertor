$(document).ready(function () {
  const THEME_STORAGE_KEY = 'dyslibria:library-theme:v1';
  const BANNER_STORAGE_KEY = 'dyslibria:library-banner-collapsed:v1';
  const LIBRARY_CACHE_KEY = 'dyslibria:library-cache:v1';
  const LIBRARY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const LIBRARY_RENDER_BATCH_SIZE = 24;
  const TIPS = [
    {
      title: 'Reader zones',
      text: 'Tap the left and right edges of the reader to turn pages. Tap the centre to open display settings.'
    },
    {
      title: 'Progress panel',
      text: 'Tap the lower middle area in the reader to open reading progress, see your place, and close the book.'
    },
    {
      title: 'Saved place',
      text: 'Dyslibria now saves your reading location on the server, so reopening a book takes you back to the same spot.'
    },
    {
      title: 'Phone layout',
      text: 'On phones and tablets the search bar stays visible while the rest of the toolbar collapses into the Menu button.'
    },
    {
      title: 'Conversion queue',
      text: 'Use the status pill and log viewer to check whether uploads are converting or to inspect recent conversion failures.'
    }
  ];

  const state = {
    books: [],
    query: '',
    latestProgress: null,
    session: null,
    theme: localStorage.getItem(THEME_STORAGE_KEY) || 'dark',
    themeColorKey: (window.DyslibriaTheme && window.DyslibriaTheme.DEFAULT_COLOR_KEY) || 'ember',
    themeColorOptions: (window.DyslibriaTheme && window.DyslibriaTheme.COLOR_OPTIONS.slice()) || [],
    palette: null,
    bannerCollapsed: localStorage.getItem(BANNER_STORAGE_KEY) === 'true',
    tipIndex: 0,
    tipTimer: null,
    status: null,
    logs: [],
    mobileMenuOpen: false,
    pendingPostConversionRefresh: false,
    autoRefreshInFlight: false,
    pendingBookAction: null,
    noticeTimer: null,
    libraryLoading: true,
    usingCachedLibrary: false,
    renderPassId: 0,
    uploading: false,
    currentVersion: '',
    latestVersion: '',
    updateAvailable: false,
    updateNoticeShown: false
  };

  const $app = $('#libraryApp');
  const $libraryNotice = $('#libraryNotice');
  const $libraryNoticeTitle = $('#libraryNoticeTitle');
  const $libraryNoticeCopy = $('#libraryNoticeCopy');
  const $dismissLibraryNotice = $('#dismissLibraryNotice');
  const $cards = $('#epubCards');
  const $emptyState = $('#emptyState');
  const $count = $('#libraryCount');
  const $libraryMeta = $('#libraryMeta');
  const $heroShell = $('#heroShell');
  const $heroToggle = $('#heroToggle');
  const $heroToggleIcon = $('#heroToggleIcon');
  const $heroToggleLabel = $('#heroToggleLabel');
  const $libraryLoading = $('#libraryLoading');
  const $libraryLoadingTitle = $('#libraryLoadingTitle');
  const $libraryLoadingText = $('#libraryLoadingText');
  const $searchBar = $('#searchBar');
  const $dropZone = $('#dropZone');
  const $fileInput = $('#epubFiles');
  const $uploadModal = $('#uploadModal');
  const $uploadForm = $('#uploadForm');
  const $uploadSubmitButton = $('#uploadSubmitButton');
  const $uploadProgress = $('#uploadProgress');
  const $uploadProgressTitle = $('#uploadProgressTitle');
  const $uploadProgressPercent = $('#uploadProgressPercent');
  const $uploadProgressFill = $('#uploadProgressFill');
  const $uploadProgressCopy = $('#uploadProgressCopy');
  const $uploadProgressMeta = $('#uploadProgressMeta');
  const $adminTools = $('.admin-tool');
  const $themeToggle = $('#themeToggle');
  const $themeToggleIcon = $('#themeToggleIcon');
  const $themeToggleText = $('#themeToggleText');
  const $conversionStatus = $('#conversionStatus');
  const $conversionStatusText = $('#conversionStatusText');
  const $heroStatusText = $('#heroStatusText');
  const $heroStatusMeta = $('#heroStatusMeta');
  const $tipTitle = $('#tipTitle');
  const $tipText = $('#tipText');
  const $continueTitle = $('#continueTitle');
  const $continueMeta = $('#continueMeta');
  const $continueProgressShell = $('#continueProgressShell');
  const $continueProgressFill = $('#continueProgressFill');
  const $continueProgressLabel = $('#continueProgressLabel');
  const $continueProgressDetail = $('#continueProgressDetail');
  const $continueButton = $('#continueButton');
  const $continueUpdated = $('#continueUpdated');
  const $viewLogsButton = $('#viewLogsButton');
  const $viewLogsLabel = $('#viewLogsLabel');
  const $logsMeta = $('#logsMeta');
  const $logsOutput = $('#logsOutput');
  const $menuToggle = $('#menuToggle');
  const $toolbarActions = $('#toolbarActions');
  const $bookActionConfirmModal = $('#bookActionConfirmModal');
  const $bookActionConfirmHeading = $('#bookActionConfirmHeading');
  const $bookActionConfirmCopy = $('#bookActionConfirmCopy');
  const $bookActionConfirmNote = $('#bookActionConfirmNote');
  const $confirmBookActionButton = $('#confirmBookActionButton');

  function clearNotice() {
    if (state.noticeTimer) {
      window.clearTimeout(state.noticeTimer);
      state.noticeTimer = null;
    }

    $libraryNotice.prop('hidden', true).addClass('hidden').removeClass('is-success is-error');
  }

  function showNotice(message, tone, options) {
    const variant = tone || 'info';
    const config = options || {};
    const timeout = config.timeout === undefined ? (variant === 'error' ? 7000 : 5000) : config.timeout;

    if (state.noticeTimer) {
      window.clearTimeout(state.noticeTimer);
      state.noticeTimer = null;
    }

    $libraryNoticeTitle.text(config.title || (variant === 'error' ? 'Something went wrong' : 'Updated'));
    $libraryNoticeCopy.text(message);
    $libraryNotice
      .prop('hidden', false)
      .removeClass('hidden is-success is-error')
      .toggleClass('is-success', variant === 'success')
      .toggleClass('is-error', variant === 'error');

    if (timeout > 0) {
      state.noticeTimer = window.setTimeout(clearNotice, timeout);
    }
  }

  function randomTipDelay() {
    return 10000 + Math.floor(Math.random() * 5000);
  }

  function formatRelativeTime(value) {
    const timestamp = Date.parse(value || '');
    if (!timestamp) {
      return 'No recent session';
    }

    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatBytes(value) {
    const size = Number(value) || 0;
    if (size <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let currentValue = size;

    while (currentValue >= 1024 && unitIndex < units.length - 1) {
      currentValue /= 1024;
      unitIndex += 1;
    }

    const precision = currentValue >= 10 || unitIndex === 0 ? 0 : 1;
    return `${currentValue.toFixed(precision)} ${units[unitIndex]}`;
  }

  function getSelectedUploadFiles() {
    const input = $fileInput.get(0);
    return input && input.files ? Array.from(input.files) : [];
  }

  function summarizeFiles(files) {
    return files.reduce(function (summary, file) {
      return {
        count: summary.count + 1,
        totalBytes: summary.totalBytes + (Number(file && file.size) || 0)
      };
    }, {
      count: 0,
      totalBytes: 0
    });
  }

  function setUploadBusy(busy) {
    state.uploading = Boolean(busy);
    setButtonBusy($uploadSubmitButton, state.uploading);
    $fileInput.prop('disabled', state.uploading);
    $dropZone.toggleClass('is-disabled', state.uploading);
  }

  function setUploadProgressState(config) {
    const options = config || {};
    const percent = Math.max(0, Math.min(100, Number(options.percent) || 0));

    $uploadProgress.prop('hidden', false).toggleClass('is-error', options.tone === 'error');
    $uploadProgressTitle.text(options.title || 'Preparing upload');
    $uploadProgressPercent.text(`${Math.round(percent)}%`);
    $uploadProgressFill.css('width', `${percent}%`);
    $uploadProgressCopy.text(options.copy || '');
    $uploadProgressMeta.text(options.meta || '');
  }

  function syncSelectedFilesUi() {
    const files = getSelectedUploadFiles();

    if (!files.length) {
      $dropZone.text('Drag EPUB files here or click to choose them');
      $uploadProgress.prop('hidden', true).removeClass('is-error');
      $uploadProgressFill.css('width', '0%');
      $uploadProgressPercent.text('0%');
      return;
    }

    const summary = summarizeFiles(files);
    $dropZone.text(files.length > 1 ? `${files.length} files selected` : files[0].name);
    setUploadProgressState({
      percent: 0,
      title: files.length > 1 ? `${files.length} books selected` : files[0].name,
      copy: `Ready to upload ${summary.count} EPUB${summary.count === 1 ? '' : 's'} into Dyslibria's conversion queue.`,
      meta: `${formatBytes(summary.totalBytes)} total. Click "Convert and add to library" when you're ready.`
    });
  }

  function resetUploadFormState() {
    setUploadBusy(false);
    const formElement = $uploadForm.get(0);
    if (formElement) {
      formElement.reset();
    }

    $dropZone.removeClass('dragover is-disabled').text('Drag EPUB files here or click to choose them');
    $uploadProgress.prop('hidden', true).removeClass('is-error');
    $uploadProgressFill.css('width', '0%');
    $uploadProgressPercent.text('0%');
    $uploadProgressTitle.text('Choose books to upload');
    $uploadProgressCopy.text('Select one or more EPUB files to start a new conversion batch.');
    $uploadProgressMeta.text('Nothing selected yet.');
  }

  function buildBookCoverUrl(book) {
    const filename = String(book && book.filename || '');
    if (!filename) {
      return '';
    }

    const version = encodeURIComponent(String(book && book.lastModified || ''));
    return `/api/books/${encodeURIComponent(filename)}/cover${version ? `?v=${version}` : ''}`;
  }

  function normalizeBook(book) {
    const entry = book && typeof book === 'object' ? book : {};

    return {
      filename: entry.filename || '',
      title: entry.title || '',
      author: entry.author || '',
      lastModified: entry.lastModified || '',
      isValid: entry.isValid !== false,
      processingError: entry.processingError || '',
      coverUrl: entry.coverUrl || buildBookCoverUrl(entry)
    };
  }

  function persistLibrarySnapshot(books) {
    try {
      const payload = {
        cachedAt: Date.now(),
        books: books.map(normalizeBook)
      };

      localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Ignore cache write failures so library rendering still succeeds.
    }
  }

  function readLibrarySnapshot() {
    try {
      const rawValue = localStorage.getItem(LIBRARY_CACHE_KEY);
      if (!rawValue) {
        return [];
      }

      const payload = JSON.parse(rawValue);
      const cachedAt = Number(payload && payload.cachedAt);
      const books = Array.isArray(payload && payload.books) ? payload.books : [];

      if (!cachedAt || (Date.now() - cachedAt) > LIBRARY_CACHE_MAX_AGE_MS) {
        try {
          localStorage.removeItem(LIBRARY_CACHE_KEY);
        } catch (storageError) {
          // Ignore storage cleanup failures.
        }
        return [];
      }

      return books
        .map(normalizeBook)
        .filter(function (book) {
          return Boolean(book.filename);
        });
    } catch (error) {
      try {
        localStorage.removeItem(LIBRARY_CACHE_KEY);
      } catch (storageError) {
        // Ignore storage cleanup failures.
      }
      return [];
    }
  }

  function setLibraryLoadingState(loading, options) {
    const config = options || {};
    const hasVisibleBooks = state.books.length > 0;

    state.libraryLoading = Boolean(loading);

    if (!state.libraryLoading) {
      $libraryLoading.removeClass('is-active is-compact');
      return;
    }

    $libraryLoadingTitle.text(config.title || (hasVisibleBooks ? 'Refreshing your library' : 'Loading your library'));
    $libraryLoadingText.text(
      config.text || (
        hasVisibleBooks
          ? 'Checking the server for the latest library changes.'
          : 'Gathering your books and preparing the shelf.'
      )
    );
    $libraryLoading
      .addClass('is-active')
      .toggleClass('is-compact', hasVisibleBooks);
  }

  function getLibraryMetaCopy(visibleCount, totalCount) {
    if (state.libraryLoading && totalCount > 0) {
      return state.usingCachedLibrary
        ? 'Showing your saved shelf while Dyslibria checks the server for updates.'
        : 'Refreshing your shelf with the latest changes.';
    }

    if (state.usingCachedLibrary && totalCount > 0) {
      return 'Showing your last saved shelf.';
    }

    if (state.query && visibleCount !== totalCount) {
      return `${totalCount - visibleCount} hidden by the current search.`;
    }

    return '';
  }

  function buildReaderUrl(progress) {
    const params = new URLSearchParams({
      file: progress.filename
    });

    if (progress.location) {
      params.set('loc', progress.location);
    }

    return `reader.html?${params.toString()}`;
  }

  function populateThemeColorOptions() {
    return state.themeColorOptions.length
      ? state.themeColorOptions
      : ((window.DyslibriaTheme && window.DyslibriaTheme.COLOR_OPTIONS) || []);
  }

  function applyAccentPalette() {
    if (!window.DyslibriaTheme) {
      return;
    }

    state.palette = window.DyslibriaTheme.applyPalette(state.themeColorKey, document.documentElement);
    $('meta[name="theme-color"]').attr(
      'content',
      window.DyslibriaTheme.getMetaThemeColor(state.theme, state.palette)
    );
  }

  function applyTheme() {
    const isDark = state.theme === 'dark';
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);
    $app.toggleClass('theme-dark', isDark);
    $app.toggleClass('theme-light', !isDark);
    $themeToggleIcon.attr('class', isDark ? 'sun icon' : 'moon icon');
    $themeToggleText.text(isDark ? 'Light theme' : 'Dark theme');
    applyAccentPalette();
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  }

  function canDeleteBooks() {
    return Boolean(state.session && state.session.canManageSystem);
  }

  function applySessionCapabilities() {
    $adminTools.prop('hidden', !canDeleteBooks());
  }

  function maybeShowUpdateNotice() {
    if (state.updateNoticeShown || !state.session || !state.session.canManageSystem || !state.updateAvailable) {
      return;
    }

    if (!state.currentVersion || !state.latestVersion) {
      return;
    }

    showNotice(`Version ${state.latestVersion} is available. You're running ${state.currentVersion}.`, 'info', {
      title: 'Update available',
      timeout: 0
    });
    state.updateNoticeShown = true;
  }

  function loadUpdateStatus() {
    if (!state.session || !state.session.canManageSystem) {
      return $.Deferred().resolve().promise();
    }

    return $.get('/api/update-status').then(function (payload) {
      state.currentVersion = (payload && payload.currentVersion) || state.currentVersion;
      state.latestVersion = (payload && payload.latestVersion) || '';
      state.updateAvailable = Boolean(payload && payload.updateAvailable);
      maybeShowUpdateNotice();
    }).catch(function () {
      state.latestVersion = '';
      state.updateAvailable = false;
    });
  }

  function closeCardMenus() {
    $cards.find('.card-menu').prop('hidden', true);
    $cards.find('.card-menu-toggle').attr('aria-expanded', 'false');
  }

  function setConfirmButtonStyle(label, isDanger) {
    $confirmBookActionButton
      .text(label)
      .removeClass('accent danger')
      .addClass(isDanger ? 'danger' : 'accent');
  }

  function openBookActionConfirm(config) {
    state.pendingBookAction = config;
    $bookActionConfirmHeading.text(config.heading);
    $bookActionConfirmCopy.text(config.copy);
    $bookActionConfirmNote.text(config.note || '');
    $bookActionConfirmNote.prop('hidden', !config.note);
    setConfirmButtonStyle(config.confirmLabel, config.danger !== false);

    $bookActionConfirmModal.modal({
      closable: false,
      autofocus: false,
      onHidden: function () {
        state.pendingBookAction = null;
        setButtonBusy($confirmBookActionButton, false);
      }
    }).modal('show');
  }

  function applyBannerState() {
    $heroShell.toggleClass('is-collapsed', state.bannerCollapsed);
    $heroToggle.attr('aria-expanded', String(!state.bannerCollapsed));
    $heroToggleLabel.text(state.bannerCollapsed ? 'Expand Dashboard' : 'Collapse Dashboard');
    $heroToggleIcon.attr('class', state.bannerCollapsed ? 'angle down icon' : 'angle up icon');
    localStorage.setItem(BANNER_STORAGE_KEY, String(state.bannerCollapsed));
  }

  function updateCountLabel(visibleCount, totalCount) {
    const suffix = visibleCount === 1 ? 'book' : 'books';
    const prefix = state.query && visibleCount !== totalCount
      ? `${visibleCount} of ${totalCount}`
      : `${visibleCount}`;

    $count.text(`${prefix} ${suffix}`);
    $libraryMeta.text(getLibraryMetaCopy(visibleCount, totalCount));
  }

  function getFilteredBooks() {
    const query = state.query.trim().toLowerCase();
    if (!query) {
      return state.books.slice();
    }

    return state.books.filter(function (book) {
      const title = String(book.title || '').toLowerCase();
      const author = String(book.author || '').toLowerCase();
      return title.includes(query) || author.includes(query);
    });
  }

  function createCard(book) {
    const filename = book.filename || '';
    const titleText = book.title || filename || 'Untitled';
    const $card = $('<article>').addClass('library-card').attr('data-filename', filename);
    const $coverSurface = $('<div>').addClass('cover-surface');
    const $menuShell = $('<div>').addClass('card-menu-shell');
    const $menuToggle = $('<button>')
      .addClass('card-menu-toggle')
      .attr({
        type: 'button',
        'aria-label': `Actions for ${titleText}`,
        'aria-expanded': 'false',
        'aria-haspopup': 'true'
      })
      .append($('<i>').addClass('ellipsis vertical icon').attr('aria-hidden', 'true'));
    const $menu = $('<div>').addClass('card-menu').prop('hidden', true);
    const $image = $('<img>')
      .attr({
        src: book.coverUrl || '',
        alt: `${titleText || 'Book'} cover`,
        loading: 'lazy',
        decoding: 'async'
      });
    const $body = $('<div>').addClass('card-body');
    const $title = $('<h2>').addClass('card-title').text(titleText);
    const $author = $('<p>').addClass('card-author').text(book.author || 'Unknown author');
    const $footer = $('<div>').addClass('card-footer');
    const $readLink = $('<a>')
      .addClass('card-chip card-read-link')
      .attr({
        href: `reader.html?file=${encodeURIComponent(filename)}`,
        'aria-label': `Read ${titleText}`
      });
    const $resetAction = $('<button>')
      .addClass('card-menu-action')
      .attr({
        type: 'button',
        'data-action': 'reset-progress',
        'data-filename': filename,
        'data-title': titleText
      })
      .text('Reset reading state');

    $readLink.append($('<i>').addClass('book icon').attr('aria-hidden', 'true'));
    $readLink.append($('<span>').text('Read now'));

    $image.on('error', function () {
      $coverSurface.addClass('is-fallback');
      $(this).css('opacity', '0');
    });

    $menu.append($resetAction);

    if (canDeleteBooks()) {
      $menu.append(
        $('<button>')
          .addClass('card-menu-action danger')
          .attr({
            type: 'button',
            'data-action': 'delete-book',
            'data-filename': filename,
            'data-title': titleText
          })
          .text('Delete book')
      );
    }

    $menuShell.append($menuToggle, $menu);
    $coverSurface.append($image, $menuShell);
    $footer.append($readLink);
    $body.append($title, $author, $footer);
    $card.append($coverSurface, $body);

    return $card;
  }

  function renderBooks() {
    const filteredBooks = getFilteredBooks();
    const renderPassId = state.renderPassId + 1;
    const deferred = $.Deferred();

    state.renderPassId = renderPassId;
    closeCardMenus();
    $cards.empty();
    $emptyState.prop('hidden', true);

    updateCountLabel(filteredBooks.length, state.books.length);

    if (!filteredBooks.length) {
      $emptyState.prop('hidden', state.libraryLoading);
      deferred.resolve();
      return deferred.promise();
    }

    const gridElement = $cards.get(0);
    let index = 0;

    function appendChunk() {
      if (renderPassId !== state.renderPassId) {
        deferred.resolve();
        return;
      }

      const fragment = document.createDocumentFragment();
      const chunkLimit = Math.min(index + LIBRARY_RENDER_BATCH_SIZE, filteredBooks.length);

      for (; index < chunkLimit; index += 1) {
        fragment.appendChild(createCard(filteredBooks[index]).get(0));
      }

      gridElement.appendChild(fragment);

      if (index < filteredBooks.length) {
        window.requestAnimationFrame(appendChunk);
        return;
      }

      deferred.resolve();
    }

    appendChunk();
    return deferred.promise();
  }

  function renderTip() {
    const tip = TIPS[state.tipIndex % TIPS.length];
    $tipTitle.text(tip.title);
    $tipText.text(tip.text);
  }

  function scheduleNextTip() {
    if (state.tipTimer) {
      clearTimeout(state.tipTimer);
    }

    state.tipTimer = setTimeout(function () {
      state.tipIndex = (state.tipIndex + 1) % TIPS.length;
      renderTip();
      scheduleNextTip();
    }, randomTipDelay());
  }

  function renderContinueCard() {
    const progress = state.latestProgress;

    if (!progress) {
      $continueTitle.text('Nothing in progress yet');
      $continueMeta.text('Open any book and Dyslibria will save your place automatically so you can jump back in later.');
      $continueProgressShell.prop('hidden', true);
      $continueButton.prop('disabled', true);
      $continueUpdated.text('No saved session yet');
      return;
    }

    const title = progress.title || progress.filename || 'Untitled';
    const author = progress.author || 'Unknown author';
    const detail = progress.pageLabel || progress.chapterLabel || 'Resume where you left off.';

    $continueTitle.text(title);
    $continueMeta.text(`${author} — ${detail}`);
    $continueProgressShell.prop('hidden', false);
    $continueProgressFill.css('width', `${progress.progressPercent || 0}%`);
    $continueProgressLabel.text(`${progress.progressPercent || 0}%`);
    $continueProgressDetail.text(detail);
    $continueUpdated.text(`Last opened ${formatRelativeTime(progress.updatedAt)}`);
    $continueButton.prop('disabled', false);
  }

  function applySystemStatus(status) {
    const previousStatus = state.status;
    const wasBusy = Boolean(previousStatus && (previousStatus.processing || previousStatus.queueLength > 0));
    const isBusy = Boolean(status && (status.processing || status.queueLength > 0));

    state.status = status;

    $conversionStatus.removeClass('is-processing is-idle is-attention');

    if (isBusy) {
      state.pendingPostConversionRefresh = true;
    } else if (wasBusy && state.pendingPostConversionRefresh && !state.autoRefreshInFlight) {
      state.pendingPostConversionRefresh = false;
      triggerAutomaticLibraryRefresh();
    }

    if (state.autoRefreshInFlight) {
      $conversionStatus.addClass('is-processing');
      $conversionStatusText.text('Refreshing library');
      $heroStatusText.text('Refreshing library');
      $heroStatusMeta.text('Refreshing the dashboard now that conversion work has finished.');
      $viewLogsLabel.text(status.logCount > 0 ? `Logs (${status.logCount})` : 'Logs');
      return;
    }

    if (status.processing) {
      $conversionStatus.addClass('is-processing');
      $conversionStatusText.text(status.queueLength > 0 ? `Converting +${status.queueLength}` : 'Converting');
      $heroStatusText.text('Converting now');
      $heroStatusMeta.text(
        status.queueLength > 0
          ? `${status.queueLength} more file${status.queueLength === 1 ? '' : 's'} waiting in the queue.`
          : 'Working through the current EPUB conversion.'
      );
    } else if (status.queueLength > 0) {
      $conversionStatus.addClass('is-attention');
      $conversionStatusText.text(`Queued ${status.queueLength}`);
      $heroStatusText.text('Queue waiting');
      $heroStatusMeta.text(`${status.queueLength} file${status.queueLength === 1 ? '' : 's'} queued to convert.`);
    } else {
      $conversionStatus.addClass('is-idle');
      $conversionStatusText.text('Idle');
      $heroStatusText.text('Idle');
      $heroStatusMeta.text(status.latestLog ? status.latestLog.message : 'Ready for the next upload.');
    }

    $viewLogsLabel.text(status.logCount > 0 ? `Logs (${status.logCount})` : 'Logs');
  }

  function triggerAutomaticLibraryRefresh() {
    if (state.autoRefreshInFlight) {
      return;
    }

    state.autoRefreshInFlight = true;
    applySystemStatus(state.status || {
      processing: false,
      queueLength: 0,
      logCount: 0,
      latestLog: null
    });

    const logRefresh = state.session && state.session.canManageSystem
      ? loadLogs()
      : $.Deferred().resolve().promise();

    $.when(loadBooks(), loadReadingProgress(), logRefresh).always(function () {
      state.autoRefreshInFlight = false;
      loadSystemStatus();
    });
  }

  function renderLogs() {
    if (!state.logs.length) {
      $logsMeta.text('No log entries yet.');
      $logsOutput.text('No conversion logs yet.');
      return;
    }

    $logsMeta.text(`${state.logs.length} recent event${state.logs.length === 1 ? '' : 's'}.`);
    $logsOutput.html(state.logs.map(function (entry) {
      const stamp = new Date(entry.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      return `[${stamp}] ${String(entry.level || 'info').toUpperCase()}  ${escapeHtml(entry.message)}`;
    }).join('\n'));
  }

  function setButtonBusy($button, busy) {
    $button.prop('disabled', busy);
    $button.toggleClass('loading', busy);
  }

  function closeMobileMenu() {
    state.mobileMenuOpen = false;
    $toolbarActions.removeClass('is-open');
    $menuToggle.attr('aria-expanded', 'false');
  }

  function hydrateLibraryFromCache() {
    const cachedBooks = readLibrarySnapshot();
    if (!cachedBooks.length) {
      setLibraryLoadingState(true, {
        title: 'Loading your library',
        text: 'Gathering your books and preparing the shelf.'
      });
      return false;
    }

    state.books = cachedBooks;
    state.usingCachedLibrary = true;
    renderBooks();
    setLibraryLoadingState(true, {
      title: 'Refreshing your library',
      text: 'Showing your saved shelf while Dyslibria checks the server for updates.'
    });
    return true;
  }

  function loadBooks() {
    if (!state.books.length) {
      setLibraryLoadingState(true, {
        title: 'Loading your library',
        text: 'Gathering your books and preparing the shelf.'
      });
    } else {
      setLibraryLoadingState(true, {
        title: 'Refreshing your library',
        text: state.usingCachedLibrary
          ? 'Showing your saved shelf while Dyslibria checks the server for updates.'
          : 'Checking the server for the latest library changes.'
      });
    }

    return $.get('/epubs').then(function (books) {
      const normalizedBooks = Array.isArray(books) ? books.map(normalizeBook) : [];
      state.books = normalizedBooks.filter(function (book) {
        return Boolean(book.filename);
      });
      state.usingCachedLibrary = false;
      persistLibrarySnapshot(state.books);

      return renderBooks().always(function () {
        setLibraryLoadingState(false);
        if (!getFilteredBooks().length) {
          renderBooks();
        }
      });
    }).catch(function (xhr) {
      setLibraryLoadingState(false);

      if (!state.books.length) {
        renderBooks();
        showNotice('Dyslibria could not load the library just now. Try again in a moment.', 'error', {
          title: 'Library did not load',
          timeout: 0
        });
        return $.Deferred().reject(xhr).promise();
      }

      updateCountLabel(getFilteredBooks().length, state.books.length);
      return $.Deferred().reject(xhr).promise();
    });
  }

  function loadReadingProgress() {
    return $.get('/api/reading-progress').then(function (payload) {
      const progressEntries = Array.isArray(payload && payload.progress) ? payload.progress : [];
      state.latestProgress = progressEntries[0] || null;
      renderContinueCard();
    }).catch(function () {
      state.latestProgress = null;
      renderContinueCard();
    });
  }

  function loadSession() {
    return $.get('/api/session').then(function (payload) {
      state.session = payload || null;
      applySessionCapabilities();
      if (state.books.length) {
        renderBooks();
      }
      loadUpdateStatus();
      maybeShowUpdateNotice();
    }).catch(function () {
      state.session = null;
      applySessionCapabilities();
      if (state.books.length) {
        renderBooks();
      }
    });
  }

  function loadSystemStatus() {
    return $.get('/api/system-status').then(function (payload) {
      applySystemStatus(payload || {});
    }).catch(function () {
      applySystemStatus({
        processing: false,
        queueLength: 0,
        logCount: 0,
        latestLog: { message: 'Unable to reach the server status endpoint.' }
      });
    });
  }

  function loadLogs() {
    return $.get('/api/conversion-logs').then(function (payload) {
      state.logs = Array.isArray(payload && payload.logs) ? payload.logs : [];
      renderLogs();
    }).catch(function () {
      state.logs = [];
      renderLogs();
    });
  }

  function refreshDashboard() {
    return $.when(loadBooks(), loadReadingProgress(), loadSystemStatus());
  }

  function loadAppConfig() {
    return $.get('/api/app-config').then(function (payload) {
      const themeColors = Array.isArray(payload && payload.themeColors) ? payload.themeColors : [];
      state.themeColorOptions = themeColors.length
        ? themeColors
        : state.themeColorOptions;
      state.currentVersion = (payload && payload.currentVersion) || '';
      state.themeColorKey = (payload && payload.themeColor) || state.themeColorKey;
      applyTheme();
      maybeShowUpdateNotice();
    }).catch(function () {
      applyTheme();
    });
  }

  function pollSystemStatus() {
    loadSystemStatus();
    window.setInterval(loadSystemStatus, 5000);
  }

  function bindEvents() {
    $dismissLibraryNotice.on('click', clearNotice);

    $uploadModal.modal({
      autofocus: false,
      closable: true,
      onHide: function () {
        return !state.uploading;
      },
      onHidden: function () {
        resetUploadFormState();
      }
    });

    $('#uploadButton').on('click', function () {
      closeMobileMenu();
      $uploadModal.modal('show');
    });

    $('#settingsButton').on('click', function () {
      closeMobileMenu();
      window.location.href = 'settings.html';
    });

    $uploadForm.on('submit', function (event) {
      event.preventDefault();
      const selectedFiles = getSelectedUploadFiles();
      const fileSummary = summarizeFiles(selectedFiles);

      if (!selectedFiles.length) {
        showNotice('Choose one or more EPUB files before starting an upload.', 'error', {
          title: 'No books selected'
        });
        setUploadProgressState({
          percent: 0,
          title: 'Choose books to upload',
          copy: 'Select one or more EPUB files to start a new conversion batch.',
          meta: 'Nothing selected yet.',
          tone: 'error'
        });
        return;
      }

      const formData = new FormData(this);
      setUploadBusy(true);
      setUploadProgressState({
        percent: 0,
        title: fileSummary.count > 1 ? `Uploading ${fileSummary.count} books` : `Uploading ${selectedFiles[0].name}`,
        copy: 'Sending files to Dyslibria. Keep this window open until the queue confirmation appears.',
        meta: `${formatBytes(fileSummary.totalBytes)} total selected.`
      });

      $.ajax({
        url: '/upload',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        xhr: function () {
          const xhr = $.ajaxSettings.xhr();

          if (xhr && xhr.upload) {
            xhr.upload.addEventListener('progress', function (progressEvent) {
              if (!progressEvent.lengthComputable) {
                setUploadProgressState({
                  percent: 0,
                  title: fileSummary.count > 1 ? `Uploading ${fileSummary.count} books` : `Uploading ${selectedFiles[0].name}`,
                  copy: 'Sending files to Dyslibria. Upload size is still being calculated.',
                  meta: `${formatBytes(fileSummary.totalBytes)} total selected.`
                });
                return;
              }

              const percent = progressEvent.total > 0
                ? Math.round((progressEvent.loaded / progressEvent.total) * 100)
                : 0;

              setUploadProgressState({
                percent,
                title: fileSummary.count > 1 ? `Uploading ${fileSummary.count} books` : `Uploading ${selectedFiles[0].name}`,
                copy: percent >= 100
                  ? 'Upload complete. Dyslibria is now validating the files and adding them to the conversion queue.'
                  : `${formatBytes(progressEvent.loaded)} of ${formatBytes(progressEvent.total)} uploaded.`,
                meta: fileSummary.count > 1
                  ? `${fileSummary.count} EPUBs in this batch.`
                  : '1 EPUB in this batch.'
              });
            });
          }

          return xhr;
        },
        success: function (response) {
          const queuedCount = Array.isArray(response && response.queuedFiles) ? response.queuedFiles.length : fileSummary.count;

          setUploadProgressState({
            percent: 100,
            title: queuedCount === 1 ? '1 book queued' : `${queuedCount} books queued`,
            copy: 'Upload complete. Dyslibria has accepted the batch and started conversion work.',
            meta: 'You can follow conversion progress from the queue status pill and the conversion log.'
          });
          setUploadBusy(false);
          window.setTimeout(function () {
            $uploadModal.modal('hide');
          }, 320);
          showNotice(
            queuedCount === 1
              ? 'Upload received. Dyslibria has started converting your book.'
              : `Upload received. Dyslibria has started converting ${queuedCount} books.`,
            'success'
          );
          refreshDashboard();
          loadLogs();
        },
        error: function (xhr) {
          const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Error uploading files';
          setUploadProgressState({
            percent: Math.max(Number($uploadProgressPercent.text().replace('%', '')) || 0, 0),
            title: 'Upload did not finish',
            copy: message,
            meta: 'Review the message, adjust the batch if needed, and try again.',
            tone: 'error'
          });
          showNotice(message, 'error', {
            title: 'Upload could not start',
            timeout: 0
          });
        },
        complete: function () {
          setUploadBusy(false);
        }
      });
    });

    $dropZone.on('dragover', function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (state.uploading) {
        return;
      }
      $(this).addClass('dragover');
    });

    $dropZone.on('dragleave', function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (state.uploading) {
        return;
      }
      $(this).removeClass('dragover');
    });

    $dropZone.on('drop', function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (state.uploading) {
        return;
      }
      $(this).removeClass('dragover');

      const files = event.originalEvent.dataTransfer.files;
      $fileInput.get(0).files = files;
      syncSelectedFilesUi();
    });

    $dropZone.on('click', function () {
      if (state.uploading) {
        return;
      }

      $fileInput.trigger('click');
    });

    $fileInput.on('change', function () {
      syncSelectedFilesUi();
    });

    $cards.on('click', '.card-menu-toggle', function (event) {
      event.preventDefault();
      event.stopPropagation();

      const $button = $(this);
      const isOpen = $button.attr('aria-expanded') === 'true';

      closeCardMenus();

      if (!isOpen) {
        $button.attr('aria-expanded', 'true');
        $button.siblings('.card-menu').prop('hidden', false);
      }
    });

    $cards.on('click', '.card-menu', function (event) {
      event.stopPropagation();
    });

    $cards.on('click', '.card-menu-action', function (event) {
      event.preventDefault();
      event.stopPropagation();

      const $action = $(this);
      const actionType = String($action.data('action') || '');
      const filename = String($action.data('filename') || '');
      const title = String($action.data('title') || 'Untitled');

      closeCardMenus();

      if (!filename) {
        return;
      }

      if (actionType === 'reset-progress') {
        openBookActionConfirm({
          heading: 'Reset reading state',
          copy: `Reset your saved reading state for "${title}"?`,
          note: 'This clears your saved location for this book so it opens from the beginning next time.',
          confirmLabel: 'Reset reading state',
          danger: false,
          request: function () {
            return $.ajax({
              url: `/api/reading-progress/${encodeURIComponent(filename)}`,
              type: 'DELETE'
            });
          },
          successMessage: function () {
            return `Reading state reset for ${title}.`;
          }
        });
        return;
      }

      if (actionType === 'delete-book') {
        openBookActionConfirm({
          heading: 'Delete book',
          copy: `Delete "${title}" from the library?`,
          note: 'The book file will be removed now, but saved reading progress stays on the server so it can return if you upload the same filename again.',
          confirmLabel: 'Delete book',
          danger: true,
          request: function () {
            return $.ajax({
              url: `/api/books/${encodeURIComponent(filename)}`,
              type: 'DELETE'
            });
          },
          successMessage: function () {
            return `${title} was deleted from the library. Saved reading progress was kept.`;
          }
        });
      }
    });

    $searchBar.on('input', function () {
      state.query = $(this).val() || '';
      renderBooks();
    });

    $themeToggle.on('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      closeMobileMenu();
    });

    $heroToggle.on('click', function () {
      state.bannerCollapsed = !state.bannerCollapsed;
      applyBannerState();
    });

    $continueButton.on('click', function () {
      if (!state.latestProgress) {
        return;
      }

      window.location.href = buildReaderUrl(state.latestProgress);
    });

    $viewLogsButton.on('click', function () {
      closeMobileMenu();
      loadLogs().always(function () {
        $('#logsModal').modal('show');
      });
    });

    $('#closeLogsButton').on('click', function () {
      $('#logsModal').modal('hide');
    });

    $('#cancelBookActionButton').on('click', function () {
      $bookActionConfirmModal.modal('hide');
    });

    $confirmBookActionButton.on('click', function () {
      const action = state.pendingBookAction;
      const $button = $(this);

      if (!action || typeof action.request !== 'function') {
        return;
      }

      setButtonBusy($button, true);

      action.request().done(function (response) {
        $bookActionConfirmModal.modal('hide');
        showNotice(
          typeof action.successMessage === 'function'
            ? action.successMessage(response || {})
            : (action.successMessage || 'Action completed.'),
          'success'
        );
        refreshDashboard();
      }).fail(function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to complete that action.';
        showNotice(message, 'error', {
          title: 'Action could not finish',
          timeout: 0
        });
      }).always(function () {
        setButtonBusy($button, false);
      });
    });

    $('#clearLogsButton').on('click', function () {
      const $button = $(this);
      setButtonBusy($button, true);

      $.ajax({
        url: '/api/conversion-logs',
        type: 'DELETE',
        success: function () {
          state.logs = [];
          renderLogs();
          loadSystemStatus();
          showNotice('Conversion log cleared.', 'success');
        },
        error: function () {
          showNotice('Error clearing logs.', 'error', {
            title: 'Logs could not be cleared',
            timeout: 0
          });
        },
        complete: function () {
          setButtonBusy($button, false);
        }
      });
    });

    $menuToggle.on('click', function () {
      state.mobileMenuOpen = !state.mobileMenuOpen;
      $toolbarActions.toggleClass('is-open', state.mobileMenuOpen);
      $(this).attr('aria-expanded', String(state.mobileMenuOpen));
    });

    $(document).on('click', function (event) {
      if (!$(event.target).closest('.card-menu-shell').length) {
        closeCardMenus();
      }
    });

    $(window).on('resize', function () {
      if (window.innerWidth > 1039) {
        closeMobileMenu();
      }
    });

    $(document).on('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMobileMenu();
        closeCardMenus();
      }
    });
  }

  function initialise() {
    applyTheme();
    applySessionCapabilities();
    applyBannerState();
    renderTip();
    scheduleNextTip();
    renderContinueCard();
    bindEvents();
    hydrateLibraryFromCache();

    $.when(loadAppConfig(), loadSession(), refreshDashboard());

    pollSystemStatus();
  }

  initialise();
});
