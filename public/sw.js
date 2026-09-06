// Bump CACHE_VERSION (e.g. v1 -> v2) whenever the offline SHELL list or the
// navigation-fallback mapping below changes. Old caches are purged on activate.
const CACHE_VERSION = "v3";
const CACHE = "peoplenexa-" + CACHE_VERSION;
const SHELL = ["/", "/login", "/admin", "/superadmin/login", "/employee", "/employee/attendance", "/employee/leaves", "/employee/payslips", "/employee/profile"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache each shell URL independently: authed routes (e.g. /admin)
      // 307-redirect when logged out, and a single addAll() rejection would
      // leave the whole cache empty (→ undefined fallbacks → SW crash).
      Promise.allSettled(
        SHELL.map((u) =>
          fetch(new Request(u, { credentials: "same-origin" })).then((res) => {
            if (res.ok) return cache.put(u, res);
            return Promise.reject(new Error(`skip ${u}: ${res.status}`));
          })
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API traffic: auth/session + payroll/cashbook data must always
  // hit the network (stale-while-revalidate on /api risks stale money data).
  if (url.pathname.startsWith("/api")) return;

  // Navigations: network-first, fall back to last cached copy (offline shell).
  // The chain MUST always resolve a Response — resolving undefined crashes
  // the FetchEvent ("Failed to convert value to 'Response'").
  const offlinePage = () =>
    new Response(
      "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline — PeopleNexa</title></head><body style='font-family:system-ui,sans-serif;padding:2rem;text-align:center'><h1>You are offline</h1><p>Reconnect and try again.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache usable pages (skip redirects/errors so a login
          // redirect never poisons the offline shell).
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) =>
              cached ||
              (url.pathname.startsWith("/superadmin")
                ? caches
                    .match("/superadmin/login")
                    .then((s) => s || caches.match("/").then((r) => r || offlinePage()))
                : url.pathname.startsWith("/admin")
                  ? caches
                      .match("/admin")
                      .then((a) => a || caches.match("/").then((r) => r || offlinePage()))
                  : caches.match("/employee").then((e) => e || caches.match("/").then((r) => r || offlinePage())))
          )
        )
    );
    return;
  }

  // Static assets & API reads: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
