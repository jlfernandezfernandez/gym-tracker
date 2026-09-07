const PRECACHE = self.__PRECACHE || ["/", "https://telegram.org/js/telegram-web-app.js"];
const CACHE = self.__CACHE || "gym-shell-dev";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("gym-shell-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && (url.pathname === "/api" || url.pathname.startsWith("/api/"))) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match("/"))));
    return;
  }

  const cacheKey = url.origin === self.location.origin ? url.pathname : url.href;
  if (PRECACHE.includes(cacheKey)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(hit => hit || fetch(request)));
  }
});
