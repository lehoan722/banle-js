// sw.js
const CACHE_NAME = 'banle-offline-v1';
const URLS_TO_CACHE = [
  '/',
  '/banlemt1.1.html',
  '/scripts/main.js',
  '/scripts/index.js',
  '/scripts/supabaseClient.js',
  '/style.css',
  '/favicon.ico',
  // Thêm file offline nếu có: '/offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      const promises = URLS_TO_CACHE.map(async url => {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (response.ok) {
            await cache.put(url, response.clone());
          } else {
            console.warn('❌ Không thể cache:', url);
          }
        } catch (err) {
          console.error('⚠️ Lỗi khi tải:', url, err);
        }
      });
      await Promise.all(promises);
    })
  );
});

// Fetch handler với fallback nếu fetch lỗi
self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request).catch(err => {
        console.warn("⚠️ Lỗi fetch:", event.request.url, err);
        // Trả về response rỗng tránh lỗi
        return new Response('', {
          status: 408,
          statusText: 'Offline fallback'
        });
      });
    })
  );
});
