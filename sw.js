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

// HOANTUYET_NOTIFICATION_V1: keep the existing offline fetch handler unchanged.
self.addEventListener('push', event => {
  let item = {};
  try { item = event.data ? event.data.json() : {}; }
  catch (_) { item = {body: event.data ? event.data.text() : ''}; }
  const path = typeof item.url === 'string' && item.url.startsWith('/') && !item.url.startsWith('//')
    ? item.url : '/chamcong_v3_cs1.html';
  event.waitUntil(self.registration.showNotification(item.title || 'HOÀN TUYẾT', {
    body: item.body || 'Bạn có thông báo mới',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: item.event_key || undefined,
    data: {url: path}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const raw = event.notification.data;
  const relative = typeof raw === 'string' ? raw : (raw && raw.url) || '/';
  const target = new URL(relative, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(async list => {
    const client = list.find(c => { try {return new URL(c.url).pathname === target.pathname;} catch (_) {return false;} });
    if (client) { await client.focus(); if ('navigate' in client) await client.navigate(target.href); return; }
    if (self.clients.openWindow) return self.clients.openWindow(target.href);
  }));
});
