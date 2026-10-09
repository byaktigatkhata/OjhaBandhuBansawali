/* ============================================================
   Ojha Bandhu Bansawali — Service Worker
   ------------------------------------------------------------
   Strategy:
     • HTML (navigation)      → network-first, fallback cache
     • JS / CSS / JSON        → network-first, fallback cache
     • Images / fonts / icons → cache-first (stale-while-revalidate)
     • Cross-origin requests  → pass through (Supabase, Facebook, etc.)
   ------------------------------------------------------------
   IMPORTANT: Bump CACHE_VERSION on every deployment so the
   browser installs a fresh service worker and purges stale files.
   ============================================================ */

const CACHE_VERSION = 'ojha-v3';                 // ← bump each deploy
const SHELL_CACHE    = `${CACHE_VERSION}-shell`;
const ASSET_CACHE    = `${CACHE_VERSION}-assets`;
const OFFLINE_URL    = '/OjhaBandhuBansawali/offline.html';

// App shell — must be fetchable for offline use.
// Paths use the /OjhaBandhuBansawali/ prefix (GitHub Pages subfolder).
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

// Files that must ALWAYS be checked against the network first.
// If they're fresh from the server, cache is updated automatically.
const NETWORK_FIRST_PATTERNS = [
  /\/OjhaBandhuBansawali\/(index\.html|offline\.html)$/,
  /\/OjhaBandhuBansawali\/[^/]+\.(js|css|json)$/,
  /\/OjhaBandhuBansawali\/$/,
  /\/OjhaBandhuBansawali\/[^/]+\/$/   // subpage folders like /SearchPage/
];

// ------------------------------------------------------------
// Install — pre-cache the shell and skip waiting immediately
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);

      // add() per file so one missing asset doesn't fail the install
      await Promise.all(
        SHELL_FILES.map((url) =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch((err) => console.warn('[SW] Could not cache:', url, err))
        )
      );

      // Activate the new SW without waiting for tabs to close
      await self.skipWaiting();
    })()
  );
});

// ------------------------------------------------------------
// Activate — purge old caches and take control of open pages
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) =>
            key.startsWith('ojha-') &&
            key !== SHELL_CACHE &&
            key !== ASSET_CACHE
          )
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );

      // Claim existing clients so the new SW is in charge right away
      await self.clients.claim();

      // Tell every open tab to reload with the new SW
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) =>
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
      );
    })()
  );
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html')
  );
}

function matchesNetworkFirst(url) {
  const path = url.pathname;
  return NETWORK_FIRST_PATTERNS.some((re) => re.test(path));
}

function isAsset(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|eot)$/i.test(url.pathname);
}

// Network-first strategy: try network, cache the fresh copy, fall
// back to cache if offline. Guarantees updates are seen promptly.
async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Cache-first strategy: serve cached, then fetch + store in the
// background so the next visit sees the latest version.
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    // Revalidate in the background (stale-while-revalidate)
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
        }
      })
      .catch(() => { /* ignore offline errors */ });
    return cached;
  }

  // Not in cache — fetch and store
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

// ------------------------------------------------------------
// Fetch — route requests to the right strategy
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET — everything else goes to the network
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Supabase, jsDelivr, Facebook, YouTube…) — untouched
  if (!isSameOrigin(url)) return;

  // 1. Navigation / HTML — network-first, fallback to shell + offline
  if (isNavigationRequest(request)) {
    event.respondWith(
      networkFirst(request, SHELL_CACHE, OFFLINE_URL)
    );
    return;
  }

  // 2. JS / CSS / JSON that affects app behavior — network-first
  if (matchesNetworkFirst(url)) {
    event.respondWith(
      networkFirst(request, SHELL_CACHE)
    );
    return;
  }

  // 3. Images, fonts, icons — cache-first with background revalidate
  if (isAsset(url)) {
    event.respondWith(
      cacheFirst(request, ASSET_CACHE)
    );
    return;
  }

  // 4. Anything else same-origin — network-first with cache fallback
  event.respondWith(
    networkFirst(request, SHELL_CACHE)
  );
});

// ------------------------------------------------------------
// Message — allows the page to trigger an immediate update
// ------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});