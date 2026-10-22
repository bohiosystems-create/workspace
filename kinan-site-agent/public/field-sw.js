// Keeps the field app on the phone for when there is no signal (app/field). Only the field page and the app's own
// built files are kept; the data is not — the page keeps its own copy of the day and an outbox of changes
// (app/field/outbox.ts), and /api requests always go to the network.
const CACHE = "kinan-field-v1";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add("/field")).catch(() => undefined)); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("kinan-field-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the field page: the network first (always fresh), the kept copy with no signal
  if (req.mode === "navigate" && url.pathname === "/field") {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("/field", copy)); } return r; }).catch(() => caches.match("/field").then((r) => r || Response.error())));
    return;
  }
  // built files never change under the same name: the kept copy first
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
  }
});
