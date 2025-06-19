const CACHE_NAME = 'banle-offline-v1';
const URLS_TO_CACHE = [
  '/',
  '/banlemt1.1.html',
  '/luuhoadon.js',
  '/scripts/loginWrapper.js',
  '/scripts/viettelInvoice.js',
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
            console.warn("❌ Không cache được (response not ok):", url);
          }
        } catch (err) {
          console.warn("❌ Lỗi khi cache:", url, err);
        }
      });
      await Promise.all(promises);
    })
  );
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request);
    })
  );
});
