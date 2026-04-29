const CACHE_NAME = 'causehealth-v5-safe-fallback';

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

// Always-return-a-Response helper. caches.match() resolves to undefined on miss,
// and passing undefined to respondWith() throws "Failed to convert value to
// 'Response'", which crashes the page load. Friend's iPhone hit this on first
// visit (empty cache + flaky cell network).
async function safeNetworkFirst(request, navFallback) {
  try {
    const response = await fetch(request);
    // Only cache certain types
    if (response.ok && (request.mode === 'navigate' ||
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'font')) {
      try {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      } catch (_) { /* cache full / opaque — ignore */ }
    }
    return response;
  } catch (_) {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;
    if (navFallback) {
      const fallback = await caches.match(navFallback);
      if (fallback) return fallback;
    }
    // Last resort — never return undefined to respondWith()
    return new Response(
      'Network error and no cached copy available. Refresh to retry.',
      { status: 503, statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' } }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET (POST/PUT can't be cached anyway, just let them passthrough)
  if (request.method !== 'GET') return;

  // Skip cross-origin requests entirely — Supabase, Anthropic, Stripe, etc.
  // The SW shouldn't intercept third-party APIs. Letting them passthrough
  // also fixes the missing-apikey errors on Supabase REST calls.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(safeNetworkFirst(request, '/index.html'));
    return;
  }

  event.respondWith(safeNetworkFirst(request, null));
});
