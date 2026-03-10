// ScoGene Service Worker — PWA インストール用（最小構成）
const CACHE_NAME = "scogene-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // API・SSE・POST はキャッシュしない
  if (
    request.method !== "GET" ||
    request.url.includes("/api/") ||
    request.url.includes("/stream")
  ) {
    return;
  }
  // 静的アセットのみ Cache First
  if (request.url.includes("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
  }
});
