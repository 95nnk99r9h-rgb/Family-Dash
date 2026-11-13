// Service Worker: App-Shell offline verfügbar machen.
const VERSION = 'fd-v1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/css/app.css',
  '/js/app.js', '/js/api.js', '/js/bg.js', '/js/icons.js', '/js/ui.js', '/js/util.js', '/js/weather.js',
  '/js/views/home.js', '/js/views/calendar.js', '/js/views/weather.js', '/js/views/todo.js',
  '/js/views/meals.js', '/js/views/shopping.js', '/js/views/settings.js', '/js/views/shared.js',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Seitenaufrufe: Netzwerk zuerst, sonst App-Shell aus dem Cache
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // Statische Dateien: aus dem Cache, im Hintergrund aktualisieren
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
