// sw.js
const CACHE_NAME = 'banle-offline-v1';
const URLS_TO_CACHE = [
  '/',
  '/banlemt.html',
  '/luuhoadon.js',
  '/scripts/loginWrapper.js',
  '/scripts/viettelInvoice.js',
  // ✅ Tạm thời bỏ '/offline.js' nếu bạn chưa có file thật
  // '/offline.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      const promises = URLS_TO_CACHE.map(async url => {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response.clone());
          } else {
            console.warn(`⚠️ Không thể cache file: ${url} (status ${response.status})`);
          }
        } catch (err) {
          console.warn(`⚠️ Lỗi khi fetch file: ${url}`, err);
        }
      });
      return Promise.all(promises);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
