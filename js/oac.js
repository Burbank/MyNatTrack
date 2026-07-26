/**
 * NAT Oceanic Area Control (OAC) + adjacent domestic FIRs for chart overlay.
 * OAC limits: ICAO NAT eANP Vol I. OTAs: AIP / NAT manuals / TC AIM (simplified).
 * Labels use CPDLC / FIR location indicators (four-letter codes) only.
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

/**
 * Oceanic Transition Areas (closed rings) — AIP / NAT Doc limits (simplified for chart).
 * SOTA / NOTA: AIP Ireland ENR 2.2 · BOTA: NAT ops manuals · GOTA: TC AIM (simplified).
 */
export const OTA_AREAS = [
  {
    id: "SOTA",
    label: { lat: 49.75, lon: -11.5 },
    ring: densifyPath(
      [
        { lat: 51, lon: -15 },
        { lat: 51, lon: -8 },
        { lat: 48.5, lon: -8 },
        { lat: 49, lon: -15 },
        { lat: 51, lon: -15 },
      ],
      0.35
    ),
  },
  {
    id: "NOTA",
    label: { lat: 55.5, lon: -12.5 },
    ring: densifyPath(
      [
        { lat: 54, lon: -15 },
        { lat: 57, lon: -15 },
        { lat: 57, lon: -10 },
        { lat: 54.5667, lon: -10 }, // 5434N
        { lat: 54, lon: -15 },
      ],
      0.35
    ),
  },
  {
    id: "BOTA",
    label: { lat: 46.7, lon: -8.35 },
    ring: densifyPath(
      [
        { lat: 48.5667, lon: -8.75 }, // 4834N 00845W
        { lat: 48.5, lon: -8 },
        { lat: 45, lon: -8 },
        { lat: 45, lon: -8.75 },
        { lat: 48.5667, lon: -8.75 },
      ],
      0.3
    ),
  },
  {
    // Simplified GOTA footprint (TC AIM): 6530N060W → Reykjavik boundary →
    // 6330N055W → south along 055W toward domestic FIR.
    id: "GOTA",
    label: { lat: 58, lon: -57 },
    ring: densifyPath(
      [
        { lat: 65.5, lon: -60 },
        { lat: 65.5, lon: -55 },
        { lat: 63.5, lon: -55 },
        { lat: 50, lon: -55 },
        { lat: 50, lon: -60 },
        { lat: 65.5, lon: -60 },
      ],
      0.5
    ),
  },
];

/**
 * Simplified domestic / oceanic interface segments (landfall side).
 * Drawn lighter than OAC FIR lines so oceanic structure stays primary.
 */
export const DOMESTIC_FIR_SEGMENTS = [
  // EISN ↔ EGGX — 015°W (SOTA / NOTA oceanic entry)
  alongLon(-15, 49, 57),
  // EGPX ↔ EGGX — 010°W (north of NOTA to Reykjavik boundary)
  alongLon(-10, 54.5667, 61),
  // LFRR / EISN ↔ EGGX — 008°W (BOTA / SOTA east edge)
  alongLon(-8, 45, 54.5667),
  // LECM / LPPC ↔ EGGX–LPPO corner — 008°W south of 45N stub
  alongLon(-8, 42, 45),
  // LPPC ↔ LPPO — ~013°W (Santa Maria east)
  alongLon(-13, 39, 45),
  // CZQM / CZQX domestic interface — ~055°W Labrador / NL approaches
  alongLon(-55, 45, 55),
  // KZNY / KZBW ↔ KZWY — ~067°W approximate western oceanic / domestic join
  densifyPath(
    [
      { lat: 38, lon: -67 },
      { lat: 42, lon: -67 },
      { lat: 44.5, lon: -67 },
      { lat: 44.5, lon: -60 },
    ],
    0.5
  ),
  // BGGL ↔ CZQX / BIRD — ~040°W Greenland approaches (simplified)
  densifyPath(
    [
      { lat: 58.5, lon: -43 },
      { lat: 63.5, lon: -39 },
      { lat: 65, lon: -40 },
    ],
    0.5
  ),
];

/**
 * Adjacent domestic FIRs — CPDLC / FIR indicators near the oceanic interface
 * (kept close to landfall so they stay in a typical NAT route frame).
 * Oceanic CZQX / KZWY labels remain mid-ocean in OAC_LABELS.
 */
export const DOMESTIC_FIR_LABELS = [
  // UK / Ireland / France / Iberia — west of airport clutter, near 008–015°W
  { code: "EGPX", lat: 56.8, lon: -6.5 }, // Scottish
  { code: "EISN", lat: 52.5, lon: -9.5 }, // Shannon
  { code: "EGTT", lat: 51.4, lon: -4.5 }, // London (western approaches)
  { code: "LFRR", lat: 48.2, lon: -5.0 }, // Brest
  { code: "LECM", lat: 43.2, lon: -7.2 }, // Madrid (NW corner)
  { code: "LPPC", lat: 40.2, lon: -9.5 }, // Lisboa
  // Canada / Greenland / US northeast — near 055–067°W interfaces
  { code: "CZQM", lat: 46.8, lon: -60.5 }, // Moncton
  { code: "CZUL", lat: 48.5, lon: -68.0 }, // Montreal (eastern approaches)
  { code: "BGGL", lat: 63.2, lon: -48.0 }, // Nuuk approaches
  { code: "KZBW", lat: 42.8, lon: -68.5 }, // Boston ARTCC
  { code: "KZNY", lat: 40.5, lon: -71.5 }, // New York ARTCC (domestic; oceanic = KZWY)
];
