// Bump CACHE_VERSION (e.g. v1 -> v2) whenever the offline SHELL list or the
// navigation-fallback mapping below changes. Old caches are purged on activate.
const CACHE_VERSION = "v4";
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
  // Fully async with a catch at EVERY level: a FetchEvent must never reject
  // ("Failed to convert value to 'Response'"). Failures are logged so the
  // underlying cause (abort, offline, cache error) is visible in console.
  const offlinePage = () =>
    new Response(
      "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline — PeopleNexa</title></head><body style='font-family:system-ui,sans-serif;padding:2rem;text-align:center'><h1>You are offline</h1><p>Reconnect and try again.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  const shellFor = (pathname) =>
    pathname.startsWith("/superadmin") ? "/superadmin/login" : pathname.startsWith("/admin") ? "/admin" : "/employee";
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Only cache usable pages (skip redirects/errors so a login
          // redirect never poisons the offline shell).
          if (res.ok) {
            try {
              const cache = await caches.open(CACHE);
              await cache.put(req, res.clone());
            } catch (_) {}
          }
          return res;
        } catch (err) {
          console.error("[sw] nav fetch failed:", url.pathname, String(err && err.message ? err.message : err));
          try {
            const hit = await caches.match(req);
            if (hit) return hit;
            return (await caches.match(shellFor(url.pathname))) || (await caches.match("/")) || offlinePage();
          } catch (err2) {
            console.error("[sw] nav fallback failed:", String(err2 && err2.message ? err2.message : err2));
            return offlinePage();
          }
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate, never rejects.
  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(req).catch(() => undefined);
        try {
          const res = await fetch(req);
          if (res.ok) {
            try {
              const cache = await caches.open(CACHE);
              await cache.put(req, res.clone());
            } catch (_) {}
          }
          return res;
        } catch (err) {
          if (cached) return cached;
          // Documents get the offline shell; subresources rethrow as a clean
          // network error (a wrong-MIME fallback would break parsing worse).
          if (req.destination === "document") return offlinePage();
          throw err;
        }
      } catch (err) {
        console.error("[sw] asset fetch failed:", url.pathname, String(err && err.message ? err.message : err));
        if (req.destination === "document") return offlinePage();
        return new Response("", { status: 504, statusText: "Gateway Timeout" });
      }
    })()
  );
});
