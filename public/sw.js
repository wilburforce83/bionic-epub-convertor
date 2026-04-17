self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil((async function() {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(function(cacheName) { return cacheName.indexOf('dyslibria-cache') === 0; })
        .map(function(cacheName) { return caches.delete(cacheName); })
    );

    await self.registration.unregister();

    const clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.map(function(client) {
      return client.navigate(client.url);
    }));
  })());
});
  
