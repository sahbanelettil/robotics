// Simple app-shell cache for /robotics/
const CACHE = "robotics-app-v1";
const APP_SHELL = [
  "/robotics/",
  "/robotics/index.html",
  "/robotics/manifest.webmanifest",
  "/robotics/sw.js",
  "/robotics/icons/icon-192.png",
  "/robotics/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only cache same-origin requests
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request))
    );
  }
});
