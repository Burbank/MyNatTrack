/* MyNatTrack service worker — network-first with cache fallback (offline after first load). */
const CACHE = "mynattrack-v2.6.0-20260728";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/geodesy.js",
  "./js/parser.js",
  "./js/airways.js",
  "./js/aimOeps.js",
  "./js/magvar.js",
  "./js/chart.js",
  "./js/weather.js",
  "./js/oac.js",
  "./js/diversionAirports.js",
  "./js/airports747.js",
  "./js/airportShortNames.js",
  "./js/airportIata.js",
  "./js/natTracks.js",
  "./data/waypoints.json",
  "./data/watrs-airways.json",
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
    caches
      .open(CACHE)
      .then((cache) =>
        // cache: 'reload' bypasses any older controlling SW so precache is not stale
        cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))
      )
      .then(() => self.skipWaiting())
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
  // Always hit network for live APIs (never serve a stale proxy response from SW)
  if (
    url.pathname.includes("/api/nat-tracks") ||
    url.pathname.includes("/api/weather-major")
  ) {
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

  // Network-first so JS/CSS updates are not stuck behind an old cache-first SW.
  // Falls back to cache when offline (airplane mode after a prior visit).
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
