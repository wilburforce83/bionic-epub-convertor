$(document).ready(function () {
  const state = {
    books: [],
    query: ''
  };

  const $cards = $('#epubCards');
  const $emptyState = $('#emptyState');
  const $count = $('#libraryCount');
  const $searchBar = $('#searchBar');
  const $installButton = $('#installButton');
  const $dropZone = $('#dropZone');
  const $fileInput = $('#epubFiles');

  if (window.DyslibriaPwa) {
    window.DyslibriaPwa.bindInstallButton($installButton.get(0));
  }

  function updateCountLabel(visibleCount, totalCount) {
    const suffix = visibleCount === 1 ? 'book' : 'books';
    const prefix = state.query && visibleCount !== totalCount
      ? `${visibleCount} of ${totalCount}`
      : `${visibleCount}`;

    $count.text(`${prefix} ${suffix}`);
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
    const $card = $('<article>').addClass('library-card').attr('data-filename', book.filename || '');
    const $coverSurface = $('<div>').addClass('cover-surface');
    const $image = $('<img>')
      .attr('src', book.cover || '')
      .attr('alt', `${book.title || book.filename || 'Book'} cover`)
      .attr('loading', 'lazy');
    const $body = $('<div>').addClass('card-body');
    const $title = $('<h2>').addClass('card-title').text(book.title || book.filename || 'Untitled');
    const $author = $('<p>').addClass('card-author').text(book.author || 'Unknown author');
    const $footer = $('<div>').addClass('card-footer');
    const $chip = $('<span>').addClass('card-chip');

    $chip.append($('<i>').addClass('book icon').attr('aria-hidden', 'true'));
    $chip.append($('<span>').text('Read now'));

    $image.on('error', function () {
      $coverSurface.addClass('is-fallback');
      $(this).css('opacity', '0');
    });

    $coverSurface.append($image);
    $footer.append($chip);
    $body.append($title, $author, $footer);
    $card.append($coverSurface, $body);

    $card.on('click', function () {
      const filename = $(this).data('filename');
      window.location.href = `reader.html?file=${encodeURIComponent(filename)}`;
    });

    return $card;
  }

  function renderBooks() {
    const filteredBooks = getFilteredBooks();
    $cards.empty();

    filteredBooks.forEach(function (book) {
      $cards.append(createCard(book));
    });

    updateCountLabel(filteredBooks.length, state.books.length);
    $emptyState.prop('hidden', filteredBooks.length > 0);
  }

  function setButtonBusy($button, busy) {
    $button.prop('disabled', busy);
    $button.toggleClass('loading', busy);
  }

  function loadBooks() {
    return $.get('/epubs', function (books) {
      state.books = Array.isArray(books) ? books : [];
      renderBooks();
    });
  }

  $('#updateDatabaseButton').on('click', function () {
    const $button = $(this);
    setButtonBusy($button, true);

    $.post('/update-database', function () {
      loadBooks();
    }).fail(function () {
      alert('Error refreshing library');
    }).always(function () {
      setButtonBusy($button, false);
    });
  });

  $('#uploadButton').on('click', function () {
    $('#uploadModal').modal('show');
  });

  $('#settingsButton').on('click', function () {
    $.get('/settings', function (data) {
      $('#settingsForm').find('input[name="webdavPort"]').val(data.webdavPort);
      $('#settingsForm').find('input[name="opdsPort"]').val(data.opdsPort);
      $('#settingsForm').find('input[name="uploadPath"]').val(data.uploadPath);
      $('#settingsForm').find('input[name="libraryPath"]').val(data.libraryPath);
      $('#settingsForm').find('input[name="baseUrl"]').val(data.baseUrl);
      $('#settingsModal').modal('show');
    }).fail(function () {
      alert('Error loading settings');
    });
  });

  $('#cancelSettingsButton').on('click', function () {
    $('#settingsModal').modal('hide');
  });

  $('#saveSettingsButton').on('click', function () {
    const settingsData = $('#settingsForm').serialize();

    $.post('/settings', settingsData, function () {
      $('#settingsModal').modal('hide');
      alert('Settings saved. Restart the server for path, port, or base URL changes to take effect.');
    }).fail(function (xhr) {
      const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Error saving settings';
      alert(message);
    });
  });

  $('#restartServerButton').on('click', function () {
    $.post('/restart-server', function () {
      alert('Server is restarting...');
    }).fail(function () {
      alert('Server restart is disabled or failed. Restart the process manually.');
    });
  });

  $('#uploadForm').on('submit', function (event) {
    event.preventDefault();
    const formData = new FormData(this);

    $.ajax({
      url: '/upload',
      type: 'POST',
      data: formData,
      processData: false,
      contentType: false,
      success: function () {
        $('#uploadModal').modal('hide');
        loadBooks();
      },
      error: function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Error uploading files';
        alert(message);
      }
    });
  });

  $dropZone.on('dragover', function (event) {
    event.preventDefault();
    event.stopPropagation();
    $(this).addClass('dragover');
  });

  $dropZone.on('dragleave', function (event) {
    event.preventDefault();
    event.stopPropagation();
    $(this).removeClass('dragover');
  });

  $dropZone.on('drop', function (event) {
    event.preventDefault();
    event.stopPropagation();
    $(this).removeClass('dragover');

    const files = event.originalEvent.dataTransfer.files;
    $fileInput.get(0).files = files;
    $(this).text(files.length > 1 ? `${files.length} files selected` : files[0].name);
  });

  $dropZone.on('click', function () {
    $fileInput.trigger('click');
  });

  $fileInput.on('change', function () {
    const files = $(this).get(0).files;

    if (!files || files.length === 0) {
      $dropZone.text('Drag EPUB files here or click to choose them');
      return;
    }

    $dropZone.text(files.length > 1 ? `${files.length} files selected` : files[0].name);
  });

  $searchBar.on('input', function () {
    state.query = $(this).val() || '';
    renderBooks();
  });

  loadBooks().fail(function () {
    alert('Error loading library');
  });
});
