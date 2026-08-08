/* MyNatTrack service worker — cache-first shell (offline-friendly), silent update when online. */
const CACHE = "mynattrack-v2.6.9-20260808";

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
  "./js/solar.js",
  "./js/weather.js",
  "./js/oac.js",
  "./js/diversionAirports.js",
  "./js/airports747.js",
  "./js/airportShortNames.js",
  "./js/airportIata.js",
  "./js/datisAirports.js",
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

function isLiveApi(pathname) {
  return (
    pathname.includes("/api/nat-tracks") ||
    pathname.includes("/api/weather-major")
  );
}

/** Fetch and refresh cache; never throws to the page. */
function networkUpdate(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => null);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Live APIs: network only (JSON error if offline — app already handles silently)
  if (isLiveApi(url.pathname)) {
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

  // App shell / static: cache-first so iPad offline open never hits Safari’s
  // “offline” interstitial. When online, refresh the cache in the background.
  const cacheKey =
    request.mode === "navigate" ? "./index.html" : request;

  event.respondWith(
    caches.match(cacheKey).then((cached) => {
      const online =
        typeof self.navigator === "undefined" ||
        self.navigator.onLine !== false;

      if (cached) {
        if (online) {
          event.waitUntil(networkUpdate(request.mode === "navigate" ? request : request));
        }
        return cached;
      }

      // First visit / missing asset: try network, else fall back to shell
      return networkUpdate(request).then(
        (response) =>
          response ||
          caches.match("./index.html").then(
            (shell) =>
              shell ||
              new Response("MyNatTrack offline — open once while online to cache.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              })
          )
      );
    })
  );
});
