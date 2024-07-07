self.addEventListener('install', function(event) {
    event.waitUntil(
      caches.open('dyslibria-cache-v1').then(function(cache) {
        return cache.addAll([
          '/',
          '/public/login.html',
          '/public/styles.css',
          '/public/icons/icon-192x192.png',
          '/public/icons/icon-512x512.png'
        ]);
      })
    );
  });
  
  self.addEventListener('fetch', function(event) {
    event.respondWith(
      caches.match(event.request).then(function(response) {
        return response || fetch(event.request);
      })
    );
  });
  