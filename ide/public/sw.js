/* Juni IDE — minimal service worker for Android/Chrome PWA installability. */
const CACHE = "juni-shell-v1";

self.addEventListener("install", (event) => {
  const base = self.registration.scope;
  const precache = [
    base,
    `${base}index.html`,
    `${base}manifest.webmanifest`,
    `${base}icons/icon-192.png`,
    `${base}icons/icon-512.png`,
  ];
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(precache))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const base = self.registration.scope;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (
          res.ok &&
          (url.href === base ||
            url.pathname.endsWith("/index.html") ||
            url.pathname.endsWith(".html") ||
            url.pathname.includes("/icons/"))
        ) {
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match(`${base}index.html`)),
      ),
  );
});
