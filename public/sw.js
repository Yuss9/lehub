const CACHE = "lehub-public-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const response = await fetch("/offline");
      const html = await response.clone().text();
      await cache.put("/offline", response);
      const assets = [
        ...new Set(html.match(/\/_next\/static\/[^"\s<>]+\.(?:js|css)/g) || []),
      ];
      await cache.addAll(["/icon.svg", "/manifest.webmanifest", ...assets]);
    }),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  const publicAsset =
    url.pathname === "/offline" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/_next/static/");
  if (publicAsset) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match("/offline")) || Response.error(),
      ),
    );
  }
  // Authenticated HTML, APIs and files are always network-only.
});
