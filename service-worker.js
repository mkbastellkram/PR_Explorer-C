/* PR Explorer · Claude V1.8 · Service Worker */
const CACHE = 'pr-explorer-claude-v1-8';
const ASSETS = [
  './', './index.html',
  './style-claude-v1.8.css',
  './app-claude-v1.8.js',
  './pr-data.js',
  './manifest.webmanifest',
  './icon-180.png', './icon-192.png', './icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
