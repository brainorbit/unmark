/* Unmark service worker: offline app shell + cached CDN libraries.
   Bump VERSION on every deploy so installed apps pick up changes. */
const VERSION = 'unmark-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    await Promise.all(CDN.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // page loads: network first, cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put('index.html', res.clone());
        return res;
      } catch (_) {
        return (await caches.match('index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // same-origin files: cache first, refresh in background
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const fresh = fetch(req).then(async res => {
        if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })());
    return;
  }

  // CDN libraries and fonts: cache first, store on first use
  if (/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.host)) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') (await caches.open(VERSION)).put(req, res.clone());
        return res;
      } catch (_) {
        return Response.error();
      }
    })());
  }
});
