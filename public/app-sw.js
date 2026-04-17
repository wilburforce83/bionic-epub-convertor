const STATIC_CACHE = 'dyslibria-assets-v12';
const STATIC_ASSETS = [
  '/manifest.json',
  '/app-theme.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/authenticated/library.css',
  '/authenticated/library.js',
  '/authenticated/reader.css',
  '/authenticated/reader.js',
  '/authenticated/pwa.js',
  '/authenticated/jquery.js',
  '/authenticated/semantic.min.css',
  '/authenticated/semantic.min.js',
  '/authenticated/jszip.min.js',
  '/authenticated/epub.js',
  '/authenticated/ajax-loader.gif'
];

function isCacheableRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return false;
  }

  if (url.pathname === '/' || url.pathname === '/login' || url.pathname === '/sw.js') {
    return false;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    return true;
  }

  return ['style', 'script', 'image', 'font'].includes(request.destination);
}

function isValidCachedResponse(request, response) {
  if (!response || !response.ok) {
    return false;
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return false;
  }

  if (request.destination === 'style') {
    return contentType.includes('text/css');
  }

  if (request.destination === 'script') {
    return contentType.includes('javascript') || contentType.includes('ecmascript');
  }

  return true;
}

function shouldCacheNetworkResponse(request, response) {
  if (!isValidCachedResponse(request, response)) {
    return false;
  }

  if (response.redirected) {
    return false;
  }

  try {
    const responseUrl = new URL(response.url);
    const requestUrl = new URL(request.url);
    if (responseUrl.origin !== requestUrl.origin || responseUrl.pathname !== requestUrl.pathname) {
      return false;
    }
  } catch (error) {
    return false;
  }

  return true;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames
        .filter(function (cacheName) {
          return cacheName.startsWith('dyslibria-assets-') && cacheName !== STATIC_CACHE;
        })
        .map(function (cacheName) {
          return caches.delete(cacheName);
        })
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);

  if (!isCacheableRequest(event.request, url)) {
    return;
  }

  event.respondWith((async function () {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(event.request, { ignoreSearch: true });

    if (cachedResponse && !isValidCachedResponse(event.request, cachedResponse)) {
      await cache.delete(event.request, { ignoreSearch: true });
    }

    try {
      const response = await fetch(event.request);
      if (shouldCacheNetworkResponse(event.request, response)) {
        cache.put(event.request, response.clone());
      }

      return response;
    } catch (error) {
      if (cachedResponse && isValidCachedResponse(event.request, cachedResponse)) {
        return cachedResponse;
      }

      throw error;
    }
  })());
});
