/**
 * Fullscreen educational weather overlays (not certified).
 * - Storm systems and SIGMETs: NHC + any text SIGMET/VA (12h localStorage).
 * - Live Thunderstorms: RainViewer radar intensity only (memory; regional zoom).
 * Advisories are filtered to validTimeFrom…validTimeTo (future OK; expired hidden).
 */

const MAJOR_CACHE_KEY = "mynattrack_major_weather_v4";
const MAJOR_TTL_MS = 12 * 60 * 60 * 1000;

const NHC_STORMS = "https://www.nhc.noaa.gov/CurrentStorms.json";
const AWC_ISIGMET = "https://aviationweather.gov/api/data/isigmet?format=geojson";
const AWC_AIRSIGMET = "https://aviationweather.gov/api/data/airsigmet?format=geojson";
const AWC_VA_ISIGMET =
  "https://aviationweather.gov/api/data/isigmet?hazard=VA&format=geojson";
const IEM_CONVECTIVE =
  "https://mesonet.agron.iastate.edu/geojson/convective_sigmet.py";

let majorInflight = null;

function nowMs() {
  return Date.now();
}

async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function parseTimeMs(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const ms = Date.parse(String(value).trim().replace(" ", "T"));
  return Number.isFinite(ms) ? ms : NaN;
}

/** Keep if not yet expired. Missing end time → keep. Future start → keep. */
export function isAdvisoryActive(validFrom, validTo, atMs = nowMs()) {
  const fromMs = parseTimeMs(validFrom);
  const toMs = parseTimeMs(validTo);
  if (Number.isFinite(toMs) && atMs > toMs) return false;
  return true;
}

function loadMajorCacheRaw() {
  try {
    const raw = localStorage.getItem(MAJOR_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.fetchedAt)) return null;
    if (nowMs() - parsed.fetchedAt > MAJOR_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveMajorCache(payload) {
  try {
    localStorage.setItem(
      MAJOR_CACHE_KEY,
      JSON.stringify({
        storms: payload.storms || [],
        sigmets: payload.sigmets || [],
        volcanoes: payload.volcanoes || [],
        fetchedAt: payload.fetchedAt,
        source: payload.source || "network",
      })
    );
  } catch {
    /* quota */
  }
}

function parseNhCStorms(data) {
  const out = [];
  for (const s of data?.activeStorms || []) {
    const lat = Number(s.latitudeNumeric);
    const lon = Number(s.longitudeNumeric);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      id: String(s.id || s.name || "").toUpperCase(),
      name: String(s.name || s.id || "STORM").toUpperCase(),
      classification: String(s.classification || "").toUpperCase(),
      lat,
      lon,
      intensity: s.intensity != null ? String(s.intensity) : "",
      movementDir: Number.isFinite(Number(s.movementDir))
        ? Number(s.movementDir)
        : undefined,
      movementSpeed: Number.isFinite(Number(s.movementSpeed))
        ? Number(s.movementSpeed)
        : undefined,
      lastUpdate: s.lastUpdate || "",
    });
  }
  return out;
}

function ringFromCoords(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const ring = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    ring.push({ lat, lon });
  }
  return ring.length >= 3 ? ring : null;
}

function ringsFromGeometry(geometry) {
  const rings = [];
  if (!geometry) return rings;
  const t = geometry.type;
  const c = geometry.coordinates;
  if (t === "Polygon" && Array.isArray(c?.[0])) {
    const r = ringFromCoords(c[0]);
    if (r) rings.push(r);
  } else if (t === "MultiPolygon" && Array.isArray(c)) {
    for (const poly of c) {
      const r = ringFromCoords(poly?.[0]);
      if (r) rings.push(r);
    }
  }
  return rings;
}

function isThunderHazard(haz, raw = "") {
  const h = String(haz || "").toUpperCase();
  const text = `${h} ${raw}`.toUpperCase();
  return (
    h === "TS" ||
    h === "CONVECTIVE" ||
    text.includes("THUNDER") ||
    text.includes("CONVECTIVE") ||
    /\bTS\b/.test(text) ||
    /\bEMBD TS\b/.test(text)
  );
}

/**
 * Text advisories belong on Storms+SIGMET (not Live TS).
 * Accepts any feature with narrative text, or a known SIGMET hazard code.
 */
function isTextSigmet(haz, raw = "") {
  if (String(raw || "").trim().length > 0) return true;
  const h = String(haz || "").toUpperCase();
  return (
    h === "TS" ||
    h === "TC" ||
    h === "TURB" ||
    h === "ICE" ||
    h === "VA" ||
    h === "MTW" ||
    h === "DS" ||
    h === "SS" ||
    h === "CONVECTIVE" ||
    h.includes("TS") ||
    h.includes("TC") ||
    h.includes("TURB") ||
    h.includes("ICE") ||
    h.includes("VA")
  );
}

function featureValidity(p) {
  return {
    validFrom: p.validTimeFrom || p.issue || p.valid_from || "",
    validTo: p.validTimeTo || p.expire || p.valid_to || "",
  };
}

function featureLabel(p, haz) {
  if (p.label) return String(p.label).trim();
  if (p.seriesId != null && p.alphaChar != null) {
    return `${p.seriesId} ${p.alphaChar}`.trim();
  }
  if (p.seriesId) return String(p.seriesId).trim();
  return String(haz || "SIGMET").trim();
}

function featureRaw(p) {
  return String(
    p.rawSigmet || p.rawAirSigmet || p.narrative || p.raw || ""
  ).trim();
}

/**
 * @param {any} fc
 * @param {(haz:string, raw:string)=>boolean} pred
 * @param {string} kind
 */
function parsePolygons(fc, pred, kind) {
  const out = [];
  const features = fc?.features || [];
  for (let i = 0; i < features.length; i += 1) {
    const f = features[i];
    const p = f?.properties || {};
    const raw = featureRaw(p);
    const haz = String(p.hazard || p.label || kind || "").toUpperCase();
    if (!pred(haz, raw)) continue;
    const rings = ringsFromGeometry(f.geometry);
    if (!rings.length) continue;
    const { validFrom, validTo } = featureValidity(p);
    const label = featureLabel(p, haz).slice(0, 18);
    out.push({
      id: `${p.icaoId || p.firId || p.seriesId || p.product_id || kind}-${label}-${i}`,
      kind,
      hazard: haz || kind,
      label,
      raw,
      severity: p.severity != null ? String(p.severity) : "",
      altitudeLo: p.altitudeLow1 ?? p.altitudeLow2 ?? "",
      altitudeHi: p.altitudeHi1 ?? p.altitudeHi2 ?? "",
      rings,
      validFrom,
      validTo,
    });
  }
  return out;
}

function ringCentroidLatLon(ring) {
  if (!ring?.length) return null;
  let lat = 0;
  let lon = 0;
  for (const p of ring) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

function polyDedupeKey(poly) {
  // Collapse successive VA SIGMET numbers for the same volcano into one box
  if (isVaHazard(poly.hazard, poly.raw)) {
    const psn = parseVolcanoPsn(poly.raw);
    if (psn) {
      return `VA|${Math.round(psn.lat * 20) / 20}|${Math.round(psn.lon * 20) / 20}`;
    }
  }
  const c = ringCentroidLatLon(poly.rings?.[0]);
  const lat = c ? Math.round(c.lat * 5) / 5 : 0;
  const lon = c ? Math.round(c.lon * 5) / 5 : 0;
  const lab = String(poly.label || poly.hazard || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  return `${lab}|${lat}|${lon}`;
}

/** Drop near-duplicate advisories (AWC + IEM often publish the same box).
 * Prefer the copy with the longer raw text (better tap detail).
 */
export function dedupePolygons(polygons) {
  const byKey = new Map();
  for (const poly of polygons || []) {
    const k = polyDedupeKey(poly);
    const prev = byKey.get(k);
    if (!prev || (poly.raw || "").length > (prev.raw || "").length) {
      byKey.set(k, poly);
    }
  }
  return Array.from(byKey.values());
}

export function filterActivePolygons(polygons, atMs = nowMs()) {
  return (polygons || []).filter((poly) =>
    isAdvisoryActive(poly.validFrom, poly.validTo, atMs)
  );
}

export function isThunderPolygon(poly) {
  return isThunderHazard(poly?.hazard, poly?.raw);
}

export function isVaPolygon(poly) {
  return isVaHazard(poly?.hazard, poly?.raw);
}

function isVaHazard(haz, raw = "") {
  const h = String(haz || "").toUpperCase();
  const t = `${h} ${raw}`.toUpperCase();
  return (
    h === "VA" ||
    /\bVA\b/.test(t) ||
    t.includes("VOLCANIC ASH") ||
    t.includes("ERUPTION MT") ||
    t.includes("VA CLD")
  );
}

/** Parse volcano lat/lon from SIGMET/VAA-style PSN group. */
function parseVolcanoPsn(raw) {
  const text = String(raw || "");
  const m =
    text.match(
      /PSN\s*([NS])\s*(\d{2})\s*(\d{2}(?:\.\d+)?)\s*([EW])\s*(\d{3})\s*(\d{2}(?:\.\d+)?)/i
    ) ||
    text.match(
      /PSN\s*([NS])(\d{2})(\d{2}(?:\.\d+)?)([EW])(\d{3})(\d{2}(?:\.\d+)?)/i
    );
  if (!m) return null;
  let lat = Number(m[2]) + Number(m[3]) / 60;
  let lon = Number(m[5]) + Number(m[6]) / 60;
  if (m[1].toUpperCase() === "S") lat = -lat;
  if (m[4].toUpperCase() === "W") lon = -lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function parseVolcanoName(raw) {
  const text = String(raw || "").replace(/\s+/g, " ");
  const m = text.match(
    /(?:ERUPTION\s+)?(?:MT\.?|MOUNT|VOLCAN(?:\s+DE)?)\s+([A-Z][A-Z0-9' \-]{1,28}?)(?=\s+PSN|\s+VA\b|\s+CLD|\s+OBS|\s*$)/i
  );
  if (!m) return "";
  return `MT ${m[1].trim().replace(/\s+/g, " ").toUpperCase()}`.slice(0, 22);
}

/**
 * Volcano icons from VA ash SIGMETs (free AWC feed; full VAA text needs WIFS).
 * Deduped by position so successive SIGMET numbers for the same mountain collapse.
 */
export function extractVolcanoes(sigmets) {
  const byKey = new Map();
  for (const poly of sigmets || []) {
    if (!isVaHazard(poly.hazard, poly.raw)) continue;
    const psn = parseVolcanoPsn(poly.raw);
    if (!psn) continue;
    const name = parseVolcanoName(poly.raw) || poly.label || "VA";
    const key = `${Math.round(psn.lat * 20) / 20}|${Math.round(psn.lon * 20) / 20}`;
    const prev = byKey.get(key);
    const next = {
      id: `vol-${key}`,
      name,
      lat: psn.lat,
      lon: psn.lon,
      label: name,
      hazard: "VA",
      kind: "va-volcano",
      raw: poly.raw || "",
      validFrom: poly.validFrom || "",
      validTo: poly.validTo || "",
      polyId: poly.id,
    };
    if (!prev || (next.raw || "").length > (prev.raw || "").length) {
      byKey.set(key, next);
    }
  }
  return Array.from(byKey.values());
}

function prunePayload(payload, atMs = nowMs()) {
  if (!payload) return payload;
  const sigmets = dedupePolygons(filterActivePolygons(payload.sigmets, atMs));
  return {
    ...payload,
    storms: payload.storms || [],
    sigmets,
    volcanoes: extractVolcanoes(sigmets),
    polygons: dedupePolygons(filterActivePolygons(payload.polygons, atMs)),
  };
}

function finishMajorPayload(storms, sigmets, source, errors) {
  const deduped = dedupePolygons(sigmets);
  return {
    storms,
    sigmets: deduped,
    volcanoes: extractVolcanoes(deduped),
    fetchedAt: nowMs(),
    source,
    errors,
  };
}

async function fetchMajorNetwork() {
  const errors = [];
  let storms = [];
  let sigmets = [];

  try {
    const proxied = await fetchJson("./api/weather-major");
    if (proxied && !proxied.error) {
      let storms = proxied.storms || [];
      let sigmets = proxied.sigmets || [];
      if (proxied.nhc) storms = parseNhCStorms(proxied.nhc);
      // All text SIGMETs (incl. convective / IEM / VA) — Live TS is radar-only
      if (proxied.isigmet) {
        sigmets = sigmets.concat(
          parsePolygons(proxied.isigmet, isTextSigmet, "isigmet")
        );
      }
      if (proxied.airsigmet) {
        sigmets = sigmets.concat(
          parsePolygons(proxied.airsigmet, isTextSigmet, "airsigmet")
        );
      }
      if (proxied.iem) {
        sigmets = sigmets.concat(
          parsePolygons(proxied.iem, isTextSigmet, "iem")
        );
      }
      if (proxied.vaisigmet) {
        sigmets = sigmets.concat(
          parsePolygons(proxied.vaisigmet, () => true, "va")
        );
      }
      if (storms.length || sigmets.length) {
        return finishMajorPayload(storms, sigmets, proxied.source || "proxy");
      }
    }
    if (proxied?.error) errors.push(String(proxied.error));
  } catch (e) {
    errors.push(`proxy: ${e?.message || e}`);
  }

  try {
    storms = parseNhCStorms(await fetchJson(NHC_STORMS));
  } catch (e) {
    errors.push(`NHC: ${e?.message || e}`);
  }
  try {
    sigmets = sigmets.concat(
      parsePolygons(await fetchJson(AWC_ISIGMET), isTextSigmet, "isigmet")
    );
  } catch (e) {
    errors.push(`isigmet: ${e?.message || e}`);
  }
  try {
    sigmets = sigmets.concat(
      parsePolygons(await fetchJson(AWC_AIRSIGMET), isTextSigmet, "airsigmet")
    );
  } catch (e) {
    errors.push(`airsigmet: ${e?.message || e}`);
  }
  try {
    sigmets = sigmets.concat(
      parsePolygons(await fetchJson(IEM_CONVECTIVE), isTextSigmet, "iem")
    );
  } catch (e) {
    errors.push(`IEM: ${e?.message || e}`);
  }
  try {
    sigmets = sigmets.concat(
      parsePolygons(await fetchJson(AWC_VA_ISIGMET), () => true, "va")
    );
  } catch (e) {
    errors.push(`VA: ${e?.message || e}`);
  }

  if (!storms.length && !sigmets.length) {
    throw new Error(errors.join("; ") || "Weather fetch failed");
  }
  return finishMajorPayload(storms, sigmets, "network", errors);
}

/**
 * @param {{force?:boolean}} [opts]
 */
export async function loadStormSystemsAndSigmets(opts = {}) {
  if (!opts.force) {
    const cached = loadMajorCacheRaw();
    if (cached) {
      const pruned = prunePayload(cached);
      // Persist prune so expired items drop from storage too
      if ((cached.sigmets || []).length !== (pruned.sigmets || []).length) {
        saveMajorCache(pruned);
      }
      return { ...pruned, fromCache: true };
    }
  }
  if (majorInflight && !opts.force) return majorInflight;
  const run = fetchMajorNetwork()
    .then((fresh) => {
      const pruned = prunePayload(fresh);
      saveMajorCache(pruned);
      return { ...pruned, fromCache: false };
    })
    .finally(() => {
      majorInflight = null;
    });
  majorInflight = run;
  return run;
}

/** Soft background refresh when online; keeps showing pruned cache on failure. */
export async function refreshStormSystemsInBackground() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    return await loadStormSystemsAndSigmets({ force: true });
  } catch {
    return null;
  }
}

export function formatWeatherAge(fetchedAt) {
  if (!Number.isFinite(fetchedAt)) return "";
  const min = Math.max(0, Math.round((nowMs() - fetchedAt) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
}

/* ── Live radar detail (RainViewer; memory only; regional zoom) ── */

const RADAR_META_URL = "https://api.rainviewer.com/public/weather-maps.json";
/** Visible half-angle ≤ this ≈ NAT-basin / regional (not full globe). */
const REGIONAL_HALF_ANGLE_DEG = 48;
const RADAR_MAX_TILES = 16;
const RADAR_TTL_MS = 8 * 60 * 1000;

/** @type {null | { key: string, tiles: object[], fetchedAt: number, path: string, z: number }} */
let radarMemory = null;
let radarInflight = null;
let radarMetaCache = null;
let radarMetaAt = 0;

/**
 * True when the chart shows a regional disc (NAT-sized or tighter),
 * including when panned over e.g. Hong Kong at similar zoom.
 */
export function isRegionalWeatherView(layout, width, height) {
  if (!layout || !width || !height) return false;
  const half = Math.min(width, height) * 0.5;
  const ang =
    (Math.asin(Math.min(0.999, half / Math.max(layout.radius, 1))) * 180) /
    Math.PI;
  return ang <= REGIONAL_HALF_ANGLE_DEG;
}

function lon2tile(lon, z) {
  return ((lon + 180) / 360) * 2 ** z;
}

function lat2tile(lat, z) {
  const r = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
  );
}

function pickRadarZoom(spanDeg) {
  // Prefer denser tiles for regional NAT / coastal views
  if (spanDeg > 50) return 3;
  if (spanDeg > 28) return 4;
  if (spanDeg > 14) return 5;
  return 6;
}

async function loadRadarMeta() {
  if (radarMetaCache && nowMs() - radarMetaAt < 4 * 60 * 1000) {
    return radarMetaCache;
  }
  const meta = await fetchJson(RADAR_META_URL, 15000);
  const past = meta?.radar?.past;
  if (!meta?.host || !Array.isArray(past) || !past.length) {
    throw new Error("Radar frames unavailable");
  }
  radarMetaCache = meta;
  radarMetaAt = nowMs();
  return meta;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("radar tile"));
    img.src = url;
  });
}

async function decodeTile(url, z, x, y) {
  const img = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return {
    z,
    x,
    y,
    w: img.width,
    h: img.height,
    data: ctx.getImageData(0, 0, img.width, img.height).data,
  };
}

/**
 * Fetch RainViewer radar tiles for the visible regional disc.
 * Memory only — never written to disk. Cap tile count for lightness.
 * @param {{ lat0:number, lon0:number, spanLat:number, spanLon:number, force?:boolean }} view
 */
export async function loadLiveRadarDetail(view) {
  const span = Math.max(view.spanLat || 20, view.spanLon || 20);
  const z = pickRadarZoom(span);
  const pad = span * 0.15;
  const minLat = Math.max(-85, (view.lat0 || 0) - span / 2 - pad);
  const maxLat = Math.min(85, (view.lat0 || 0) + span / 2 + pad);
  let minLon = (view.lon0 || 0) - span / 2 - pad;
  let maxLon = (view.lon0 || 0) + span / 2 + pad;

  let x0 = Math.floor(lon2tile(minLon, z));
  let x1 = Math.floor(lon2tile(maxLon, z));
  let y0 = Math.floor(lat2tile(maxLat, z));
  let y1 = Math.floor(lat2tile(minLat, z));
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];

  const n = 2 ** z;
  x0 = Math.max(0, x0);
  x1 = Math.min(n - 1, x1);
  y0 = Math.max(0, y0);
  y1 = Math.min(n - 1, y1);

  // Shrink window if too many tiles (keep center)
  let cols = x1 - x0 + 1;
  let rows = y1 - y0 + 1;
  while (cols * rows > RADAR_MAX_TILES && (cols > 1 || rows > 1)) {
    if (cols >= rows && cols > 1) {
      x0 += 1;
      x1 -= 1;
      cols = x1 - x0 + 1;
    } else if (rows > 1) {
      y0 += 1;
      y1 -= 1;
      rows = y1 - y0 + 1;
    } else break;
  }

  const meta = await loadRadarMeta();
  const frame = meta.radar.past[meta.radar.past.length - 1];
  const key = `${frame.path}|${z}|${x0}-${x1}|${y0}-${y1}`;

  if (
    !view.force &&
    radarMemory?.key === key &&
    nowMs() - radarMemory.fetchedAt < RADAR_TTL_MS
  ) {
    return { ...radarMemory, fromMemory: true };
  }
  if (radarInflight) return radarInflight;

  const run = (async () => {
    const tiles = [];
    const jobs = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        // TWC-style palette (4), unsmoothed — green/yellow/red intensity
        const url = `${meta.host}${frame.path}/256/${z}/${x}/${y}/4/0_0.png`;
        jobs.push(
          decodeTile(url, z, x, y)
            .then((t) => tiles.push(t))
            .catch(() => {})
        );
      }
    }
    await Promise.all(jobs);
    radarMemory = {
      key,
      tiles,
      fetchedAt: nowMs(),
      path: frame.path,
      z,
      source: "RainViewer",
    };
    return { ...radarMemory, fromMemory: false };
  })().finally(() => {
    radarInflight = null;
  });

  radarInflight = run;
  return run;
}

export function clearLiveRadarMemory() {
  radarMemory = null;
}

export function getLiveRadarMemory() {
  return radarMemory;
}
