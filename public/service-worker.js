const CACHE_PREFIX = `calendrier:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}0.1.0-rc.2`;
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
].map((path) => new URL(path, self.registration.scope).href);

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.includes('/api/') || !url.href.startsWith(self.registration.scope) ||
      !['document', 'script', 'style', 'font', 'image', 'manifest'].includes(event.request.destination)) {
    return;
  }
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(event.request))
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          (response) => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            event.waitUntil(caches.open(CACHE_NAME)
               .then((cache) => {
                return cache.put(event.request, responseToCache);
              }));

            return response;
          }
        );
      })
  );
});
