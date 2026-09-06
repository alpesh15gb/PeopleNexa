// Bump CACHE_VERSION (e.g. v1 -> v2) whenever the offline SHELL list or the
// navigation-fallback mapping below changes. Old caches are purged on activate.
const CACHE_VERSION = "v2";
const CACHE = "peoplenexa-" + CACHE_VERSION;
const SHELL = ["/", "/login", "/admin", "/superadmin/login", "/employee", "/employee/attendance", "/employee/leaves", "/employee/payslips", "/employee/profile"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
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
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(req, copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => {
            if (cached) return cached;
            // Role-aware offline shell: an /admin navigation must not fall
            // back to the /employee shell (wrong nav/actions), and vice versa.
            if (url.pathname.startsWith("/superadmin"))
              return caches.match("/superadmin/login").then((s) => s || caches.match("/"));
            if (url.pathname.startsWith("/admin"))
              return caches.match("/admin").then((a) => a || caches.match("/"));
            return caches.match("/employee").then((e) => e || caches.match("/"));
          })
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
