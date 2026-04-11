const CACHE_NAME = 'causehealth-v2';

// Install — skip waiting to activate immediately
self.addEventListener('install', (event) => {
  // Clear all old caches on install so new code loads immediately
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.skipWaiting();
});

// Activate — claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — NETWORK FIRST for everything
// Vite already content-hashes JS/CSS filenames, so browser cache handles assets.
// The service worker should never serve stale JS — that blocks deployed fixes.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Navigation requests — network first, fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else — network first, cache fallback for offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache successful responses for offline fallback
        if (response.ok && (request.destination === 'script' || request.destination === 'style')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
