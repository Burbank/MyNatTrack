/**
 * NAT Oceanic Area Control (OAC) + adjacent domestic FIRs for chart overlay.
 * OAC limits: ICAO NAT eANP Vol I. OTAs: AIP / NAT manuals / TC AIM (simplified).
 * Priority: continuous Northern Atlantic OAC rings (EGGX / CZQX / KZWY / LPPO)
 * from published FIR shapes (simplified). Incomplete areas (e.g. TTZP, SBAO,
 * KZMA, Pacific OACs) are CPDLC labels only — no inferred boundary boxes.
 * Labels use CPDLC / FIR location indicators (four-letter codes) where standard;
 * San Juan is labeled by name (no short CPDLC-style ident on this chart).
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

  // BIRD Reykjavik FIR (complete outline)
  densifyPath(
    [
      { lat: 61.0, lon: -4.0 },
      { lat: 61.0, lon: -30.0 },
      { lat: 63.5, lon: -39.0 },
      { lat: 70.0, lon: -20.0 },
      { lat: 73.0, lon: -20.0 },
      { lat: 73.0, lon: 0.0 },
      { lat: 61.0, lon: 0.0 },
      { lat: 61.0, lon: -4.0 },
    ],
    0.55
  ),
  // ENOB Bodø Oceanic FIR
  densifyPath(
    [
      { lat: 82.0, lon: 0.0 },
      { lat: 82.0, lon: 30.0 },
      { lat: 71.0, lon: 30.0 },
      { lat: 71.33, lon: 25.0 },
      { lat: 70.0, lon: 15.0 },
      { lat: 66.38, lon: 7.97 },
      { lat: 63.0, lon: 4.0 },
      { lat: 63.02, lon: 0.0 },
      { lat: 82.0, lon: 0.0 },
    ],
    0.6
  ),

  // —— Continuous NAT OAC rings (simplified published FIR outlines) ——
  // EGGX Shanwick FIR
  densifyPath(
    [
      { lat: 61.0, lon: -30.0 },
      { lat: 61.0, lon: -10.0 },
      { lat: 54.57, lon: -10.0 },
      { lat: 54.0, lon: -15.0 },
      { lat: 51.0, lon: -15.0 },
      { lat: 51.0, lon: -8.0 },
      { lat: 45.0, lon: -8.0 },
      { lat: 45.0, lon: -30.0 },
      { lat: 61.0, lon: -30.0 },
    ],
    0.55
  ),
  // CZQX Gander Oceanic FIR
  densifyPath(
    [
      { lat: 44.94, lon: -51.0 },
      { lat: 46.0, lon: -50.0 },
      { lat: 46.87, lon: -51.0 },
      { lat: 49.67, lon: -51.47 },
      { lat: 53.08, lon: -54.08 },
      { lat: 61.0, lon: -63.0 },
      { lat: 64.0, lon: -63.0 },
      { lat: 65.0, lon: -58.25 },
      { lat: 58.5, lon: -50.0 },
      { lat: 58.5, lon: -41.0 },
      { lat: 63.5, lon: -39.0 },
      { lat: 61.0, lon: -30.0 },
      { lat: 45.0, lon: -30.0 },
      { lat: 44.94, lon: -51.0 },
    ],
    0.55
  ),
  // KZWY New York Oceanic East FIR
  densifyPath(
    [
      { lat: 45.0, lon: -40.0 },
      { lat: 22.3, lon: -40.0 },
      { lat: 18.0, lon: -45.0 },
      { lat: 18.0, lon: -61.5 },
      { lat: 22.0, lon: -64.0 },
      { lat: 21.24, lon: -67.65 },
      { lat: 25.0, lon: -68.49 },
      { lat: 25.0, lon: -73.2 },
      { lat: 27.83, lon: -74.83 },
      { lat: 27.83, lon: -76.26 },
      { lat: 32.25, lon: -77.0 },
      { lat: 35.09, lon: -72.67 },
      { lat: 37.23, lon: -72.67 },
      { lat: 39.0, lon: -67.0 },
      { lat: 41.87, lon: -67.0 },
      { lat: 45.0, lon: -53.0 },
      { lat: 45.0, lon: -40.0 },
    ],
    0.55
  ),
  // LPPO Santa Maria FIR
  densifyPath(
    [
      { lat: 45.0, lon: -20.0 },
      { lat: 45.0, lon: -13.0 },
      { lat: 43.0, lon: -13.0 },
      { lat: 42.0, lon: -15.0 },
      { lat: 36.5, lon: -15.0 },
      { lat: 32.98, lon: -18.4 },
      { lat: 31.68, lon: -17.46 },
      { lat: 30.0, lon: -20.0 },
      { lat: 30.0, lon: -25.0 },
      { lat: 24.0, lon: -25.0 },
      { lat: 17.0, lon: -37.5 },
      { lat: 22.3, lon: -40.0 },
      { lat: 45.01, lon: -40.0 },
      { lat: 45.0, lon: -20.0 },
    ],
    0.55
  ),
  // BGGL Nuuk — NAT-facing outline (arctic pole omitted; continuous with CZQX/BIRD)
  densifyPath(
    [
      { lat: 58.5, lon: -50.0 },
      { lat: 58.5, lon: -41.0 },
      { lat: 63.5, lon: -39.0 },
      { lat: 70.0, lon: -20.0 },
      { lat: 73.0, lon: -20.0 },
      { lat: 73.0, lon: -40.0 },
      { lat: 70.0, lon: -55.0 },
      { lat: 65.0, lon: -58.25 },
      { lat: 58.5, lon: -50.0 },
    ],
    0.55
  ),

  // —— South Atlantic / Canarias / Sal / Dakar (simplified FIR outlines) ——
  // GCCC Canarias FIR
  densifyPath(
    [
      { lat: 27.67, lon: -11.23 },
      { lat: 27.67, lon: -8.67 },
      { lat: 26.0, lon: -8.67 },
      { lat: 26.0, lon: -12.0 },
      { lat: 23.45, lon: -12.0 },
      { lat: 23.17, lon: -13.0 },
      { lat: 21.33, lon: -13.0 },
      { lat: 21.33, lon: -16.93 },
      { lat: 19.0, lon: -19.0 },
      { lat: 24.0, lon: -25.0 },
      { lat: 30.0, lon: -25.0 },
      { lat: 30.0, lon: -20.0 },
      { lat: 31.68, lon: -17.46 },
      { lat: 31.5, lon: -15.75 },
      { lat: 30.0, lon: -12.5 },
      { lat: 27.67, lon: -13.17 },
      { lat: 27.67, lon: -11.23 },
    ],
    0.6
  ),
  // GVSC Sal Oceanic
  densifyPath(
    [
      { lat: 24.0, lon: -25.0 },
      { lat: 19.83, lon: -20.0 },
      { lat: 15.0, lon: -20.0 },
      { lat: 12.97, lon: -21.37 },
      { lat: 17.0, lon: -37.5 },
      { lat: 24.0, lon: -25.0 },
    ],
    0.55
  ),
  // SOOO / KZMA / San Juan / TTZP / SBAO / Pacific OACs: CPDLC labels only
  // (no inferred educational boxes — incomplete official outlines).
];

/** Region codes placed inside each OAC near shared boundaries. */
export const OAC_LABELS = [
  { code: "CZQX", lat: 53, lon: -33 },
  { code: "EGGX", lat: 53, lon: -22 },
  { code: "LPPO", lat: 42, lon: -25 },
  { code: "BIRD", lat: 63.5, lon: -18 },
  { code: "KZWY", lat: 42, lon: -46 },
  { code: "ENOB", lat: 70, lon: 5 },
  { code: "BGGL", lat: 64.5, lon: -48.0 }, // Nuuk FIR (NAT-facing)
  { code: "KZMA", boldCode: "KUSA", lat: 27.5, lon: -72.0 }, // FIR + CPDLC login (label only)
  { code: "San Juan", lat: 18.5, lon: -63.0 }, // label only
  { code: "TTZP", lat: 11.0, lon: -55.0 }, // Piarco — label only
  { code: "GVSC", lat: 17.5, lon: -28.0 }, // Sal Oceanic
  { code: "SOOO", lat: 8.0, lon: -28.0 }, // Dakar oceanic — label only
  { code: "GCCC", lat: 26.5, lon: -18.0 }, // Canarias
  { code: "SBAO", lat: -2.0, lon: -30.0 }, // Atlântico / Recife — label only
  { code: "KZAK", lat: 22.0, lon: -148.0 }, // Oakland Oceanic — label only
  { code: "PAZA", lat: 52.0, lon: -155.0 }, // Anchorage Oceanic — label only
  { code: "NZZO", lat: -34.0, lon: 172.0 }, // Auckland Oceanic — label only
  { code: "NFFF", lat: -10.0, lon: 172.0 }, // Nadi Oceanic — label only
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
 * European FIRs: full simplified outlines (Shannon / Scottish / Lisboa / Madrid).
 */
export const DOMESTIC_FIR_SEGMENTS = [
  // EISN Shannon FIR
  densifyPath(
    [
      { lat: 54.65, lon: -9.56 },
      { lat: 55.33, lon: -6.92 },
      { lat: 54.42, lon: -8.17 },
      { lat: 53.92, lon: -5.5 },
      { lat: 52.33, lon: -5.5 },
      { lat: 51.0, lon: -8.0 },
      { lat: 51.0, lon: -15.0 },
      { lat: 54.0, lon: -15.0 },
      { lat: 54.65, lon: -9.56 },
    ],
    0.45
  ),
  // EGPX Scottish FIR
  densifyPath(
    [
      { lat: 56.0, lon: -10.0 },
      { lat: 61.0, lon: -10.0 },
      { lat: 61.0, lon: 0.0 },
      { lat: 60.0, lon: 0.0 },
      { lat: 57.0, lon: 5.0 },
      { lat: 55.0, lon: 5.0 },
      { lat: 55.0, lon: -5.5 },
      { lat: 53.92, lon: -5.5 },
      { lat: 54.42, lon: -8.17 },
      { lat: 55.42, lon: -7.33 },
      { lat: 54.57, lon: -10.0 },
      { lat: 56.0, lon: -10.0 },
    ],
    0.5
  ),
  // LPPC Lisboa FIR
  densifyPath(
    [
      { lat: 39.88, lon: -6.87 },
      { lat: 39.66, lon: -7.5 },
      { lat: 35.97, lon: -7.38 },
      { lat: 35.97, lon: -12.0 },
      { lat: 31.5, lon: -15.75 },
      { lat: 32.33, lon: -18.13 },
      { lat: 33.92, lon: -18.07 },
      { lat: 36.5, lon: -15.0 },
      { lat: 42.0, lon: -15.0 },
      { lat: 43.0, lon: -13.0 },
      { lat: 41.93, lon: -6.57 },
      { lat: 39.88, lon: -6.87 },
    ],
    0.5
  ),
  // LECM Madrid FIR
  densifyPath(
    [
      { lat: 41.58, lon: -6.25 },
      { lat: 43.0, lon: -13.0 },
      { lat: 45.0, lon: -13.0 },
      { lat: 44.54, lon: -5.14 },
      { lat: 42.7, lon: -0.07 },
      { lat: 35.83, lon: -2.1 },
      { lat: 35.83, lon: -7.38 },
      { lat: 39.66, lon: -7.5 },
      { lat: 41.58, lon: -6.25 },
    ],
    0.5
  ),

  // CZUL Montreal — eastern approaches / CZQX interface (simplified)
  densifyPath(
    [
      { lat: 45.0, lon: -80.0 },
      { lat: 50.0, lon: -80.0 },
      { lat: 52.0, lon: -70.0 },
      { lat: 50.0, lon: -64.0 },
      { lat: 47.0, lon: -64.0 },
      { lat: 45.0, lon: -67.0 },
      { lat: 45.0, lon: -80.0 },
    ],
    0.55
  ),
  // CZEG Edmonton — northern / Arctic face toward CZQX (simplified educational)
  densifyPath(
    [
      { lat: 55.0, lon: -110.0 },
      { lat: 70.0, lon: -110.0 },
      { lat: 70.0, lon: -60.0 },
      { lat: 62.0, lon: -60.0 },
      { lat: 55.0, lon: -75.0 },
      { lat: 55.0, lon: -110.0 },
    ],
    0.7
  ),

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
];

/**
 * Adjacent domestic FIRs — CPDLC / FIR indicators near the oceanic interface
 * (kept close to landfall so they stay in a typical NAT route frame).
 * Oceanic CZQX / KZWY / BIRD / ENOB / BGGL labels remain in OAC_LABELS.
 */
export const DOMESTIC_FIR_LABELS = [
  // UK / Ireland / France / Iberia — west of airport clutter, near 008–015°W
  { code: "EGPX", lat: 56.8, lon: -6.5 }, // Scottish
  { code: "EISN", lat: 52.5, lon: -9.5 }, // Shannon
  { code: "EGTT", lat: 51.4, lon: -4.5 }, // London (western approaches)
  { code: "LFRR", lat: 48.2, lon: -5.0 }, // Brest
  { code: "LECM", lat: 43.2, lon: -7.2 }, // Madrid (NW corner)
  { code: "LPPC", lat: 40.2, lon: -9.5 }, // Lisboa
  // Canada / US northeast
  { code: "CZQM", lat: 46.8, lon: -60.5 }, // Moncton
  { code: "CZUL", lat: 48.5, lon: -68.0 }, // Montreal
  { code: "CZEG", lat: 60.0, lon: -95.0 }, // Edmonton
  { code: "KZBW", lat: 42.8, lon: -68.5 }, // Boston ARTCC
  { code: "KZNY", lat: 40.5, lon: -71.5 }, // New York ARTCC (domestic; oceanic = KZWY)
];
