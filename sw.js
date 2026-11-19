/* PWA autosuficiente: rutas relativas para funcionar en cualquier repositorio. */
const VERSION = 'tareas-estatica-1.2.0';
const ROOT = new URL('./', self.registration.scope);
const OFFLINE_FILES = [
  './', './index.html', './app.js', './domain.js', './storage.js',
  './styles.css', './manifest.webmanifest', './favicon.svg',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(OFFLINE_FILES.map(path => new URL(path, ROOT)))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tareas-estatica-') && k !== VERSION).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const reqUrl = new URL(event.request.url);
  if (!reqUrl.pathname.startsWith(ROOT.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(new URL('./index.html', ROOT), copy)); }
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match(new URL('./index.html', ROOT)))));
  } else {
    // Preferir la versión publicada cuando hay red; usar caché solo sin conexión.
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy=response.clone(); caches.open(VERSION).then(cache=>cache.put(event.request,copy)); }
      return response;
    }).catch(async () => (await caches.match(event.request)) || Response.error()));
  }
});
