// sw.js
const CACHE_NAME = 'banle-offline-v3';
const URLS_TO_CACHE = [
  '/',
  '/banlemt1.1.html',
  '/scripts/main.js',
  '/scripts/index.js',
  '/scripts/supabaseClient.js',
  '/style.css',
  '/favicon.ico',
  '/chamcongcs1.html',
  '/scripts/chamcong.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
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

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: "Thông báo",
      body: event.data ? event.data.text() : ""
    };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Thông báo", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data.url || "/chamcongcs1.html"
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const url = event.notification.data || "/chamcongcs1.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
