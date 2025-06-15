// sw.js
const CACHE_NAME = 'banle-offline-v1';
const URLS_TO_CACHE = [
  '/',
  '/banlemt.html',
  '/offline.js',
  '/luuhoadon.js',
  '/scripts/loginWrapper.js',
  '/scripts/viettelInvoice.js',
  // Các file tĩnh khác: ảnh, CSS, JS bạn dùng
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request)
    )
  );
});
