const CACHE_NAME = 'studentcheck-cache-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/registration.html',
  '/studentHomepage.html',
  '/studentLogin.html',
  '/teacherHomepage.html',
  '/teacherLogin.html',
  '/css/shared.css',
  '/css/index.css',
  '/css/registration.css',
  '/css/studentHomepage.css',
  '/css/studentLogin.css',
  '/css/teacherHomepage.css',
  '/css/teacherLogin.css',
  '/javascript/db.js',
  '/javascript/shared.js',
  '/javascript/index.js',
  '/javascript/registration.js',
  '/javascript/studentHomepage.js',
  '/javascript/studentLogin.js',
  '/javascript/teacherHomepage.js',
  '/javascript/teacherLogin.js',
  '/images/new_main_logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only handle same-origin requests for assets with cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return res;
        }).catch(() => {
          // Optional: fallback logic for navigations
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
    );
    return;
  }
  // For API calls (likely cross-origin), use network-first with fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
