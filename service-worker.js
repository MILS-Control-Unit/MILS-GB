// MILS Grade Book — service worker
//
// Only job: make the app installable (PWA requirement) and let it still open,
// showing whatever was last loaded, if there's no internet connection.
//
// Strategy: NETWORK-FIRST for everything this app owns (index.html, app.js,
// style.css, manifest, icons). We always try the network first and cache the
// fresh response — so the moment app.js is updated, the very next load picks
// it up. The cache is only a fallback for when the network request fails
// (offline / no connection). This avoids the classic PWA trap where an old
// service worker keeps serving stale app.js forever.
//
// Bump CACHE_NAME whenever you want to force old caches out (not usually
// necessary with network-first, but harmless).
const CACHE_NAME = 'mils-gb-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/style.css',
  './assets/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests for this app's own files. Everything else
  // (Firebase calls, Google Fonts, the xlsx/html2pdf/gsap CDN scripts, etc.)
  // is left completely alone and goes straight to the network as normal —
  // we never want to intercept live data sync or third-party scripts.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
