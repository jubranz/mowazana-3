const CACHE_NAME = "muwazana-assets-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isSafeAsset =
    event.request.method === "GET" &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/icon" ||
      url.pathname === "/apple-icon");

  if (!isSafeAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }),
  );
});
