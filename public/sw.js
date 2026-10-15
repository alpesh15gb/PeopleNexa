// v7: ESS assets only. Never persist employee HTML, API responses or selfies.
const CACHE = "peoplenexa-ess-v7";
const ASSETS = ["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("peoplenexa-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => new Response("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>PeopleNexa ESS</title></head><body style='font-family:system-ui;padding:2rem;text-align:center'><h1>You are offline</h1><p>Reconnect to use attendance, leave and payslips.</p><button onclick='location.reload()'>Try again</button></body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }
  if (!ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
});
