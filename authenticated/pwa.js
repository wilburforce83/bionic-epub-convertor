(function () {
  let deferredPrompt = null;
  const installButtons = new Set();

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function updateButtonState(button) {
    if (!button) {
      return;
    }

    const shouldShow = Boolean(deferredPrompt) && !isStandalone();
    button.hidden = !shouldShow;
    button.classList.toggle('hidden', !shouldShow);
    button.disabled = !shouldShow;
  }

  function refreshButtons() {
    installButtons.forEach(updateButtonState);
  }

  function bindInstallButton(target) {
    const button = typeof target === 'string' ? document.querySelector(target) : target;

    if (!button || installButtons.has(button)) {
      return;
    }

    installButtons.add(button);
    button.addEventListener('click', async function () {
      if (!deferredPrompt) {
        return;
      }

      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(function () {
        return null;
      });
      deferredPrompt = null;
      refreshButtons();
    });

    updateButtonState(button);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/app-sw.js', { scope: '/' }).catch(function (error) {
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
    refreshButtons();
  });

  window.DyslibriaPwa = {
    bindInstallButton,
    isStandalone
  };
})();
