/* StipendTracker offline support: keeps a copy of the app on the device. */
var CACHE = 'stipendtracker-v11';
var FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/styles.css',
  'js/i18n.js', 'js/store.js', 'js/bankimport.js', 'js/app.js',
  'js/vendor/pdf.min.js', 'js/vendor/pdf.worker.min.js',
  'fonts/Montserrat.ttf',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Show the saved copy right away, and quietly fetch a fresh one for next time.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (cached) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () { return cached; });
      return cached || fresh;
    });
  }));
});
