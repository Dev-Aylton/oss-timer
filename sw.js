const CACHE_NAME = "oss-timer-v0.9.34";
const PRECACHE = [
  "index.html",
  "style.css",
  "timer-engine.js",
  "app-ui.js",
  "audio.js",
  "voice.js",
  "storage.js",
  "app.js",
  "fonts/BebasNeue-Regular.ttf",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.png",
  "icons/icon-a.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return cache.addAll(PRECACHE);
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf("oss-timer-") === 0 && key !== CACHE_NAME;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url;
  try {
    url = new URL(event.request.url);
  } catch (erro) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(caches.match(event.request).then(function (cached) {
    if (cached) return cached;
    return fetch(event.request).then(function (response) {
      if (response && response.ok && (response.type === "basic" || response.type === "default")) {
        var copia = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copia);
        });
      }
      return response;
    }).catch(function () {
      if (event.request.mode === "navigate") {
        return caches.match("index.html");
      }
      return new Response("", { status: 503, statusText: "Offline" });
    });
  }));
});
