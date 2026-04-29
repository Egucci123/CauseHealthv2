// Minimal pass-through SW. We previously cached + intercepted fetches, which
// was the root cause of every "first attempt fails, refresh works" bug —
// stale SW versions intercepted Supabase calls, dropped headers, and broke
// large payloads (PDF uploads, edge function invokes).
//
// New behavior: install instantly, claim all clients, delete every cache,
// DO NOT intercept any fetches. Browser handles all requests directly with
// its own cache. Vite already content-hashes JS/CSS so caching is solved.
//
// This file exists only so the registration in index.html / main.tsx
// doesn't 404 and so any old broken SW gets replaced.

const VERSION = 'causehealth-noop-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Intentionally NO fetch handler. Every request goes straight to the network,
// nothing intercepted, nothing cached. This is the only reliable behavior.
