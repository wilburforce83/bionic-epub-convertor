(function () {
  let deferredPrompt = null;
  let manualInstallSheet = null;
  const installButtons = new Set();
  const displayModeQuery = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;

  function isStandalone() {
    return Boolean(
      (displayModeQuery && displayModeQuery.matches) ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    const userAgent = window.navigator.userAgent || '';
    const platform = window.navigator.platform || '';
    const touchMac = platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
    return /iphone|ipad|ipod/i.test(userAgent) || touchMac;
  }

  function isAndroid() {
    return /android/i.test(window.navigator.userAgent || '');
  }

  function getInstallMode() {
    if (isStandalone()) {
      return 'installed';
    }

    if (deferredPrompt) {
      return 'prompt';
    }

    if (isIos()) {
      return 'ios-manual';
    }

    if (isAndroid()) {
      return 'android-manual';
    }

    return 'unavailable';
  }

  function getButtonLabel(mode) {
    switch (mode) {
      case 'ios-manual':
        return 'Add to Home Screen';
      case 'android-manual':
        return 'Install app';
      case 'prompt':
        return 'Install app';
      default:
        return 'Install';
    }
  }

  function setButtonLabel(button, label) {
    if (!button) {
      return;
    }

    const labelTarget = button.querySelector('span');
    if (labelTarget) {
      labelTarget.textContent = label;
      return;
    }

    button.textContent = label;
  }

  function updateButtonState(button) {
    if (!button) {
      return;
    }

    const mode = getInstallMode();
    const shouldShow = mode !== 'installed' && mode !== 'unavailable';

    button.hidden = !shouldShow;
    button.classList.toggle('hidden', !shouldShow);
    button.disabled = !shouldShow;
    button.dataset.installMode = mode;
    setButtonLabel(button, getButtonLabel(mode));
  }

  function refreshButtons() {
    installButtons.forEach(updateButtonState);
  }

  function getManualInstallCopy(mode) {
    if (mode === 'ios-manual') {
      return {
        title: 'Add Dyslibria to your Home Screen',
        intro: 'iPhone and iPad install Dyslibria through the browser share menu.',
        steps: [
          'Open the browser share menu.',
          'Choose "Add to Home Screen".',
          'Tap "Add" to install Dyslibria.'
        ],
        note: 'If "Add to Home Screen" is missing, open Dyslibria in Safari and try again.'
      };
    }

    return {
      title: 'Install Dyslibria',
      intro: 'Android browsers usually offer install from the browser menu when the app is ready.',
      steps: [
        'Open the browser menu.',
        'Choose "Install app" or "Add to Home screen".',
        'Confirm the install prompt.'
      ],
      note: 'If you are in Chrome, you may also see an install prompt automatically after a short visit.'
    };
  }

  function closeManualInstallSheet() {
    if (!manualInstallSheet) {
      return;
    }

    manualInstallSheet.hidden = true;
    manualInstallSheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dyslibria-install-open');
  }

  function ensureManualInstallSheet() {
    if (manualInstallSheet) {
      return manualInstallSheet;
    }

    const style = document.createElement('style');
    style.textContent = `
      .dyslibria-install-open {
        overflow: hidden;
      }

      .dyslibria-install-sheet[hidden] {
        display: none !important;
      }

      .dyslibria-install-sheet {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 1rem;
        z-index: 1200;
      }

      .dyslibria-install-sheet__scrim {
        position: absolute;
        inset: 0;
        background: rgba(11, 12, 16, 0.56);
        backdrop-filter: blur(8px);
      }

      .dyslibria-install-sheet__card {
        position: relative;
        width: min(100%, 28rem);
        padding: 1.25rem;
        border-radius: 0.5rem;
        border: 1px solid rgba(255, 220, 206, 0.08);
        background: rgba(30, 24, 22, 0.96);
        color: #f7eee8;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
      }

      .dyslibria-install-sheet__eyebrow {
        margin: 0 0 0.45rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 0.72rem;
        color: #c8b5ac;
      }

      .dyslibria-install-sheet__title {
        margin: 0 0 0.7rem;
        font: 400 1.6rem/1.15 "Lato", "Helvetica Neue", Arial, Helvetica, sans-serif;
      }

      .dyslibria-install-sheet__copy,
      .dyslibria-install-sheet__note {
        margin: 0;
        line-height: 1.6;
        color: #c8b5ac;
      }

      .dyslibria-install-sheet__steps {
        margin: 1rem 0 0;
        padding-left: 1.1rem;
        display: grid;
        gap: 0.55rem;
      }

      .dyslibria-install-sheet__actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 1rem;
      }

      .dyslibria-install-sheet__button {
        min-height: 2.8rem;
        padding: 0 1rem;
        border: 0;
        border-radius: 0.28571429rem;
        background: var(--app-accent, #d05834);
        color: var(--app-accent-contrast, #fff8f4);
        font: inherit;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);

    manualInstallSheet = document.createElement('div');
    manualInstallSheet.className = 'dyslibria-install-sheet';
    manualInstallSheet.hidden = true;
    manualInstallSheet.setAttribute('aria-hidden', 'true');
    manualInstallSheet.innerHTML = `
      <div class="dyslibria-install-sheet__scrim" data-close-install></div>
      <div class="dyslibria-install-sheet__card" role="dialog" aria-modal="true" aria-labelledby="dyslibria-install-title">
        <p class="dyslibria-install-sheet__eyebrow">Install Dyslibria</p>
        <h2 class="dyslibria-install-sheet__title" id="dyslibria-install-title"></h2>
        <p class="dyslibria-install-sheet__copy" id="dyslibria-install-intro"></p>
        <ol class="dyslibria-install-sheet__steps" id="dyslibria-install-steps"></ol>
        <p class="dyslibria-install-sheet__note" id="dyslibria-install-note"></p>
        <div class="dyslibria-install-sheet__actions">
          <button class="dyslibria-install-sheet__button" id="dyslibria-install-close" type="button">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(manualInstallSheet);

    manualInstallSheet.addEventListener('click', function (event) {
      if (event.target && event.target.hasAttribute('data-close-install')) {
        closeManualInstallSheet();
      }
    });

    manualInstallSheet.querySelector('#dyslibria-install-close')
      .addEventListener('click', closeManualInstallSheet);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && manualInstallSheet && !manualInstallSheet.hidden) {
        closeManualInstallSheet();
      }
    });

    return manualInstallSheet;
  }

  function showManualInstallSheet(mode) {
    const sheet = ensureManualInstallSheet();
    const copy = getManualInstallCopy(mode);
    const steps = sheet.querySelector('#dyslibria-install-steps');

    sheet.querySelector('#dyslibria-install-title').textContent = copy.title;
    sheet.querySelector('#dyslibria-install-intro').textContent = copy.intro;
    sheet.querySelector('#dyslibria-install-note').textContent = copy.note;
    steps.innerHTML = '';

    copy.steps.forEach(function (step) {
      const item = document.createElement('li');
      item.textContent = step;
      steps.appendChild(item);
    });

    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dyslibria-install-open');
  }

  function bindInstallButton(target) {
    const button = typeof target === 'string' ? document.querySelector(target) : target;

    if (!button || installButtons.has(button)) {
      return;
    }

    installButtons.add(button);
    button.addEventListener('click', async function () {
      const mode = button.dataset.installMode || getInstallMode();

      if (mode === 'prompt' && deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(function () {
          return null;
        });
        deferredPrompt = null;
        refreshButtons();
        return;
      }

      if (mode === 'ios-manual' || mode === 'android-manual') {
        showManualInstallSheet(mode);
      }
    });

    updateButtonState(button);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/app-sw.js', { scope: '/' })
        .then(function (registration) {
          if (registration && typeof registration.update === 'function') {
            registration.update();
          }
        })
        .catch(function (error) {
          console.warn('PWA registration failed:', error);
        });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    refreshButtons();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    closeManualInstallSheet();
    refreshButtons();
  });

  if (displayModeQuery) {
    if (typeof displayModeQuery.addEventListener === 'function') {
      displayModeQuery.addEventListener('change', refreshButtons);
    } else if (typeof displayModeQuery.addListener === 'function') {
      displayModeQuery.addListener(refreshButtons);
    }
  }

  window.addEventListener('pageshow', refreshButtons);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      refreshButtons();
    }
  });

  window.DyslibriaPwa = {
    bindInstallButton,
    isStandalone,
    refreshButtons
  };
})();
