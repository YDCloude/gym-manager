/* Service worker: makes the app installable and usable offline in the gym.
   - App files: network first (fresh when online, cached when the signal is bad or gone).
   - Exercise images/GIFs: cache first, saved the first time they are seen. */
const VERSION = 'v1';
const SHELL_CACHE = 'gm-shell-' + VERSION;
const MEDIA_CACHE = 'gm-media-v1'; // also written by the Settings "save images offline" button
const NETWORK_TIMEOUT_MS = 3000;

const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest',
  'css/styles.css', 'data/exercises.js',
  'js/util.js', 'js/store.js', 'js/catalog.js', 'js/ui.js', 'js/charts.js', 'js/app.js',
  'js/views/today.js', 'js/views/workout.js', 'js/views/plan.js', 'js/views/library.js',
  'js/views/history.js', 'js/views/progress.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

const isMedia = (url) => /\/(images|videos)\//.test(url.pathname) && /\.(jpe?g|png|gif|webp)$/i.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isMedia(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  // Opaque (no-cors) responses are not cached: they would count ~7 MB each against the storage quota.
  if (res.ok && res.type !== 'opaque') cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return fetch(req); // let the browser report the real failure
  }
}
