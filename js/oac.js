/**
 * NAT Oceanic Area Control (OAC) shared boundaries for chart overlay.
 * Coordinates from ICAO NAT eANP Vol I (Doc 9634) FIR tables — stable lateral limits.
 * Labels use CPDLC / FIR location indicators only (no long names).
 */

function alongLat(lat, lonA, lonB, step = 0.5) {
  const lo = Math.min(lonA, lonB);
  const hi = Math.max(lonA, lonB);
  const pts = [];
  for (let lon = lo; lon <= hi + 1e-9; lon += step) {
    pts.push({ lat, lon: Math.round(lon * 1000) / 1000 });
  }
  if (pts.length && pts[pts.length - 1].lon !== hi) pts.push({ lat, lon: hi });
  return lonA > lonB ? pts.reverse() : pts;
}

function alongLon(lon, latA, latB, step = 0.5) {
  const lo = Math.min(latA, latB);
  const hi = Math.max(latA, latB);
  const pts = [];
  for (let lat = lo; lat <= hi + 1e-9; lat += step) {
    pts.push({ lat: Math.round(lat * 1000) / 1000, lon });
  }
  if (pts.length && pts[pts.length - 1].lat !== hi) pts.push({ lat: hi, lon });
  return latA > latB ? pts.reverse() : pts;
}

function densifyPath(corners, stepDeg = 0.75) {
  if (!corners || corners.length < 2) return corners || [];
  const out = [{ ...corners[0] }];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1];
    const b = corners[i];
    const dLat = b.lat - a.lat;
    const dLon = b.lon - a.lon;
    const dist = Math.hypot(dLat, dLon);
    const n = Math.max(1, Math.ceil(dist / stepDeg));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({
        lat: a.lat + dLat * t,
        lon: a.lon + dLon * t,
      });
    }
  }
  return out;
}

/**
 * Shared OAC boundary segments (drawn once as green lines).
 * Focused on mid-Atlantic crossing airspace visible on a typical NAT chart.
 */
export const OAC_SEGMENTS = [
  // CZQX ↔ EGGX — 030°W, 45N–61N
  alongLon(-30, 45, 61),
  // EGGX ↔ BIRD — 61°N, 030°W–000°W
  alongLat(61, -30, 0),
  // BIRD ↔ CZQX — 61N/30W → 63°30N/39W (shared corner)
  densifyPath([
    { lat: 61, lon: -30 },
    { lat: 63.5, lon: -39 },
  ]),
  // EGGX / CZQX ↔ LPPO — 45°N (EGGX to 008°W; LPPO to 040°W)
  alongLat(45, -8, -40),
  // CZQX ↔ KZWY (New York Oceanic East) — 45°N, 040°W–051°W
  alongLat(45, -40, -51),
  // LPPO ↔ KZWY — 040°W, ~22°18N–45N
  alongLon(-40, 22.3, 45),
  // LPPO northern-east stub toward domestic (013°W segment start)
  densifyPath([
    { lat: 45, lon: -13 },
    { lat: 43, lon: -13 },
    { lat: 42, lon: -15 },
  ]),
];

/** Region codes placed inside each OAC near shared boundaries. */
export const OAC_LABELS = [
  { code: "CZQX", lat: 53, lon: -33 },
  { code: "EGGX", lat: 53, lon: -22 },
  { code: "LPPO", lat: 42, lon: -25 },
  { code: "BIRD", lat: 63.5, lon: -18 },
  { code: "KZWY", lat: 42, lon: -46 },
  { code: "ENOB", lat: 70, lon: 5 },
];
