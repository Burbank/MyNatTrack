/* MyNatTrack service worker — cache-first for full offline use after install. */
const CACHE = "mynattrack-v31-20260726-tagline";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/geodesy.js",
  "./js/parser.js",
  "./js/magvar.js",
  "./js/chart.js",
  "./js/oac.js",
  "./js/diversionAirports.js",
  "./js/natTracks.js",
  "./data/waypoints.json",
  "./data/land-110m.json",
  "./docs/NAT_HLA_Waypoints_Reference.md",
  "./docs/MNPS_Route_Verification_Flowchart.md",
  "./icons/favicon-16.png",
  "./icons/favicon-32.png",
  "./icons/favicon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Always hit network for NAT track API (never serve a stale proxy response from SW)
  if (url.pathname.endsWith("/api/nat-tracks") || url.pathname.includes("/api/nat-tracks")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
