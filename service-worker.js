/* ============================================================
   Ojha Bandhu Bansawali — Service Worker
   Strategy: Basic offline — cache the app shell, network-first
   for HTML so updates are seen quickly, cache-first for static
   assets (CSS, JS, images, fonts).
   ============================================================ */

const CACHE_VERSION = 'ojha-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// Files that make up the app shell. These are cached on install.
// Paths use the /OjhaBandhuBansawali/ prefix because the site is
// published at a subfolder on GitHub Pages.
const SHELL_FILES = [
  '/OjhaBandhuBansawali/',
  '/OjhaBandhuBansawali/index.html',
  '/OjhaBandhuBansawali/offline.html',
  '/OjhaBandhuBansawali/manifest.json',
  '/OjhaBandhuBansawali/HomeStyle.css',
  '/OjhaBandhuBansawali/HomeScript.js',
  '/OjhaBandhuBansawali/SupabaseConfig.js',
  '/OjhaBandhuBansawali/DocumentReader.js',
  '/OjhaBandhuBansawali/ojhag.png',
  '/OjhaBandhuBansawali/icon-192.png',
  '/OjhaBandhuBansawali/icon-512.png',
  '/OjhaBandhuBansawali/no_pic.png',
  '/OjhaBandhuBansawali/Sanskrit-Text.ttf'
];

// ------------------------------------------------------------
// Install — pre-cache the shell
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // addAll fails if ANY file is missing. Use add() in a loop
      // so one bad path doesn't break the whole install.
      return Promise.all(
        SHELL_FILES.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ------------------------------------------------------------
// Activate — clean up old caches
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('ojha-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ------------------------------------------------------------
// Fetch — serve from cache or network
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests. POST/PUT/DELETE go straight to network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests. Supabase API, Cloudflare CDN,
  // jsDelivr, etc. all go straight to the network untouched.
  if (url.origin !== self.location.origin) return;

  // ------------------------------------------------------------
  // HTML navigation requests — network-first, fallback to cache,
  // fallback to /offline.html
  // ------------------------------------------------------------
  const isHTML =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Fresh copy — store it
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match('/OjhaBandhuBansawali/offline.html');
          })
        )
    );
    return;
  }

  // ------------------------------------------------------------
  // Static assets (CSS, JS, images, fonts) — cache-first,
  // then network, and store whatever we get.
  // ------------------------------------------------------------
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful, basic responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => {
        // No cached copy, no network. If it's an image, return nothing.
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

// ------------------------------------------------------------
// Message — allows the page to trigger an immediate update
// ------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});