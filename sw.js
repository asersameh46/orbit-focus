const CACHE_NAME = "orbit-focus-v2";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=2",
  "./theme-mode.css?v=2",
  "./theme-mode.js",
  "./sounds.js",
  "./ai-coach.js",
  "./cloud.js?v=2",
  "./app.js?v=2",
  "./backend-config.js",
  "./assets/orbit-logo.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return cache.addAll(APP_FILES);
  }));
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys
        .filter(function (key) { return key !== CACHE_NAME; })
        .map(function (key) { return caches.delete(key); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then(function (response) {
      if (response && response.status === 200) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
      }
      return response;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        return cached || caches.match("./index.html");
      });
    })
  );
});
