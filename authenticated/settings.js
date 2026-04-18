$(document).ready(function () {
  const THEME_STORAGE_KEY = 'dyslibria:library-theme:v1';

  const state = {
    theme: localStorage.getItem(THEME_STORAGE_KEY) || 'dark',
    themeColorKey: (window.DyslibriaTheme && window.DyslibriaTheme.DEFAULT_COLOR_KEY) || 'ember',
    themeColorOptions: (window.DyslibriaTheme && window.DyslibriaTheme.COLOR_OPTIONS.slice()) || [],
    palette: null,
    session: null,
    settings: null,
    users: [],
    mobileMenuOpen: false
  };

  const $app = $('#settingsApp');
  const $currentUserBadge = $('#currentUserBadge');
  const $themeModeBadge = $('#themeModeBadge');
  const $settingsHeading = $('#settingsHeading');
  const $settingsIntroCopy = $('#settingsIntroCopy');
  const $setupShell = $('#setupShell');
  const $standardSettingsShell = $('#standardSettingsShell');
  const $profileUsername = $('#profileUsername');
  const $profileRole = $('#profileRole');
  const $profileStatus = $('#profileStatus');
  const $generalSection = $('#generalSection');
  const $usersSection = $('#usersSection');
  const $themeColorSelect = $('#themeColorSelect');
  const $userList = $('#userList');
  const $backToLibraryButton = $('#backToLibraryButton');
  const $settingsInstallButton = $('#settingsInstallButton');
  const $settingsMenuToggle = $('#settingsMenuToggle');
  const $settingsHeaderActions = $('#settingsHeaderActions');

  if (window.DyslibriaPwa) {
    window.DyslibriaPwa.bindInstallButton($settingsInstallButton.get(0));
  }

  function setButtonBusy($button, busy) {
    $button.prop('disabled', busy);
    $button.toggleClass('loading', busy);
  }

  function closeMobileMenu() {
    state.mobileMenuOpen = false;
    $settingsHeaderActions.removeClass('is-open');
    $settingsMenuToggle.attr('aria-expanded', 'false');
  }

  function formatRelativeTime(value) {
    const timestamp = Date.parse(value || '');
    if (!timestamp) {
      return 'No recorded login yet';
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

  function populateThemeColorOptions() {
    $themeColorSelect.empty();

    state.themeColorOptions.forEach(function (option) {
      const $option = $('<option>')
        .attr('value', option.key)
        .text(option.label);

      if (option.key === state.themeColorKey) {
        $option.prop('selected', true);
      }

      $themeColorSelect.append($option);
    });
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
    $themeModeBadge.text(isDark ? 'Dark theme' : 'Light theme');
    applyAccentPalette();
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  }

  function renderSession() {
    if (!state.session || !state.session.user) {
      return;
    }

    const user = state.session.user;
    const isSetup = user.mustSetup === true;

    $currentUserBadge.text(isSetup ? 'Bootstrap administrator' : `${user.username} · ${user.role}`);
    $profileUsername.text(user.username);
    $profileRole.text(isSetup ? 'Bootstrap setup session' : `${user.role === 'admin' ? 'Administrator' : 'Reader'} account`);
    $profileStatus.text(user.isActive === false ? 'Inactive' : 'Active');

    $setupShell.prop('hidden', !isSetup);
    $standardSettingsShell.prop('hidden', isSetup);
    $backToLibraryButton.toggle(!isSetup);

    if (isSetup) {
      closeMobileMenu();
    }

    if (isSetup) {
      $settingsHeading.text('Initial setup');
      $settingsIntroCopy.text('Create the permanent administrator account and finish the first-run bootstrap flow.');
      return;
    }

    $settingsHeading.text('Settings');
    $settingsIntroCopy.text('Manage system defaults, account access, and install behaviour from one place.');
    $generalSection.prop('hidden', user.role !== 'admin');
    $usersSection.prop('hidden', user.role !== 'admin');
  }

  function renderUsers() {
    $userList.empty();

    if (!state.users.length) {
      $userList.append(
        $('<div>').addClass('user-card').append(
          $('<p>').text('No user accounts found yet.')
        )
      );
      return;
    }

    state.users.forEach(function (user) {
      const isSelf = state.session && state.session.user && state.session.user.id === user.id;

      const $card = $('<article>').addClass('user-card').attr('data-user-id', user.id);
      const $header = $('<div>').addClass('user-card-header');
      const $titleBlock = $('<div>');
      const $title = $('<h3>').text(user.username);
      const $meta = $('<p>').addClass('user-card-meta').text(
        `${user.role === 'admin' ? 'Administrator' : 'Reader'} · Last login ${formatRelativeTime(user.lastLoginAt)}`
      );
      const $badge = $('<span>').addClass('meta-pill').text(user.isActive === false ? 'Inactive' : 'Active');

      const $grid = $('<div>').addClass('ui form user-card-grid');
      const $roleField = $('<div>').addClass('field');
      const $roleSelect = $('<select>').addClass('user-role')
        .append($('<option>').val('reader').text('Reader'))
        .append($('<option>').val('admin').text('Administrator'))
        .val(user.role);
      const $statusField = $('<div>').addClass('field');
      const $statusSelect = $('<select>').addClass('user-status')
        .append($('<option>').val('true').text('Active'))
        .append($('<option>').val('false').text('Inactive'))
        .val(user.isActive === false ? 'false' : 'true');
      const $passwordField = $('<div>').addClass('field');
      const $passwordInput = $('<input>').attr({
        type: 'password',
        placeholder: 'Leave blank to keep current password'
      }).addClass('user-password');

      $roleField.append($('<label>').text('Role'), $roleSelect);
      $statusField.append($('<label>').text('Status'), $statusSelect);
      $passwordField.append($('<label>').text('Reset password'), $passwordInput);
      $grid.append($roleField, $statusField, $passwordField);

      const $actions = $('<div>').addClass('section-actions');
      const $saveButton = $('<button>').addClass('ui button app-button accent save-user-button').attr('type', 'button').text('Save account');
      const $deleteButton = $('<button>').addClass('ui button app-button ghost delete-user-button').attr('type', 'button').text('Delete user');

      if (isSelf) {
        $deleteButton.prop('disabled', true).text('Current account');
      }

      $actions.append($saveButton, $deleteButton);

      const $footer = $('<p>').addClass('user-card-footer').text(
        user.createdAt ? `Created ${new Date(user.createdAt).toLocaleString()}` : 'Creation time unavailable'
      );

      $titleBlock.append($title, $meta);
      $header.append($titleBlock, $badge);
      $card.append($header, $grid, $actions, $footer);
      $userList.append($card);
    });
  }

  function loadAppConfig() {
    return $.get('/api/app-config').then(function (payload) {
      const themeColors = Array.isArray(payload && payload.themeColors) ? payload.themeColors : [];
      if (themeColors.length) {
        state.themeColorOptions = themeColors;
      }

      state.themeColorKey = (payload && payload.themeColor) || state.themeColorKey;
      populateThemeColorOptions();
      applyTheme();
    }).catch(function () {
      populateThemeColorOptions();
      applyTheme();
    });
  }

  function loadSession() {
    return $.get('/api/session').then(function (payload) {
      state.session = payload || {};
      renderSession();
    });
  }

  function loadGeneralSettings() {
    if (!state.session || !state.session.canManageSystem) {
      return $.Deferred().resolve().promise();
    }

    return $.get('/settings').then(function (data) {
      state.settings = data || {};
      if (Array.isArray(data.themeColors) && data.themeColors.length) {
        state.themeColorOptions = data.themeColors;
      }

      state.themeColorKey = data.themeColor || state.themeColorKey;
      populateThemeColorOptions();
      $('input[name="webdavPort"]').val(data.webdavPort);
      $('input[name="opdsPort"]').val(data.opdsPort);
      $('input[name="uploadPath"]').val(data.uploadPath);
      $('input[name="libraryPath"]').val(data.libraryPath);
      $('input[name="baseUrl"]').val(data.baseUrl);
      $themeColorSelect.val(state.themeColorKey);
      applyTheme();
    });
  }

  function loadUsers() {
    if (!state.session || !state.session.canManageUsers || state.session.user.mustSetup) {
      return $.Deferred().resolve().promise();
    }

    return $.get('/api/users').then(function (payload) {
      state.users = Array.isArray(payload && payload.users) ? payload.users : [];
      renderUsers();
    });
  }

  function bindEvents() {
    $settingsMenuToggle.on('click', function () {
      state.mobileMenuOpen = !state.mobileMenuOpen;
      $settingsHeaderActions.toggleClass('is-open', state.mobileMenuOpen);
      $(this).attr('aria-expanded', String(state.mobileMenuOpen));
    });

    $settingsHeaderActions.on('click', 'a, button', function () {
      if (window.innerWidth <= 720) {
        closeMobileMenu();
      }
    });

    $('#setupForm').on('submit', function (event) {
      event.preventDefault();
      const $button = $('#completeSetupButton');
      const username = $(this).find('input[name="username"]').val();
      const password = $(this).find('input[name="password"]').val();
      const confirmPassword = $(this).find('input[name="confirmPassword"]').val();

      if (password !== confirmPassword) {
        alert('The passwords do not match.');
        return;
      }

      setButtonBusy($button, true);

      $.post('/api/setup/admin', { username, password }, function () {
        window.location.href = '/authenticated/index.html';
      }).fail(function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to complete the initial setup.';
        alert(message);
      }).always(function () {
        setButtonBusy($button, false);
      });
    });

    $('#passwordForm').on('submit', function (event) {
      event.preventDefault();
      const $button = $('#savePasswordButton');
      const currentPassword = $(this).find('input[name="currentPassword"]').val();
      const newPassword = $(this).find('input[name="newPassword"]').val();
      const confirmNewPassword = $(this).find('input[name="confirmNewPassword"]').val();

      if (newPassword !== confirmNewPassword) {
        alert('The new passwords do not match.');
        return;
      }

      setButtonBusy($button, true);

      $.post('/api/account/password', { currentPassword, newPassword }, () => {
        this.reset();
        alert('Password updated.');
      }).fail(function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to update the password.';
        alert(message);
      }).always(function () {
        setButtonBusy($button, false);
      });
    });

    $('#generalSettingsForm').on('submit', function (event) {
      event.preventDefault();
      const $button = $('#saveGeneralSettingsButton');
      const payload = $(this).serialize();

      setButtonBusy($button, true);

      $.post('/settings', payload, function (response) {
        state.themeColorKey = $themeColorSelect.val() || state.themeColorKey;
        applyTheme();
        alert(
          response && response.requiresRestart
            ? 'Settings saved. Restart Dyslibria for path, port, or base URL changes to take effect.'
            : 'Settings saved.'
        );
      }).fail(function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to save settings.';
        alert(message);
      }).always(function () {
        setButtonBusy($button, false);
      });
    });

    $('#restartServerButton').on('click', function () {
      const $button = $(this);
      setButtonBusy($button, true);

      $.post('/restart-server', function () {
        alert('Server restart requested.');
      }).fail(function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Server restart is disabled or failed.';
        alert(message);
      }).always(function () {
        setButtonBusy($button, false);
      });
    });

    $('#forceRefreshButton').on('click', function () {
      const $button = $(this);
      setButtonBusy($button, true);

      $.post('/update-database', function () {
        alert('Library refresh completed.');
      }).fail(function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to refresh the library.';
        alert(message);
      }).always(function () {
        setButtonBusy($button, false);
      });
    });

    $('#createUserForm').on('submit', function (event) {
      event.preventDefault();
      const $button = $('#createUserButton');
      const payload = {
        username: $(this).find('input[name="username"]').val(),
        password: $(this).find('input[name="password"]').val(),
        role: $(this).find('select[name="role"]').val()
      };

      setButtonBusy($button, true);

      $.post('/api/users', payload, function () {
        $('#createUserForm').get(0).reset();
        loadUsers();
      }).fail(function (xhr) {
        const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to create the user.';
        alert(message);
      }).always(function () {
        setButtonBusy($button, false);
      });
    });

    $userList.on('click', '.save-user-button', function () {
      const $button = $(this);
      const $card = $button.closest('.user-card');
      const userId = $card.data('user-id');
      const payload = {
        role: $card.find('.user-role').val(),
        isActive: $card.find('.user-status').val(),
        password: $card.find('.user-password').val()
      };

      setButtonBusy($button, true);

      $.ajax({
        url: `/api/users/${encodeURIComponent(userId)}`,
        type: 'PATCH',
        data: payload,
        success: function () {
          loadUsers();
        },
        error: function (xhr) {
          const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to update the user.';
          alert(message);
        },
        complete: function () {
          setButtonBusy($button, false);
        }
      });
    });

    $userList.on('click', '.delete-user-button', function () {
      const $button = $(this);
      if ($button.prop('disabled')) {
        return;
      }

      const $card = $button.closest('.user-card');
      const userId = $card.data('user-id');

      if (!window.confirm('Delete this user account?')) {
        return;
      }

      setButtonBusy($button, true);

      $.ajax({
        url: `/api/users/${encodeURIComponent(userId)}`,
        type: 'DELETE',
        success: function () {
          loadUsers();
        },
        error: function (xhr) {
          const message = (xhr.responseJSON && xhr.responseJSON.message) || 'Unable to delete the user.';
          alert(message);
        },
        complete: function () {
          setButtonBusy($button, false);
        }
      });
    });

    $(window).on('resize', function () {
      if (window.innerWidth > 720) {
        closeMobileMenu();
      }
    });

    $(document).on('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMobileMenu();
      }
    });
  }

  function initialise() {
    bindEvents();

    $.when(loadAppConfig(), loadSession()).then(function () {
      if (state.session && state.session.canManageSystem) {
        return $.when(loadGeneralSettings(), loadUsers());
      }

      return $.Deferred().resolve().promise();
    }).fail(function () {
      alert('Unable to load the settings page.');
    });
  }

  initialise();
});
