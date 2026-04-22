$(document).ready(function () {
  const THEME_STORAGE_KEY = 'dyslibria:library-theme:v1';
  const BANNER_STORAGE_KEY = 'dyslibria:library-banner-collapsed:v1';
  const LIBRARY_CACHE_KEY = 'dyslibria:library-cache:v1';
  const LIBRARY_VIEW_STORAGE_KEY = 'dyslibria:library-view:v1';
  const LIBRARY_SORT_STORAGE_KEY = 'dyslibria:library-sort:v1';
  const LIBRARY_FILTER_STORAGE_KEY = 'dyslibria:library-filter:v1';
  const LIBRARY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const LIBRARY_RENDER_BATCH_SIZE = 24;
  const GRID_INITIAL_RENDER_COUNT = 120;
  const GRID_RENDER_INCREMENT = 120;
  const SEARCH_INPUT_DEBOUNCE_MS = 140;
  const UPLOAD_BATCH_MAX_BYTES = 32 * 1024 * 1024;
  const UPLOAD_BATCH_MAX_FILES = 12;
  const DEFAULT_VIEW_MODE = 'shelves';
  const DEFAULT_SORT_MODE = 'recently-added';
  const DEFAULT_FILTER_MODE = 'all';
  const RECENTLY_ADDED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
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
    progressEntries: [],
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
    searchDebounceTimer: null,
    libraryLoading: true,
    usingCachedLibrary: false,
    renderPassId: 0,
    uploading: false,
    currentVersion: '',
    latestVersion: '',
    updateAvailable: false,
    updateNoticeShown: false,
    metadataReady: false,
    metadataRefreshing: false,
    metadataUpdatedAtMs: 0,
    viewMode: localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY) || DEFAULT_VIEW_MODE,
    sortMode: localStorage.getItem(LIBRARY_SORT_STORAGE_KEY) || DEFAULT_SORT_MODE,
    activeFilter: localStorage.getItem(LIBRARY_FILTER_STORAGE_KEY) || DEFAULT_FILTER_MODE,
    selectedCollection: null,
    bookRevision: 0,
    progressRevision: 0,
    derivedBooks: {
      decoratedKey: '',
      decoratedBooks: [],
      visibleKey: '',
      visibleBooks: []
    },
    shelfCollections: new Map(),
    gridObserver: null,
    gridLoadMoreSentinel: null,
    gridVisibleCount: 0,
    gridAppendInFlight: false
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
  const $browseShell = $('#browseShell');
  const $shelfStack = $('#shelfStack');
  const $browseSummaryTitle = $('#browseSummaryTitle');
  const $browseSummaryCopy = $('#browseSummaryCopy');
  const $clearBrowseButton = $('#clearBrowseButton');
  const $sortSelect = $('#sortSelect');
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
  const $viewToggles = $('.browse-toggle');
  const $filterChips = $('.filter-chip');

  state.viewMode = sanitizeViewMode(state.viewMode);
  state.sortMode = sanitizeSortMode(state.sortMode);
  state.activeFilter = sanitizeFilterMode(state.activeFilter);

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

  function sanitizeViewMode(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return ['shelves', 'grid', 'compact'].includes(normalizedValue)
      ? normalizedValue
      : DEFAULT_VIEW_MODE;
  }

  function sanitizeSortMode(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return ['recently-added', 'title-asc', 'author-asc', 'last-opened'].includes(normalizedValue)
      ? normalizedValue
      : DEFAULT_SORT_MODE;
  }

  function sanitizeFilterMode(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return ['all', 'in-progress', 'unread', 'recently-added', 'recently-opened'].includes(normalizedValue)
      ? normalizedValue
      : DEFAULT_FILTER_MODE;
  }

  function persistBrowsePreferences() {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, state.viewMode);
    localStorage.setItem(LIBRARY_SORT_STORAGE_KEY, state.sortMode);
    localStorage.setItem(LIBRARY_FILTER_STORAGE_KEY, state.activeFilter);
  }

  function invalidateDerivedBooks() {
    state.derivedBooks.decoratedKey = '';
    state.derivedBooks.decoratedBooks = [];
    state.derivedBooks.visibleKey = '';
    state.derivedBooks.visibleBooks = [];
  }

  function setBooks(nextBooks) {
    state.books = Array.isArray(nextBooks) ? nextBooks.filter(function (book) {
      return Boolean(book && book.filename);
    }) : [];
    state.bookRevision += 1;
    state.shelfCollections = new Map();
    invalidateDerivedBooks();
  }

  function setProgressEntries(nextEntries) {
    state.progressEntries = Array.isArray(nextEntries) ? nextEntries.filter(function (entry) {
      return Boolean(entry && entry.filename);
    }) : [];
    state.latestProgress = state.progressEntries[0] || null;
    state.progressRevision += 1;
    invalidateDerivedBooks();
  }

  function buildCollectionCacheKey(collection) {
    const filenames = collection && Array.isArray(collection.filenames) ? collection.filenames : [];
    return [
      String(collection && collection.key || 'selected'),
      filenames.length,
      filenames[0] || '',
      filenames[filenames.length - 1] || ''
    ].join(':');
  }

  function normalizeTimestamp(value) {
    const timestamp = Date.parse(value || '');
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function countBooksLabel(count) {
    return `${count} book${count === 1 ? '' : 's'}`;
  }

  function getFilterLabel(filterKey) {
    switch (filterKey) {
      case 'in-progress':
        return 'In progress';
      case 'unread':
        return 'Unread';
      case 'recently-added':
        return 'Recently added';
      case 'recently-opened':
        return 'Recently opened';
      default:
        return 'All books';
    }
  }

  function normalizeProgressEntry(entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    return {
      ...source,
      filename: String(source.filename || ''),
      progressPercent: Math.max(0, Math.min(100, Number(source.progressPercent) || 0)),
      updatedAtMs: normalizeTimestamp(source.updatedAt)
    };
  }

  function getProgressByFilename() {
    const progressByFilename = new Map();

    state.progressEntries.forEach(function (entry) {
      if (!entry.filename) {
        return;
      }

      const existingEntry = progressByFilename.get(entry.filename);
      if (!existingEntry || entry.updatedAtMs > existingEntry.updatedAtMs) {
        progressByFilename.set(entry.filename, entry);
      }
    });

    return progressByFilename;
  }

  function getDecoratedBooks() {
    const decoratedKey = `${state.bookRevision}:${state.progressRevision}`;
    if (state.derivedBooks.decoratedKey === decoratedKey) {
      return state.derivedBooks.decoratedBooks;
    }

    const progressByFilename = getProgressByFilename();
    const authorCounts = state.books.reduce(function (counts, book) {
      const authorKey = String(book.author || 'Unknown author').trim().toLowerCase();
      counts.set(authorKey, (counts.get(authorKey) || 0) + 1);
      return counts;
    }, new Map());
    const recentlyAddedCutoff = Date.now() - RECENTLY_ADDED_WINDOW_MS;

    const decoratedBooks = state.books.map(function (book) {
      const progress = progressByFilename.get(book.filename) || null;
      const displayTitle = book.title || book.filename || 'Untitled';
      const displayAuthor = book.author || 'Unknown author';
      const authorKey = String(displayAuthor).trim().toLowerCase();
      const lastModifiedAt = normalizeTimestamp(book.lastModified);
      const hasProgress = Boolean(progress && (
        progress.location ||
        progress.updatedAtMs ||
        progress.progressPercent > 0 ||
        progress.chapterLabel ||
        progress.pageLabel
      ));

      return {
        ...book,
        displayTitle,
        displayAuthor,
        searchText: `${displayTitle} ${displayAuthor} ${book.filename || ''}`.toLowerCase(),
        lastModifiedAt,
        progress,
        progressUpdatedAtMs: progress ? progress.updatedAtMs : 0,
        hasProgress,
        isInProgress: hasProgress && progress && progress.progressPercent > 0 && progress.progressPercent < 100,
        isUnread: !hasProgress,
        isRecentlyAdded: Boolean(lastModifiedAt && lastModifiedAt >= recentlyAddedCutoff),
        isRecentlyOpened: Boolean(progress && progress.updatedAtMs),
        authorBookCount: authorCounts.get(authorKey) || 0
      };
    });

    state.derivedBooks.decoratedKey = decoratedKey;
    state.derivedBooks.decoratedBooks = decoratedBooks;
    return decoratedBooks;
  }

  function getActiveCollectionFilenameSet() {
    if (!state.selectedCollection || !Array.isArray(state.selectedCollection.filenames)) {
      return null;
    }

    return new Set(state.selectedCollection.filenames);
  }

  function getSelectedCollectionCacheKey() {
    return state.selectedCollection
      ? String(state.selectedCollection.cacheKey || state.selectedCollection.key || 'selected')
      : 'all';
  }

  function getVisibleBooks() {
    const query = String(state.query || '').trim().toLowerCase();
    const visibleKey = [
      state.derivedBooks.decoratedKey || `${state.bookRevision}:${state.progressRevision}`,
      state.activeFilter,
      state.sortMode,
      query,
      getSelectedCollectionCacheKey()
    ].join('|');

    if (state.derivedBooks.visibleKey === visibleKey) {
      return state.derivedBooks.visibleBooks;
    }

    const activeCollectionSet = getActiveCollectionFilenameSet();
    const books = getDecoratedBooks().filter(function (book) {
      if (activeCollectionSet && !activeCollectionSet.has(book.filename)) {
        return false;
      }

      if (state.activeFilter === 'in-progress' && !book.isInProgress) {
        return false;
      }

      if (state.activeFilter === 'unread' && !book.isUnread) {
        return false;
      }

      if (state.activeFilter === 'recently-added' && !book.isRecentlyAdded) {
        return false;
      }

      if (state.activeFilter === 'recently-opened' && !book.isRecentlyOpened) {
        return false;
      }

      if (query && !book.searchText.includes(query)) {
        return false;
      }

      return true;
    });

    const visibleBooks = books.sort(function (left, right) {
      if (state.sortMode === 'title-asc') {
        return left.displayTitle.localeCompare(right.displayTitle, undefined, { sensitivity: 'base' }) ||
          left.displayAuthor.localeCompare(right.displayAuthor, undefined, { sensitivity: 'base' });
      }

      if (state.sortMode === 'author-asc') {
        return left.displayAuthor.localeCompare(right.displayAuthor, undefined, { sensitivity: 'base' }) ||
          left.displayTitle.localeCompare(right.displayTitle, undefined, { sensitivity: 'base' });
      }

      if (state.sortMode === 'last-opened') {
        return (right.progressUpdatedAtMs - left.progressUpdatedAtMs) ||
          (right.lastModifiedAt - left.lastModifiedAt) ||
          left.displayTitle.localeCompare(right.displayTitle, undefined, { sensitivity: 'base' });
      }

      return (right.lastModifiedAt - left.lastModifiedAt) ||
        (right.progressUpdatedAtMs - left.progressUpdatedAtMs) ||
        left.displayTitle.localeCompare(right.displayTitle, undefined, { sensitivity: 'base' });
    });

    state.derivedBooks.visibleKey = visibleKey;
    state.derivedBooks.visibleBooks = visibleBooks;
    return visibleBooks;
  }

  function buildShelfCollection(key, caption, title, meta, books) {
    return {
      key,
      caption,
      title,
      meta,
      books: books.slice(0, 12),
      filenames: books.map(function (book) {
        return book.filename;
      })
    };
  }

  function buildShelfCollections(books) {
    if (!books.length) {
      return [];
    }

    if (state.selectedCollection) {
      return [
        buildShelfCollection(
          state.selectedCollection.key || 'selected',
          'Focused shelf',
          state.selectedCollection.title || 'Selected books',
          `${countBooksLabel(books.length)} in this saved browse slice.`,
          books
        )
      ];
    }

    const collections = [];
    const inProgressBooks = books
      .filter(function (book) { return book.isInProgress; })
      .sort(function (left, right) { return right.progressUpdatedAtMs - left.progressUpdatedAtMs; });
    const recentlyOpenedBooks = books
      .filter(function (book) { return book.isRecentlyOpened; })
      .sort(function (left, right) { return right.progressUpdatedAtMs - left.progressUpdatedAtMs; });
    const recentlyAddedBooks = books
      .slice()
      .sort(function (left, right) { return right.lastModifiedAt - left.lastModifiedAt; });
    const unreadBooks = books.filter(function (book) { return book.isUnread; });
    const authorGroups = books.reduce(function (groups, book) {
      const authorKey = String(book.displayAuthor || 'Unknown author').trim().toLowerCase();
      if (!groups.has(authorKey)) {
        groups.set(authorKey, {
          author: book.displayAuthor,
          books: []
        });
      }
      groups.get(authorKey).books.push(book);
      return groups;
    }, new Map());

    if (inProgressBooks.length) {
      collections.push(buildShelfCollection(
        'continue-reading',
        'Resume',
        'Continue reading',
        `${countBooksLabel(inProgressBooks.length)} with a saved place to jump back into.`,
        inProgressBooks
      ));
    }

    if (recentlyAddedBooks.length) {
      collections.push(buildShelfCollection(
        'recently-added',
        'Fresh on the shelf',
        'Recently added',
        `${countBooksLabel(recentlyAddedBooks.length)} added or refreshed recently.`,
        recentlyAddedBooks
      ));
    }

    if (unreadBooks.length) {
      collections.push(buildShelfCollection(
        'unread',
        'Ready to start',
        'Unread picks',
        `${countBooksLabel(unreadBooks.length)} waiting for a first reading session.`,
        unreadBooks
      ));
    }

    if (recentlyOpenedBooks.length) {
      collections.push(buildShelfCollection(
        'recently-opened',
        'Recent activity',
        'Recently opened',
        `${countBooksLabel(recentlyOpenedBooks.length)} with saved reading history.`,
        recentlyOpenedBooks
      ));
    }

    Array.from(authorGroups.values())
      .filter(function (group) {
        return group.books.length > 1;
      })
      .sort(function (left, right) {
        return (right.books.length - left.books.length) ||
          left.author.localeCompare(right.author, undefined, { sensitivity: 'base' });
      })
      .slice(0, 3)
      .forEach(function (group) {
        const authorBooks = group.books.slice().sort(function (left, right) {
          return right.lastModifiedAt - left.lastModifiedAt;
        });

        collections.push(buildShelfCollection(
          `author-${group.author.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          'Author spotlight',
          `More from ${group.author}`,
          `${countBooksLabel(authorBooks.length)} by the same author for deeper browsing.`,
          authorBooks
        ));
      });

    if (!collections.length) {
      collections.push(buildShelfCollection(
        'matching-books',
        'Library view',
        'Matching books',
        `${countBooksLabel(books.length)} in the current library view.`,
        books
      ));
    }

    return collections;
  }

  function shouldShowClearBrowse() {
    return Boolean(
      String(state.query || '').trim() ||
      state.activeFilter !== DEFAULT_FILTER_MODE ||
      state.selectedCollection
    );
  }

  function renderBrowseControls(visibleBooks) {
    const visibleCount = Array.isArray(visibleBooks) ? visibleBooks.length : 0;
    let summaryTitle = 'Browse the library';
    let summaryCopy = 'Use shelves for relaxed browsing or switch to grid and compact views when you want to scan faster.';

    $viewToggles.each(function () {
      const $button = $(this);
      const isActive = String($button.data('viewMode') || '') === state.viewMode;
      $button.toggleClass('is-active', isActive).attr('aria-selected', String(isActive));
    });

    $filterChips.each(function () {
      const $button = $(this);
      const isActive = String($button.data('filter') || '') === state.activeFilter;
      $button.toggleClass('is-active', isActive).attr('aria-pressed', String(isActive));
    });

    $sortSelect.val(state.sortMode);

    if (state.selectedCollection) {
      summaryTitle = state.selectedCollection.title || 'Focused shelf';
      summaryCopy = `${countBooksLabel(visibleCount)} from this shelf. Search, sort, and filters are still applied on top.`;
    } else if (String(state.query || '').trim()) {
      summaryTitle = 'Search results';
      summaryCopy = `${countBooksLabel(visibleCount)} matching “${state.query.trim()}”.`;
    } else if (state.activeFilter !== DEFAULT_FILTER_MODE) {
      summaryTitle = getFilterLabel(state.activeFilter);
      summaryCopy = `${countBooksLabel(visibleCount)} in the current filtered view.`;
    } else if (state.viewMode === 'grid') {
      summaryTitle = 'Grid view';
      summaryCopy = 'A full-shelf scan with cover-first cards and quick actions on every book.';
    } else if (state.viewMode === 'compact') {
      summaryTitle = 'Compact view';
      summaryCopy = 'Denser rows with more metadata, useful when you want to compare titles quickly.';
    }

    $browseSummaryTitle.text(summaryTitle);
    $browseSummaryCopy.text(summaryCopy);
    $clearBrowseButton
      .prop('hidden', !shouldShowClearBrowse())
      .toggleClass('hidden', !shouldShowClearBrowse())
      .text(state.selectedCollection ? 'Back to full library' : 'Clear view');
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

  function calculateUploadPercent(loadedBytes, totalBytes) {
    if (totalBytes <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)));
  }

  function createUploadBatch(files) {
    const batchFiles = Array.isArray(files) ? files.slice() : [];
    return {
      files: batchFiles,
      summary: summarizeFiles(batchFiles)
    };
  }

  function buildUploadBatches(files) {
    const batches = [];
    let currentBatchFiles = [];
    let currentBatchBytes = 0;

    files.forEach(function (file) {
      const fileSize = Number(file && file.size) || 0;
      const wouldExceedFileLimit = currentBatchFiles.length >= UPLOAD_BATCH_MAX_FILES;
      const wouldExceedByteLimit = currentBatchFiles.length > 0 && currentBatchBytes + fileSize > UPLOAD_BATCH_MAX_BYTES;

      if (currentBatchFiles.length && (wouldExceedFileLimit || wouldExceedByteLimit)) {
        batches.push(createUploadBatch(currentBatchFiles));
        currentBatchFiles = [];
        currentBatchBytes = 0;
      }

      currentBatchFiles.push(file);
      currentBatchBytes += fileSize;
    });

    if (currentBatchFiles.length) {
      batches.push(createUploadBatch(currentBatchFiles));
    }

    return batches;
  }

  function splitUploadBatch(batch) {
    const batchFiles = batch && Array.isArray(batch.files) ? batch.files : [];
    if (batchFiles.length < 2) {
      return [createUploadBatch(batchFiles)];
    }

    const midpoint = Math.ceil(batchFiles.length / 2);
    return [
      createUploadBatch(batchFiles.slice(0, midpoint)),
      createUploadBatch(batchFiles.slice(midpoint))
    ].filter(function (entry) {
      return entry.files.length > 0;
    });
  }

  function collectBatchFiles(batches) {
    return (Array.isArray(batches) ? batches : []).reduce(function (files, batch) {
      const batchFiles = batch && Array.isArray(batch.files) ? batch.files : [];
      return files.concat(batchFiles);
    }, []);
  }

  function replaceSelectedUploadFiles(files) {
    const input = $fileInput.get(0);
    if (!input || typeof DataTransfer === 'undefined') {
      return false;
    }

    try {
      const transfer = new DataTransfer();
      (Array.isArray(files) ? files : []).forEach(function (file) {
        transfer.items.add(file);
      });
      input.files = transfer.files;
      syncSelectedFilesUi();
      return true;
    } catch (error) {
      return false;
    }
  }

  function getUploadBatchLabel(position) {
    if (position && position.total > 1) {
      return `Batch ${position.current} of ${position.total}`;
    }

    return 'Upload batch';
  }

  function buildUploadMetaText(batch, batchPosition, totalSelectedBytes) {
    const batchFileCount = batch && batch.summary ? batch.summary.count : 0;
    const batchLabel = getUploadBatchLabel(batchPosition);
    const batchSize = formatBytes(batch && batch.summary ? batch.summary.totalBytes : 0);
    const totalSize = formatBytes(totalSelectedBytes);

    return `${batchLabel} · ${batchFileCount} EPUB${batchFileCount === 1 ? '' : 's'} · ${batchSize} in this batch · ${totalSize} selected total.`;
  }

  function updateBatchUploadProgress(batch, overallSummary, batchPosition, acceptedBytes, progressEvent) {
    const totalSelectedBytes = Number(overallSummary && overallSummary.totalBytes) || 0;
    const batchLabel = getUploadBatchLabel(batchPosition);
    const batchTitle = overallSummary.count > 1 ? `Uploading ${overallSummary.count} books` : `Uploading ${batch.files[0].name}`;

    if (!progressEvent.lengthComputable || progressEvent.total <= 0) {
      setUploadProgressState({
        percent: calculateUploadPercent(acceptedBytes, totalSelectedBytes),
        title: batchTitle,
        copy: `${batchLabel} is uploading. Dyslibria will automatically retry smaller batches if this request is too large.`,
        meta: buildUploadMetaText(batch, batchPosition, totalSelectedBytes)
      });
      return;
    }

    const batchFraction = Math.max(0, Math.min(1, progressEvent.loaded / progressEvent.total));
    const transferredBytes = acceptedBytes + Math.round(batch.summary.totalBytes * batchFraction);
    const percent = calculateUploadPercent(transferredBytes, totalSelectedBytes);
    const copy = batchFraction >= 1
      ? `${batchLabel} uploaded. Dyslibria is validating the files and adding them to the queue.`
      : `${formatBytes(transferredBytes)} of ${formatBytes(totalSelectedBytes)} uploaded.`;

    setUploadProgressState({
      percent,
      title: batchTitle,
      copy,
      meta: buildUploadMetaText(batch, batchPosition, totalSelectedBytes)
    });
  }

  function getUploadErrorMessage(errorPayload) {
    const xhr = errorPayload && errorPayload.xhr;
    const acceptedCount = Number(errorPayload && errorPayload.acceptedCount) || 0;
    const remainingFiles = Array.isArray(errorPayload && errorPayload.remainingFiles) ? errorPayload.remainingFiles : [];
    const batch = errorPayload && errorPayload.batch;

    if (xhr && xhr.status === 413) {
      const partialPrefix = acceptedCount > 0
        ? `${acceptedCount} book${acceptedCount === 1 ? '' : 's'} already reached the queue. `
        : '';
      const retainPrefix = remainingFiles.length > 0
        ? `${remainingFiles.length} unfinished book${remainingFiles.length === 1 ? '' : 's'} still need to be queued. `
        : '';
      const batchScope = batch && batch.summary && batch.summary.count > 1
        ? `The current upload batch (${batch.summary.count} EPUBs, ${formatBytes(batch.summary.totalBytes)}) was too large for the server or reverse proxy to accept.`
        : 'This EPUB was too large for the server or reverse proxy to accept.';

      return `${partialPrefix}${retainPrefix}${batchScope} Try a smaller upload or increase the request body limit on the server or proxy.`;
    }

    const responseMessage = xhr && xhr.responseJSON && xhr.responseJSON.message;
    if (responseMessage) {
      return responseMessage;
    }

    const plainTextResponse = String(xhr && xhr.responseText || '').trim();
    if (plainTextResponse && !plainTextResponse.startsWith('<')) {
      return plainTextResponse;
    }

    return 'Error uploading files.';
  }

  function uploadBatchRequest(batch, overallSummary, batchPosition, acceptedBytes) {
    const formData = new FormData();
    batch.files.forEach(function (file) {
      formData.append('epubFiles', file, file.name);
    });

    return new Promise(function (resolve, reject) {
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
              updateBatchUploadProgress(batch, overallSummary, batchPosition, acceptedBytes, progressEvent);
            });
          }

          return xhr;
        },
        success: function (response) {
          resolve(response || {});
        },
        error: function (xhr) {
          reject(xhr);
        }
      });
    });
  }

  async function uploadSelectedFiles(selectedFiles) {
    const overallSummary = summarizeFiles(selectedFiles);
    const pendingBatches = buildUploadBatches(selectedFiles);
    const queuedFiles = [];
    let acceptedCount = 0;
    let acceptedBytes = 0;
    let completedBatchCount = 0;

    while (pendingBatches.length) {
      const batch = pendingBatches.shift();
      const batchPosition = {
        current: completedBatchCount + 1,
        total: completedBatchCount + pendingBatches.length + 1
      };

      try {
        const response = await uploadBatchRequest(batch, overallSummary, batchPosition, acceptedBytes);

        acceptedCount += batch.summary.count;
        acceptedBytes += batch.summary.totalBytes;
        completedBatchCount += 1;

        if (Array.isArray(response && response.queuedFiles)) {
          queuedFiles.push.apply(queuedFiles, response.queuedFiles);
        }

        if (pendingBatches.length) {
          setUploadProgressState({
            percent: calculateUploadPercent(acceptedBytes, overallSummary.totalBytes),
            title: acceptedCount === overallSummary.count
              ? `${acceptedCount} books queued`
              : `${acceptedCount} of ${overallSummary.count} books queued`,
            copy: `${getUploadBatchLabel(batchPosition)} accepted. Starting the next batch now.`,
            meta: `${pendingBatches.length} upload batch${pendingBatches.length === 1 ? '' : 'es'} remaining.`
          });
        }
      } catch (xhr) {
        if (xhr && xhr.status === 413 && batch.summary.count > 1) {
          const smallerBatches = splitUploadBatch(batch);
          Array.prototype.unshift.apply(pendingBatches, smallerBatches);
          setUploadProgressState({
            percent: calculateUploadPercent(acceptedBytes, overallSummary.totalBytes),
            title: 'Retrying with smaller batches',
            copy: `${getUploadBatchLabel(batchPosition)} was too large for the server. Dyslibria is retrying with smaller groups automatically.`,
            meta: `${acceptedCount} of ${overallSummary.count} books queued so far.`
          });
          continue;
        }

        throw {
          xhr,
          batch,
          acceptedCount,
          acceptedBytes,
          remainingFiles: batch.files.concat(collectBatchFiles(pendingBatches)),
          queuedFiles
        };
      }
    }

    return {
      acceptedCount,
      acceptedBytes,
      overallSummary,
      queuedFiles
    };
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
      meta: `${formatBytes(summary.totalBytes)} total. Large selections are sent in smaller batches automatically.`
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
    if (!state.metadataReady) {
      return state.books.length > 0
        ? 'Showing your saved shelf while Dyslibria rebuilds the library index in the background.'
        : 'Dyslibria is building the initial library index in the background.';
    }

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
    $app.find('.card-menu').prop('hidden', true);
    $app.find('.card-menu-toggle').attr('aria-expanded', 'false');
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
    const prefix = (shouldShowClearBrowse() && visibleCount !== totalCount)
      ? `${visibleCount} of ${totalCount}`
      : `${visibleCount}`;

    $count.text(`${prefix} ${suffix}`);
    $libraryMeta.text(getLibraryMetaCopy(visibleCount, totalCount));
  }

  function buildCardStatus(book) {
    if (book.isInProgress && book.progress) {
      return {
        label: `${book.progress.progressPercent || 0}% read`,
        neutral: false,
        progressCopy: book.progress.pageLabel || book.progress.chapterLabel || `Last opened ${formatRelativeTime(book.progress.updatedAt)}`
      };
    }

    if (book.isRecentlyOpened && book.progress) {
      return {
        label: `Opened ${formatRelativeTime(book.progress.updatedAt)}`,
        neutral: false
      };
    }

    if (book.isRecentlyAdded) {
      return {
        label: `Added ${formatRelativeTime(book.lastModified)}`,
        neutral: false
      };
    }

    if (book.authorBookCount > 1) {
      return {
        label: `${book.authorBookCount} by this author`,
        neutral: false
      };
    }

    return {
      label: 'Ready to read',
      neutral: true
    };
  }

  function createCard(book, options) {
    const variant = options && options.variant ? options.variant : 'standard';
    const filename = book.filename || '';
    const titleText = book.displayTitle || book.title || filename || 'Untitled';
    const cardStatus = buildCardStatus(book);
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
    const $author = $('<p>').addClass('card-author').text(book.displayAuthor || book.author || 'Unknown author');
    const $metaStack = $('<div>').addClass('card-meta-stack');
    const $footer = $('<div>').addClass('card-footer');
    const $readLink = $('<a>')
      .addClass('card-chip card-read-link')
      .attr({
        href: buildReaderUrl({
          filename,
          location: book.progress && book.progress.location
        }),
        'aria-label': `${book.hasProgress ? 'Resume' : 'Read'} ${titleText}`
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
    $readLink.append($('<span>').text(book.hasProgress ? 'Resume' : 'Read now'));

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

    if (variant === 'shelf') {
      $card.addClass('is-shelf');
    }

    if (variant === 'compact') {
      $card.addClass('is-compact');
    }

    $metaStack.append(
      $('<span>')
        .addClass(`card-status-chip${cardStatus.neutral ? ' is-neutral' : ''}`)
        .text(cardStatus.label)
    );

    if (book.isInProgress && book.progress) {
      $metaStack.append(
        $('<div>').addClass('card-progress')
          .append(
            $('<div>').addClass('card-progress-track').append(
              $('<div>')
                .addClass('card-progress-fill')
                .css('width', `${book.progress.progressPercent || 0}%`)
            )
          )
          .append(
            $('<span>')
              .addClass('card-progress-copy')
              .text(cardStatus.progressCopy || 'Saved reading progress is available.')
          )
      );
    }

    $menuShell.append($menuToggle, $menu);
    $coverSurface.append($image, $menuShell);
    $footer.append($readLink);
    $body.append($title, $author, $metaStack, $footer);
    $card.append($coverSurface, $body);

    return $card;
  }

  function createShelfRow(collection) {
    const trackId = `shelfTrack-${collection.key}`;
    const navDisabled = collection.books.length <= 1;
    const $row = $('<section>').addClass('shelf-row').attr('data-collection-key', collection.key);
    const $header = $('<div>').addClass('shelf-head');
    const $copy = $('<div>').append(
      $('<span>').addClass('shelf-caption').text(collection.caption || 'Shelf'),
      $('<h2>').addClass('shelf-title').text(collection.title),
      $('<p>').addClass('shelf-meta').text(collection.meta)
    );
    const $actions = $('<div>').addClass('shelf-actions');
    const $track = $('<div>')
      .addClass('shelf-track')
      .attr({
        id: trackId,
        tabindex: '0'
      });

    const $seeAll = $('<button>')
      .addClass('shelf-action')
      .attr({
        type: 'button',
        'data-action': 'see-all',
        'data-collection-key': collection.key
      });
    $seeAll.text('See all');
    const $previous = $('<button>')
      .addClass('shelf-nav')
      .attr({
        type: 'button',
        'data-target': trackId,
        'data-direction': 'previous',
        'aria-label': `Scroll ${collection.title} left`
      })
      .prop('disabled', navDisabled)
      .html('<i class="angle left icon" aria-hidden="true"></i>');
    const $next = $('<button>')
      .addClass('shelf-nav')
      .attr({
        type: 'button',
        'data-target': trackId,
        'data-direction': 'next',
        'aria-label': `Scroll ${collection.title} right`
      })
      .prop('disabled', navDisabled)
      .html('<i class="angle right icon" aria-hidden="true"></i>');

    collection.books.forEach(function (book) {
      $track.append(createCard(book, { variant: 'shelf' }));
    });

    $actions.append($seeAll, $previous, $next);
    $header.append($copy, $actions);
    $row.append($header, $('<div>').addClass('shelf-scroller').append($track));
    return $row;
  }

  function renderShelfCollections(collections) {
    const fragment = document.createDocumentFragment();
    state.shelfCollections = new Map();
    collections.forEach(function (collection) {
      state.shelfCollections.set(collection.key, collection);
      fragment.appendChild(createShelfRow(collection).get(0));
    });
    $shelfStack.empty().append(fragment);
  }

  function clearGridProgressiveRendering() {
    if (state.gridObserver) {
      state.gridObserver.disconnect();
      state.gridObserver = null;
    }

    state.gridVisibleCount = 0;
    state.gridAppendInFlight = false;

    if (state.gridLoadMoreSentinel) {
      $(state.gridLoadMoreSentinel).remove();
      state.gridLoadMoreSentinel = null;
    }
  }

  function createGridLoadMoreSentinel(totalCount, renderedCount) {
    const remainingCount = Math.max(0, totalCount - renderedCount);
    return $('<button>')
      .addClass('library-grid-sentinel')
      .attr({
        type: 'button'
      })
      .text(`Load ${Math.min(remainingCount, GRID_RENDER_INCREMENT)} more books (${remainingCount} remaining)`);
  }

  function appendGridBookRange(books, startIndex, endIndex, variant, renderPassId) {
    const deferred = $.Deferred();
    const gridElement = $cards.get(0);
    let index = startIndex;

    function appendChunk() {
      if (renderPassId !== state.renderPassId) {
        deferred.resolve();
        return;
      }

      const fragment = document.createDocumentFragment();
      const chunkLimit = Math.min(index + LIBRARY_RENDER_BATCH_SIZE, endIndex);

      for (; index < chunkLimit; index += 1) {
        fragment.appendChild(createCard(books[index], { variant }).get(0));
      }

      gridElement.appendChild(fragment);

      if (index < endIndex) {
        window.requestAnimationFrame(appendChunk);
        return;
      }

      deferred.resolve();
    }

    appendChunk();
    return deferred.promise();
  }

  function renderGridBooks(books, renderPassId) {
    const deferred = $.Deferred();
    const totalCount = books.length;
    const variant = state.viewMode === 'compact' ? 'compact' : 'standard';

    clearGridProgressiveRendering();

    function installLoadMoreSentinel() {
      if (renderPassId !== state.renderPassId || state.gridVisibleCount >= totalCount) {
        return;
      }

      const $sentinel = createGridLoadMoreSentinel(totalCount, state.gridVisibleCount);

      $sentinel.on('click', function () {
        loadMoreBooks();
      });

      $cards.append($sentinel);
      state.gridLoadMoreSentinel = $sentinel.get(0);

      if (typeof window.IntersectionObserver !== 'function') {
        return;
      }

      state.gridObserver = new window.IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          loadMoreBooks();
        }
      }, {
        rootMargin: '320px 0px'
      });
      state.gridObserver.observe(state.gridLoadMoreSentinel);
    }

    function loadMoreBooks() {
      if (renderPassId !== state.renderPassId || state.gridAppendInFlight) {
        return;
      }

      const nextCount = Math.min(state.gridVisibleCount + GRID_RENDER_INCREMENT, totalCount);
      if (nextCount <= state.gridVisibleCount) {
        return;
      }

      state.gridAppendInFlight = true;

      if (state.gridObserver) {
        state.gridObserver.disconnect();
        state.gridObserver = null;
      }

      if (state.gridLoadMoreSentinel) {
        $(state.gridLoadMoreSentinel)
          .prop('disabled', true)
          .text('Loading more books…');
      }

      appendGridBookRange(books, state.gridVisibleCount, nextCount, variant, renderPassId).always(function () {
        if (renderPassId !== state.renderPassId) {
          deferred.resolve();
          return;
        }

        state.gridVisibleCount = nextCount;
        state.gridAppendInFlight = false;

        if (state.gridLoadMoreSentinel) {
          $(state.gridLoadMoreSentinel).remove();
          state.gridLoadMoreSentinel = null;
        }

        installLoadMoreSentinel();

        if (state.gridVisibleCount >= totalCount) {
          deferred.resolve();
        }
      });
    }

    state.gridVisibleCount = 0;
    const initialCount = Math.min(totalCount, GRID_INITIAL_RENDER_COUNT);
    const initialTarget = initialCount > 0 ? initialCount : totalCount;

    if (initialTarget <= 0) {
      deferred.resolve();
      return deferred.promise();
    }

    state.gridAppendInFlight = true;
    appendGridBookRange(books, 0, initialTarget, variant, renderPassId).always(function () {
      if (renderPassId !== state.renderPassId) {
        deferred.resolve();
        return;
      }

      state.gridVisibleCount = initialTarget;
      state.gridAppendInFlight = false;
      installLoadMoreSentinel();
      deferred.resolve();
    });

    return deferred.promise();
  }

  function renderBooks() {
    const visibleBooks = getVisibleBooks();
    const renderPassId = state.renderPassId + 1;
    const deferred = $.Deferred();

    state.renderPassId = renderPassId;
    clearGridProgressiveRendering();
    closeCardMenus();
    $cards.empty();
    $cards.toggleClass('is-compact', state.viewMode === 'compact');
    $cards.prop('hidden', state.viewMode === 'shelves');
    $shelfStack.empty();
    $shelfStack.prop('hidden', state.viewMode !== 'shelves');
    $emptyState.prop('hidden', true);

    renderBrowseControls(visibleBooks);
    updateCountLabel(visibleBooks.length, state.books.length);

    if (!visibleBooks.length) {
      $cards.prop('hidden', true);
      $shelfStack.prop('hidden', true);
      $emptyState.prop('hidden', state.libraryLoading);
      deferred.resolve();
      return deferred.promise();
    }

    if (state.viewMode === 'shelves') {
      renderShelfCollections(buildShelfCollections(visibleBooks));
      deferred.resolve();
      return deferred.promise();
    }

    return renderGridBooks(visibleBooks, renderPassId);
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

  function applyMetadataLoadingState() {
    if (state.metadataReady) {
      return;
    }

    setLibraryLoadingState(true, {
      title: state.books.length > 0 ? 'Refreshing your library' : 'Indexing your library',
      text: state.books.length > 0
        ? 'Showing your saved shelf while Dyslibria rebuilds the library index in the background.'
        : 'Dyslibria is building the first library index in the background. Large shelves can take a while, but the app is already online.'
    });
  }

  function applySystemStatus(status) {
    const previousStatus = state.status;
    const wasBusy = Boolean(previousStatus && (previousStatus.processing || previousStatus.queueLength > 0));
    const isBusy = Boolean(status && (status.processing || status.queueLength > 0));
    const previousMetadataReady = state.metadataReady;
    const previousMetadataUpdatedAtMs = state.metadataUpdatedAtMs;
    const nextMetadataReady = Boolean(status && status.metadataReady);
    const nextMetadataRefreshing = Boolean(status && status.metadataRefreshing);
    const nextMetadataUpdatedAtMs = Number(status && status.metadataUpdatedAtMs) || 0;
    const metadataBecameReady = !previousMetadataReady && nextMetadataReady;
    const metadataChanged = previousMetadataUpdatedAtMs > 0 &&
      nextMetadataUpdatedAtMs > 0 &&
      previousMetadataUpdatedAtMs !== nextMetadataUpdatedAtMs;

    state.status = status;
    state.metadataReady = nextMetadataReady;
    state.metadataRefreshing = nextMetadataRefreshing;
    state.metadataUpdatedAtMs = nextMetadataUpdatedAtMs;

    $conversionStatus.removeClass('is-processing is-idle is-attention');

    if (isBusy) {
      state.pendingPostConversionRefresh = true;
    } else if (wasBusy && state.pendingPostConversionRefresh && !state.autoRefreshInFlight) {
      state.pendingPostConversionRefresh = false;
      triggerAutomaticLibraryRefresh();
    }

    if (!nextMetadataReady && !state.autoRefreshInFlight) {
      applyMetadataLoadingState();
    }

    if (previousStatus && !state.autoRefreshInFlight && !isBusy && (metadataBecameReady || metadataChanged)) {
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

    if (!nextMetadataReady && !status.processing && !(status.queueLength > 0)) {
      $conversionStatus.addClass('is-processing');
      $conversionStatusText.text('Indexing library');
      $heroStatusText.text('Indexing library');
      $heroStatusMeta.text(
        state.books.length > 0
          ? 'Showing your saved shelf while Dyslibria reconciles the library in the background.'
          : 'Building the initial library index. Large shelves can take a while on first run.'
      );
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

  function focusBrowseShell() {
    const browseElement = $browseShell.get(0);
    if (!browseElement || typeof browseElement.scrollIntoView !== 'function') {
      return;
    }

    browseElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function activateCollectionBrowse(collection) {
    if (!collection || !Array.isArray(collection.filenames) || !collection.filenames.length) {
      return;
    }

    state.selectedCollection = {
      key: collection.key || 'selected',
      title: collection.title || 'Selected books',
      filenames: collection.filenames.slice(),
      cacheKey: buildCollectionCacheKey(collection),
      returnViewMode: state.viewMode
    };
    state.viewMode = 'grid';
    persistBrowsePreferences();
    closeMobileMenu();
    renderBooks();
    focusBrowseShell();
  }

  function clearBrowseState() {
    const returnViewMode = state.selectedCollection && state.selectedCollection.returnViewMode;
    if (state.searchDebounceTimer) {
      window.clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = null;
    }
    state.selectedCollection = null;
    state.activeFilter = DEFAULT_FILTER_MODE;
    state.query = '';
    $searchBar.val('');

    if (returnViewMode) {
      state.viewMode = sanitizeViewMode(returnViewMode);
    }

    persistBrowsePreferences();
    renderBooks();
  }

  function scrollShelfTrack(targetId, direction) {
    const trackElement = document.getElementById(targetId);
    if (!trackElement) {
      return;
    }

    const distance = Math.max(260, trackElement.clientWidth * 0.82);
    trackElement.scrollBy({
      left: direction === 'previous' ? -distance : distance,
      behavior: 'smooth'
    });
  }

  function hydrateLibraryFromCache() {
    const cachedBooks = readLibrarySnapshot();
    if (!cachedBooks.length) {
      applyMetadataLoadingState();
      return false;
    }

    setBooks(cachedBooks);
    state.usingCachedLibrary = true;
    renderBooks();
    applyMetadataLoadingState();
    return true;
  }

  function loadBooks() {
    if (!state.books.length) {
      applyMetadataLoadingState();
    } else {
      setLibraryLoadingState(true, {
        title: 'Refreshing your library',
        text: !state.metadataReady
          ? 'Showing your saved shelf while Dyslibria rebuilds the library index in the background.'
          : state.usingCachedLibrary
          ? 'Showing your saved shelf while Dyslibria checks the server for updates.'
          : 'Checking the server for the latest library changes.'
      });
    }

    return $.ajax({
      url: '/epubs',
      method: 'GET',
      dataType: 'json'
    }).then(function (books, _textStatus, jqXHR) {
      const normalizedBooks = Array.isArray(books) ? books.map(normalizeBook) : [];
      const nextBooks = normalizedBooks.filter(function (book) {
        return Boolean(book.filename);
      });
      const metadataReadyHeader = jqXHR && jqXHR.getResponseHeader
        ? jqXHR.getResponseHeader('X-Dyslibria-Metadata-Ready')
        : '';
      const metadataRefreshingHeader = jqXHR && jqXHR.getResponseHeader
        ? jqXHR.getResponseHeader('X-Dyslibria-Metadata-Refreshing')
        : '';
      const metadataUpdatedAtHeader = jqXHR && jqXHR.getResponseHeader
        ? jqXHR.getResponseHeader('X-Dyslibria-Metadata-Updated-At')
        : '';

      if (metadataReadyHeader) {
        state.metadataReady = metadataReadyHeader === '1';
      }

      if (metadataRefreshingHeader) {
        state.metadataRefreshing = metadataRefreshingHeader === '1';
      }

      if (metadataUpdatedAtHeader) {
        state.metadataUpdatedAtMs = Number(metadataUpdatedAtHeader) || state.metadataUpdatedAtMs;
      }

      if (!nextBooks.length && !state.metadataReady) {
        renderBooks();
        applyMetadataLoadingState();
        return $.Deferred().resolve().promise();
      }

      setBooks(nextBooks);
      state.usingCachedLibrary = false;
      persistLibrarySnapshot(state.books);

      return renderBooks().always(function () {
        setLibraryLoadingState(false);
      });
    }).catch(function (xhr) {
      if (state.metadataReady) {
        setLibraryLoadingState(false);
      } else {
        applyMetadataLoadingState();
      }

      if (!state.books.length) {
        renderBooks();
        showNotice('Dyslibria could not load the library just now. Try again in a moment.', 'error', {
          title: 'Library did not load',
          timeout: 0
        });
        return $.Deferred().reject(xhr).promise();
      }

      updateCountLabel(getVisibleBooks().length, state.books.length);
      renderBrowseControls(getVisibleBooks());
      return $.Deferred().reject(xhr).promise();
    });
  }

  function loadReadingProgress() {
    return $.get('/api/reading-progress').then(function (payload) {
      const progressEntries = Array.isArray(payload && payload.progress) ? payload.progress : [];
      setProgressEntries(progressEntries.map(normalizeProgressEntry).filter(function (entry) {
        return Boolean(entry.filename);
      }));
      renderContinueCard();
      if (state.books.length) {
        renderBooks();
      }
    }).catch(function () {
      setProgressEntries([]);
      renderContinueCard();
      if (state.books.length) {
        renderBooks();
      }
    });
  }

  function loadSession() {
    const previousCanDelete = canDeleteBooks();
    return $.get('/api/session').then(function (payload) {
      state.session = payload || null;
      applySessionCapabilities();
      if (state.books.length && previousCanDelete !== canDeleteBooks()) {
        renderBooks();
      }
      loadUpdateStatus();
      maybeShowUpdateNotice();
    }).catch(function () {
      state.session = null;
      applySessionCapabilities();
      if (state.books.length && previousCanDelete !== canDeleteBooks()) {
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

    $uploadForm.on('submit', async function (event) {
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

      setUploadBusy(true);
      setUploadProgressState({
        percent: 0,
        title: fileSummary.count > 1 ? `Uploading ${fileSummary.count} books` : `Uploading ${selectedFiles[0].name}`,
        copy: 'Sending files to Dyslibria. Large selections are split into smaller batches automatically.',
        meta: `${formatBytes(fileSummary.totalBytes)} total selected.`
      });

      try {
        const result = await uploadSelectedFiles(selectedFiles);
        const queuedCount = Array.isArray(result && result.queuedFiles) && result.queuedFiles.length
          ? result.queuedFiles.length
          : fileSummary.count;

        setUploadProgressState({
          percent: 100,
          title: queuedCount === 1 ? '1 book queued' : `${queuedCount} books queued`,
          copy: 'Upload complete. Dyslibria has accepted every batch and started conversion work.',
          meta: 'You can follow conversion progress from the queue status pill and the conversion log.'
        });
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
      } catch (errorPayload) {
        const message = getUploadErrorMessage(errorPayload);
        const retainedRemainingFiles = errorPayload && errorPayload.acceptedCount > 0
          ? replaceSelectedUploadFiles(errorPayload.remainingFiles)
          : false;
        const acceptedCount = Number(errorPayload && errorPayload.acceptedCount) || 0;
        const acceptedBytes = Number(errorPayload && errorPayload.acceptedBytes) || 0;

        setUploadProgressState({
          percent: calculateUploadPercent(acceptedBytes, fileSummary.totalBytes),
          title: 'Upload did not finish',
          copy: message,
          meta: acceptedCount > 0
            ? retainedRemainingFiles
              ? `${acceptedCount} book${acceptedCount === 1 ? '' : 's'} already reached the queue. The unfinished files are still selected so you can retry just those.`
              : `${acceptedCount} book${acceptedCount === 1 ? '' : 's'} already reached the queue. Re-select the unfinished files before retrying.`
            : 'Review the message, adjust the batch if needed, and try again.',
          tone: 'error'
        });
        showNotice(message, 'error', {
          title: acceptedCount > 0 ? 'Upload only finished partially' : 'Upload could not start',
          timeout: 0
        });
      } finally {
        setUploadBusy(false);
      }
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

    $viewToggles.on('click', function () {
      state.viewMode = sanitizeViewMode($(this).data('viewMode'));
      persistBrowsePreferences();
      closeMobileMenu();
      renderBooks();
    });

    $sortSelect.on('change', function () {
      state.sortMode = sanitizeSortMode($(this).val());
      persistBrowsePreferences();
      renderBooks();
    });

    $filterChips.on('click', function () {
      state.activeFilter = sanitizeFilterMode($(this).data('filter'));
      state.selectedCollection = null;
      persistBrowsePreferences();
      renderBooks();
      focusBrowseShell();
    });

    $clearBrowseButton.on('click', function () {
      clearBrowseState();
      focusBrowseShell();
    });

    $app.on('click', '.shelf-action[data-action="see-all"]', function () {
      const collectionKey = String($(this).data('collectionKey') || '');
      activateCollectionBrowse(state.shelfCollections.get(collectionKey));
    });

    $app.on('click', '.shelf-nav', function () {
      const $button = $(this);
      if ($button.prop('disabled')) {
        return;
      }

      scrollShelfTrack(String($button.data('target') || ''), String($button.data('direction') || 'next'));
    });

    $app.on('click', '.card-menu-toggle', function (event) {
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

    $app.on('click', '.card-menu', function (event) {
      event.stopPropagation();
    });

    $app.on('click', '.card-menu-action', function (event) {
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
      const nextQuery = $(this).val() || '';
      if (state.searchDebounceTimer) {
        window.clearTimeout(state.searchDebounceTimer);
      }
      state.searchDebounceTimer = window.setTimeout(function () {
        state.searchDebounceTimer = null;
        state.query = nextQuery;
        renderBooks();
      }, SEARCH_INPUT_DEBOUNCE_MS);
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
