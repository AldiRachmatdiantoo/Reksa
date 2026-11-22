/*
 * Service worker REKSA (F2, offline-first). Dibangun oleh plugin `reksa-service-worker` di vite.config.ts:
 * versi build dan daftar file diisi saat build, jadi file ini bukan kode aplikasi yang di-import.
 *
 * - Halaman: jaringan dulu, cadangannya index.html dari cache saat offline.
 * - /assets/: cache dulu (nama file memuat hash, isinya tidak pernah berubah).
 * - /api/: tidak pernah disentuh. Datanya pribadi dan auth memakai cookie HttpOnly.
 */
const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const SHELL = `reksa-shell-${BUILD}`;
const RUNTIME = 'reksa-runtime';
const RUNTIME_MAX_ENTRIES = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/index.html', ...PRECACHE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('reksa-shell-') && key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => offlineShell()));
    return;
  }
  if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request));
});

async function offlineShell() {
  const cached = await caches.match('/index.html', { cacheName: SHELL });
  return cached ?? Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(RUNTIME);
    await cache.put(request, response.clone());
    await trimRuntime(cache);
  }
  return response;
}

async function trimRuntime(cache) {
  const keys = await cache.keys();
  const extra = keys.length - RUNTIME_MAX_ENTRIES;
  for (const key of keys.slice(0, Math.max(0, extra))) await cache.delete(key);
}
