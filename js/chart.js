/**
 * Offline North Atlantic globe chart (orthographic projection).
 * Land contours from Natural Earth 110m (bundled). No external tiles.
 */

import {
  OAC_LABELS,
  OAC_SEGMENTS,
  OTA_AREAS,
  DOMESTIC_FIR_SEGMENTS,
  DOMESTIC_FIR_LABELS,
} from "./oac.js";
import {
  diversionAirportsPlottable,
  RWY_LABEL_MIN_M,
  runwayLabels,
} from "./diversionAirports.js";
import { airports747List } from "./airports747.js";
import { hasDigitalAtis } from "./datisAirports.js";
import { subsolarPoint, geodesicCircleLonLat, normalizeLon } from "./solar.js";

/** Cached diversion-only list (always on chart). */
let diversionOnlyCache = null;
function getDiversionChartAirports() {
  if (!diversionOnlyCache) {
    diversionOnlyCache = diversionAirportsPlottable(RWY_LABEL_MIN_M);
  }
  return diversionOnlyCache;
}

/** Diversions + 747 extras (no ICAO double-plot). Used in full-screen chart mode. */
let chartAirportsWith747Cache = null;
function getChartAirportsWith747() {
  if (!chartAirportsWith747Cache) {
    const diversions = getDiversionChartAirports();
    const seen = new Set(diversions.map((a) => a.icao));
    const extra747 = airports747List().filter((a) => a?.icao && !seen.has(a.icao));
    chartAirportsWith747Cache = diversions.concat(extra747);
  }
  return chartAirportsWith747Cache;
}

function airportsForChart(include747) {
  return include747 ? getChartAirportsWith747() : getDiversionChartAirports();
}

/** Default North Atlantic framing (used when no route is programmed). */
const DEFAULT_VIEW = {
  lat0: 50,
  lon0: -35,
  /** Corner samples that define the default zoom window */
  frame: [
    { lat: 32, lon: -72 },
    { lat: 32, lon: -8 },
    { lat: 68, lon: -72 },
    { lat: 68, lon: -8 },
    { lat: 50, lon: -55 },
    { lat: 50, lon: -15 },
  ],
};

let landRings = null;
let landLoadPromise = null;

export function loadLandData() {
  if (landRings) return Promise.resolve(landRings);
  if (landLoadPromise) return landLoadPromise;
  landLoadPromise = fetch("./data/land-110m.json")
    .then((r) => r.json())
    .then((data) => {
      landRings = data.rings || [];
      return landRings;
    })
    .catch((err) => {
      console.warn("Land data load failed", err);
      landRings = [];
      return landRings;
    });
  return landLoadPromise;
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

/**
 * Orthographic projection. Returns {x,y,visible} in canvas pixels.
 */
export function project(lat, lon, width, height, opts = {}) {
  const lat0 = toRad(opts.lat0 ?? DEFAULT_VIEW.lat0);
  const lon0 = toRad(opts.lon0 ?? DEFAULT_VIEW.lon0);
  const φ = toRad(lat);
  const λ = toRad(lon);
  const cosc =
    Math.sin(lat0) * Math.sin(φ) +
    Math.cos(lat0) * Math.cos(φ) * Math.cos(λ - lon0);
  const R = opts.radius ?? Math.min(width, height) * 1.15;
  const cx = opts.cx ?? width / 2;
  const cy = opts.cy ?? height / 2;
  if (cosc < 0) {
    return { x: cx, y: cy, visible: false, cosc };
  }
  const x = cx + R * Math.cos(φ) * Math.sin(λ - lon0);
  const y =
    cy -
    R *
      (Math.cos(lat0) * Math.sin(φ) -
        Math.sin(lat0) * Math.cos(φ) * Math.cos(λ - lon0));
  return { x, y, visible: true, cosc };
}

function centralAngleDeg(lat0, lon0, lat, lon) {
  const φ1 = toRad(lat0);
  const λ1 = toRad(lon0);
  const φ2 = toRad(lat);
  const λ2 = toRad(lon);
  const cosc =
    Math.sin(φ1) * Math.sin(φ2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (Math.acos(Math.max(-1, Math.min(1, cosc))) * 180) / Math.PI;
}

function meanCenter(points) {
  // Vector mean on the sphere (avoids dateline issues for NAT longitudes)
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const φ = toRad(p.lat);
    const λ = toRad(p.lon);
    x += Math.cos(φ) * Math.cos(λ);
    y += Math.cos(φ) * Math.sin(λ);
    z += Math.sin(φ);
  }
  const n = points.length || 1;
  x /= n;
  y /= n;
  z /= n;
  const lon0 = (Math.atan2(y, x) * 180) / Math.PI;
  const hyp = Math.sqrt(x * x + y * y);
  const lat0 = (Math.atan2(z, hyp) * 180) / Math.PI;
  return { lat0, lon0 };
}

/**
 * Zoom the orthographic view so the programmed route (or default NAT frame)
 * fills most of the panel — not the entire globe.
 * Pan only moves the view centre; it must NOT change fit radius (otherwise
 * dragging south makes NAT focus points dominate maxAngle and the globe collapses).
 * @param {number} userZoom  pinch/wheel multiplier (1 = auto-fit)
 * @param {{ dLat?: number, dLon?: number }} pan  user pan offsets (deg) from fitted center
 */
export function globeLayout(width, height, focusPoints = [], userZoom = 1, pan = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const half = Math.min(width, height) * 0.5;

  const points =
    focusPoints.length >= 1 ? focusPoints : DEFAULT_VIEW.frame.slice();

  const fit =
    focusPoints.length >= 1
      ? meanCenter(focusPoints)
      : { lat0: DEFAULT_VIEW.lat0, lon0: DEFAULT_VIEW.lon0 };

  // Fit angular size to unpanned centre so pan feels like sliding a window
  let maxAngle = 0;
  for (const p of points) {
    maxAngle = Math.max(
      maxAngle,
      centralAngleDeg(fit.lat0, fit.lon0, p.lat, p.lon)
    );
  }
  maxAngle = Math.max(maxAngle, focusPoints.length >= 2 ? 5 : 14);
  maxAngle *= focusPoints.length >= 2 ? 1.08 : 1.05;

  const sinC = Math.sin(toRad(maxAngle));
  let radius = sinC > 1e-6 ? (half * 0.96) / sinC : half * 1.4;
  const minRadius = maxAngle > 35 ? half * 0.55 : half * 1.15;
  radius = Math.max(radius, minRadius);
  radius = Math.min(radius, half * 4.5);

  const zoom = Math.max(0.5, Math.min(5, Number(userZoom) || 1));
  radius *= zoom;

  // View centre = fit + pan (full globe reachable)
  let lat0 = fit.lat0 + (Number(pan.dLat) || 0);
  let lon0 = fit.lon0 + (Number(pan.dLon) || 0);
  lat0 = Math.max(-85, Math.min(85, lat0));
  lon0 = ((((lon0 + 180) % 360) + 360) % 360) - 180;

  return { radius, cx, cy, lat0, lon0, fitLat0: fit.lat0, fitLon0: fit.lon0 };
}

function drawGlobeBase(ctx, layout, bright, width, height) {
  const { cx, cy, radius } = layout;

  // Space / page behind globe
  ctx.fillStyle = bright ? "#dce6f2" : "#071018";
  ctx.fillRect(0, 0, width, height);

  // Soft drop shadow
  ctx.beginPath();
  ctx.arc(cx + 4, cy + 8, radius * 1.02, 0, Math.PI * 2);
  ctx.fillStyle = bright ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.45)";
  ctx.fill();

  // Ocean disc with radial 3D shading
  const ocean = ctx.createRadialGradient(
    cx - radius * 0.35,
    cy - radius * 0.4,
    radius * 0.1,
    cx,
    cy,
    radius
  );
  if (bright) {
    ocean.addColorStop(0, "#b9d8ff");
    ocean.addColorStop(0.55, "#7eb0e8");
    ocean.addColorStop(1, "#3a6ea5");
  } else {
    ocean.addColorStop(0, "#2a6a8a");
    ocean.addColorStop(0.45, "#163d55");
    ocean.addColorStop(1, "#0a1c2c");
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = ocean;
  ctx.fill();

  // Specular highlight
  const hi = ctx.createRadialGradient(
    cx - radius * 0.4,
    cy - radius * 0.45,
    0,
    cx - radius * 0.25,
    cy - radius * 0.3,
    radius * 0.55
  );
  hi.addColorStop(0, bright ? "rgba(255,255,255,0.55)" : "rgba(180,220,255,0.22)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = hi;
  ctx.fill();

  // Limb
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = bright ? "rgba(0,0,0,0.55)" : "rgba(140,180,200,0.35)";
  ctx.lineWidth = bright ? 2 : 1.5;
  ctx.stroke();
}

/**
 * Orthographic land project with cosc retained.
 * Uses precomputed centre trig (one per drawLand) for coast-dense rings.
 * @param {{ sinLat0:number, cosLat0:number, lon0:number, cx:number, cy:number, R:number }} C
 */
function projectLandPoint(lat, lon, C) {
  const φ = toRad(lat);
  const λ = toRad(lon);
  const sinφ = Math.sin(φ);
  const cosφ = Math.cos(φ);
  const cosc =
    C.sinLat0 * sinφ + C.cosLat0 * cosφ * Math.cos(λ - C.lon0);
  const x = C.cx + C.R * cosφ * Math.sin(λ - C.lon0);
  const y =
    C.cy -
    C.R * (C.cosLat0 * sinφ - C.sinLat0 * cosφ * Math.cos(λ - C.lon0));
  return { x, y, cosc, lat, lon, visible: cosc >= 0 };
}

/** Interpolate edge to the silhouette (cosc ≈ 0). */
function horizonCut(a, b, C) {
  let lo = 0;
  let hi = 1;
  let best = a;
  for (let i = 0; i < 12; i += 1) {
    const t = (lo + hi) * 0.5;
    const lat = a.lat + (b.lat - a.lat) * t;
    let dLon = b.lon - a.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const lon = a.lon + dLon * t;
    const p = projectLandPoint(lat, lon, C);
    best = p;
    if (p.cosc >= 0) lo = t;
    else hi = t;
  }
  const ang = Math.atan2(best.y - C.cy, best.x - C.cx);
  return {
    x: C.cx + C.R * Math.cos(ang),
    y: C.cy + C.R * Math.sin(ang),
    onLimb: true,
  };
}

function addLimbArc(ctx, C, from, to) {
  const a0 = Math.atan2(from.y - C.cy, from.x - C.cx);
  const a1 = Math.atan2(to.y - C.cy, to.x - C.cx);
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const steps = Math.max(3, Math.ceil(Math.abs(delta) / 0.18));
  for (let i = 1; i <= steps; i += 1) {
    const a = a0 + (delta * i) / steps;
    ctx.lineTo(C.cx + C.R * Math.cos(a), C.cy + C.R * Math.sin(a));
  }
}

/**
 * Clip a coast ring to the near hemisphere. Back-side stretches become
 * silhouette (limb) points so mega-continents can still be filled green.
 */
function clippedLandRing(ring, C, step) {
  const pts = [];
  for (let i = 0; i < ring.length; i += step) {
    const [lon, lat] = ring[i];
    pts.push(projectLandPoint(lat, lon, C));
  }
  if (step > 1 && ring.length) {
    const [lon, lat] = ring[ring.length - 1];
    pts.push(projectLandPoint(lat, lon, C));
  }
  const n = pts.length;
  if (n < 3) return null;

  let visCount = 0;
  for (const p of pts) if (p.visible) visCount += 1;
  if (visCount < 2) return null;

  if (visCount === n) {
    return pts.map((p) => ({ x: p.x, y: p.y, onLimb: false }));
  }

  const clipped = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.visible) clipped.push({ x: a.x, y: a.y, onLimb: false });
    if (a.visible !== b.visible) {
      clipped.push(horizonCut(a, b, C));
    }
  }
  return clipped.length >= 3 ? clipped : null;
}

function strokeLandPoly(ctx, C, poly) {
  const m = poly.length;
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < m; i += 1) {
    const prev = poly[i - 1];
    const cur = poly[i];
    if (prev.onLimb && cur.onLimb) addLimbArc(ctx, C, prev, cur);
    else ctx.lineTo(cur.x, cur.y);
  }
  const last = poly[m - 1];
  const first = poly[0];
  if (last.onLimb && first.onLimb) addLimbArc(ctx, C, last, first);
  ctx.closePath();
}

/**
 * Soft night-side wash (layered penumbra around the anti-solar point).
 * Source-over only — never destination-out (that punched holes through land).
 */
function drawDayNightShade(ctx, layout, bright, when = new Date()) {
  const { cx, cy, radius: R, lat0, lon0 } = layout;
  if (!Number.isFinite(R) || R < 8) return;
  const sun = subsolarPoint(when);
  const antiLat = -sun.lat;
  const antiLon = normalizeLon(sun.lon + 180);
  const C = {
    sinLat0: Math.sin(toRad(lat0)),
    cosLat0: Math.cos(toRad(lat0)),
    lon0: toRad(lon0),
    cx,
    cy,
    R,
  };

  // Outer → inner: light twilight fringe, then deeper night core
  const bands = bright
    ? [
        { deg: 100, fill: "rgba(28, 48, 92, 0.09)" },
        { deg: 94, fill: "rgba(22, 42, 84, 0.12)" },
        { deg: 88, fill: "rgba(18, 36, 76, 0.14)" },
        { deg: 80, fill: "rgba(14, 30, 68, 0.12)" },
      ]
    : [
        { deg: 100, fill: "rgba(4, 12, 28, 0.10)" },
        { deg: 94, fill: "rgba(2, 8, 22, 0.14)" },
        { deg: 88, fill: "rgba(0, 4, 16, 0.16)" },
        { deg: 80, fill: "rgba(0, 2, 12, 0.14)" },
      ];

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = "source-over";

  for (const { deg, fill } of bands) {
    const ring = geodesicCircleLonLat(antiLat, antiLon, deg, 72);
    const poly = clippedLandRing(ring, C, 1);
    if (!poly || poly.length < 3) continue;
    ctx.beginPath();
    strokeLandPoly(ctx, C, poly);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // Very faint terminator cue (not a hard razor line)
  const termRing = geodesicCircleLonLat(sun.lat, sun.lon, 90, 72);
  const termPoly = clippedLandRing(termRing, C, 1);
  if (termPoly && termPoly.length >= 3) {
    ctx.beginPath();
    strokeLandPoly(ctx, C, termPoly);
    ctx.strokeStyle = bright
      ? "rgba(255, 160, 70, 0.22)"
      : "rgba(150, 180, 230, 0.10)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  ctx.restore();
}

function drawLand(ctx, layout, bright, lite = false) {
  if (!landRings || !landRings.length) return;
  const { radius, cx, cy } = layout;
  const step = lite ? 4 : 1;
  const lat0 = toRad(layout.lat0);
  const C = {
    sinLat0: Math.sin(lat0),
    cosLat0: Math.cos(lat0),
    lon0: toRad(layout.lon0),
    cx,
    cy,
    R: radius,
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = bright ? "rgba(46, 110, 58, 0.92)" : "rgba(52, 88, 62, 0.88)";
  ctx.strokeStyle = bright ? "rgba(0, 40, 0, 0.65)" : "rgba(160, 200, 170, 0.5)";
  ctx.lineWidth = bright ? 0.9 : 0.85;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const ring of landRings) {
    const poly = clippedLandRing(ring, C, step);
    if (!poly) continue;
    ctx.beginPath();
    strokeLandPoly(ctx, C, poly);
    ctx.fill();
    if (!lite) ctx.stroke();
  }

  if (!lite) {
    const shade = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
    if (bright) {
      shade.addColorStop(0, "rgba(255,255,255,0.08)");
      shade.addColorStop(0.45, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.18)");
    } else {
      shade.addColorStop(0, "rgba(255,255,255,0.06)");
      shade.addColorStop(0.4, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.35)");
    }
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = shade;
    ctx.fill();
  }

  ctx.restore();
}

function formatLatLabel(lat) {
  const a = Math.abs(Math.round(lat));
  if (a === 0) return "0°";
  return lat >= 0 ? `${a}N` : `${a}S`;
}

function formatLonLabel(lon) {
  let L = ((lon + 180) % 360) - 180;
  if (L === -180) L = 180;
  const a = Math.abs(Math.round(L));
  if (a === 0) return "000°";
  const pad = String(a).padStart(3, "0");
  return L < 0 ? `${pad}W` : `${pad}E`;
}

function estimateVisibleGeo(layout, width, height) {
  const half = Math.min(width, height) * 0.5;
  const ang =
    (Math.asin(Math.min(0.999, half / Math.max(layout.radius, 1))) * 180) /
    Math.PI;
  const span = Math.max(6, ang * 2.4);
  const sample = Math.max(0.5, Math.min(2, span / 24));
  const pad = 4;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  let found = false;

  for (let lat = layout.lat0 - span; lat <= layout.lat0 + span; lat += sample) {
    if (lat < -85 || lat > 85) continue;
    for (let lon = layout.lon0 - span; lon <= layout.lon0 + span; lon += sample) {
      const p = project(lat, lon, 0, 0, layout);
      if (!p.visible) continue;
      if (p.x < -pad || p.x > width + pad || p.y < -pad || p.y > height + pad) {
        continue;
      }
      found = true;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
  }

  if (!found) {
    return {
      minLat: layout.lat0 - span / 2,
      maxLat: layout.lat0 + span / 2,
      minLon: layout.lon0 - span / 2,
      maxLon: layout.lon0 + span / 2,
      spanLat: span,
      spanLon: span,
    };
  }

  const padGeo = Math.max(1, span * 0.08);
  return {
    minLat: Math.max(-85, minLat - padGeo),
    maxLat: Math.min(85, maxLat + padGeo),
    minLon: minLon - padGeo,
    maxLon: maxLon + padGeo,
    spanLat: Math.max(2, maxLat - minLat),
    spanLon: Math.max(2, maxLon - minLon),
  };
}

function tickRange(min, max, step) {
  const start = Math.ceil(min / step) * step;
  const out = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Math.round(v / step) * step);
    if (out.length > 48) break;
  }
  return out;
}

function inCanvas(p, width, height, margin = 2) {
  return (
    p.visible &&
    p.x >= margin &&
    p.x <= width - margin &&
    p.y >= margin &&
    p.y <= height - margin
  );
}

function drawGrid(ctx, layout, bright, width, height, lite = false) {
  const { radius, cx, cy } = layout;
  const bounds = estimateVisibleGeo(layout, width, height);
  // Fixed chart lattice: parallels every 5°, meridians every 10°
  const stepLat = 5;
  const stepLon = 10;
  const lats = tickRange(bounds.minLat, bounds.maxLat, stepLat);
  const lons = tickRange(bounds.minLon, bounds.maxLon, stepLon);
  const sampleLon = lite ? 1.5 : 0.5;
  const sampleLat = lite ? 1.5 : 0.5;

  const stroke = bright ? "rgba(0, 0, 0, 0.18)" : "rgba(180, 200, 220, 0.16)";
  const labelFill = bright
    ? "rgba(0, 0, 0, 0.55)"
    : "rgba(200, 220, 235, 0.55)";

  // Grid lines (clipped to globe)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = bright ? 1 : 0.9;

  for (const lon of lons) {
    ctx.beginPath();
    let started = false;
    for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += sampleLat) {
      const p = project(lat, lon, 0, 0, layout);
      if (!p.visible) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  for (const lat of lats) {
    ctx.beginPath();
    let started = false;
    for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += sampleLon) {
      const p = project(lat, lon, 0, 0, layout);
      if (!p.visible) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (lite) return;

  // Edge labels (not clipped — sit on panel edges)
  ctx.save();
  ctx.fillStyle = labelFill;
  ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";

  ctx.textAlign = "left";
  for (const lat of lats) {
    let best = null;
    for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += sampleLon) {
      const p = project(lat, lon, 0, 0, layout);
      if (!inCanvas(p, width, height, 6)) continue;
      if (!best || p.x < best.x) best = p;
    }
    if (!best) continue;
    ctx.fillText(formatLatLabel(lat), 5, best.y);
  }

  ctx.textAlign = "center";
  for (const lon of lons) {
    let best = null;
    for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += sampleLat) {
      const p = project(lat, lon, 0, 0, layout);
      if (!inCanvas(p, width, height, 6)) continue;
      if (!best || p.y > best.y) best = p;
    }
    if (!best) continue;
    ctx.fillText(formatLonLabel(lon), best.x, height - 8);
  }
  ctx.restore();
}

function drawPolyline(ctx, layout, points, style) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.width;
  ctx.setLineDash(style.dash || []);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  let started = false;
  for (const w of points) {
    const p = project(w.lat, w.lon, 0, 0, layout);
    if (!p.visible) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Point on a track nearest 030°W (classic NAT mid-ocean label longitude). */
function natTrackPointNear30W(pts) {
  let best = pts[0];
  let bestDist = Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p?.lon)) continue;
    const d = Math.abs(p.lon - -30);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function drawNatTrackId(ctx, layout, id, pt, color, ox, oy) {
  if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) return;
  const p = project(pt.lat, pt.lon, 0, 0, layout);
  if (!p.visible) return;
  ctx.fillStyle = color;
  ctx.fillText(id, p.x + ox, p.y + oy);
}

function drawNatTracks(ctx, layout, tracks, lite = false) {
  if (!tracks || !tracks.length) return;
  if (!lite) {
    ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  }
  for (const track of tracks) {
    const pts = track.points || [];
    if (pts.length < 2) continue;
    const color = track.color || "rgba(255, 180, 120, 0.9)";
    drawPolyline(ctx, layout, pts, {
      stroke: color,
      width: 1.7,
      dash: [6, 5],
    });
    if (lite) continue;

    const entry = pts[0];
    const exit = pts[pts.length - 1];
    const mid30 = natTrackPointNear30W(pts);

    // Entry / ~030°W / exit — same letter, slight offsets so they stay readable
    drawNatTrackId(ctx, layout, track.id, entry, color, 5, -5);
    if (mid30 !== entry && mid30 !== exit) {
      drawNatTrackId(ctx, layout, track.id, mid30, color, 4, -4);
    }
    drawNatTrackId(ctx, layout, track.id, exit, color, 5, -5);
  }
}

/**
 * Jeppesen-style civil airport mark: blue gear ring + centre dot + ICAO label.
 * Matches common NAT plotting-chart symbology (e.g. LPLA / LPAZ).
 */
function drawAirportGear(ctx, x, y, color, scale = 1) {
  const R = 7.2 * scale;
  const teeth = 14;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.35 * scale;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Scalloped / gear outer ring
  ctx.beginPath();
  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? R : R * 0.78;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // Inner circle
  ctx.beginPath();
  ctx.arc(x, y, R * 0.52, 0, Math.PI * 2);
  ctx.stroke();

  // Centre fill
  ctx.beginPath();
  ctx.arc(x, y, 1.7 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rectsOverlap(a, b, pad = 2) {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function labelBox(anchorX, anchorY, dx, dy, align, lines, metrics) {
  const w = Math.max(...lines.map((t, i) => metrics[i]));
  const h = lines.length * 11;
  const x = align === "right" ? anchorX + dx - w : anchorX + dx;
  const y = anchorY + dy;
  return { x, y, w, h };
}

/**
 * Place ICAO + multi-line runway labels with collision avoidance.
 * Tries several offsets around each airport symbol.
 * @returns {{x:number,y:number,w:number,h:number}[]} occupied label/icon boxes for other layers
 */
function drawDiversionAirports(
  ctx,
  layout,
  bright,
  width,
  height,
  showRwyLabels = true,
  lite = false,
  include747 = false,
  highlightDatis = false
) {
  const color = bright ? "#0057b8" : "rgba(100, 190, 255, 0.95)";
  const datisColor = bright ? "#0a7a32" : "rgba(72, 210, 120, 0.98)";
  const labelFill = bright ? "#003d7a" : "rgba(160, 220, 255, 0.95)";
  const rwyFill = bright ? "rgba(0, 61, 122, 0.78)" : "rgba(160, 220, 255, 0.75)";
  const halo = bright ? "rgba(255,255,255,0.85)" : "rgba(8,20,30,0.75)";
  const leader = bright ? "rgba(0, 61, 122, 0.45)" : "rgba(140, 200, 240, 0.45)";
  const gearColorFor = (icao) =>
    highlightDatis && hasDigitalAtis(icao) ? datisColor : color;

  const icaoFont = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const rwyFont = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  const includeRwys = !lite && showRwyLabels !== false;

  const offsets = [
    { dx: 10, dy: -4, align: "left" },
    { dx: -10, dy: -4, align: "right" },
    { dx: 10, dy: 10, align: "left" },
    { dx: -10, dy: 10, align: "right" },
    { dx: 12, dy: -26, align: "left" },
    { dx: -12, dy: -26, align: "right" },
    { dx: 12, dy: 22, align: "left" },
    { dx: -12, dy: 22, align: "right" },
    { dx: 28, dy: -8, align: "left" },
    { dx: -28, dy: -8, align: "right" },
    { dx: 18, dy: -40, align: "left" },
    { dx: -18, dy: -40, align: "right" },
    { dx: 18, dy: 34, align: "left" },
    { dx: -18, dy: 34, align: "right" },
  ];

  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

  const airports = airportsForChart(include747);

  // Interaction frames: symbols only (collision labels are expensive)
  if (lite) {
    for (const ap of airports) {
      const p = project(ap.lat, ap.lon, 0, 0, layout);
      if (!inCanvas(p, width, height, 4)) continue;
      drawAirportGear(ctx, p.x, p.y, gearColorFor(ap.icao), 1);
    }
    ctx.restore();
    return [];
  }

  /** @type {{ap:any,x:number,y:number,lines:string[],metrics:number[],nn:number}[]} */
  const visible = [];
  for (const ap of airports) {
    const p = project(ap.lat, ap.lon, 0, 0, layout);
    if (!inCanvas(p, width, height, 4)) continue;
    const rwys = includeRwys ? runwayLabels(ap, RWY_LABEL_MIN_M) : [];
    const lines = [ap.icao, ...rwys];
    ctx.font = icaoFont;
    const metrics = lines.map((t, i) => {
      ctx.font = i === 0 ? icaoFont : rwyFont;
      return ctx.measureText(t).width;
    });
    visible.push({ ap, x: p.x, y: p.y, lines, metrics, nn: 0 });
  }

  // Prefer labeling denser clusters first (harder placements)
  for (const a of visible) {
    let best = Infinity;
    for (const b of visible) {
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < best) best = d;
    }
    a.nn = best;
  }
  visible.sort((a, b) => a.nn - b.nn);

  /** @type {{x:number,y:number,w:number,h:number}[]} */
  const occupied = [];
  // Reserve icon footprints
  for (const v of visible) {
    occupied.push({ x: v.x - 9, y: v.y - 9, w: 18, h: 18 });
  }

  /** @type {{v:any, box:any, off:any}[]} */
  const placed = [];

  for (const v of visible) {
    let chosen = null;
    let bestScore = Infinity;
    for (const off of offsets) {
      const box = labelBox(v.x, v.y, off.dx, off.dy, off.align, v.lines, v.metrics);
      // Keep mostly on canvas
      if (box.x < 2 || box.y < 2 || box.x + box.w > width - 2 || box.y + box.h > height - 2) {
        continue;
      }
      let hits = 0;
      for (const o of occupied) {
        if (rectsOverlap(box, o, 3)) hits += 1;
      }
      if (hits === 0) {
        chosen = { box, off };
        break;
      }
      if (hits < bestScore) {
        bestScore = hits;
        chosen = { box, off };
      }
    }
    if (!chosen) {
      const off = offsets[0];
      chosen = {
        box: labelBox(v.x, v.y, off.dx, off.dy, off.align, v.lines, v.metrics),
        off,
      };
    }
    occupied.push(chosen.box);
    placed.push({ v, box: chosen.box, off: chosen.off });
  }

  // Symbols (green gear = confirmed D-ATIS)
  for (const v of visible) {
    drawAirportGear(ctx, v.x, v.y, gearColorFor(v.ap.icao), 1);
  }

  // Leaders + labels
  ctx.textBaseline = "top";
  ctx.lineWidth = 2.4;
  for (const { v, box, off } of placed) {
    const attachX = off.align === "right" ? box.x + box.w : box.x;
    const attachY = box.y + Math.min(6, box.h / 2);
    if (Math.hypot(off.dx, off.dy) > 14) {
      ctx.strokeStyle = leader;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.lineTo(attachX, attachY);
      ctx.stroke();
      ctx.lineWidth = 2.4;
    }

    ctx.textAlign = off.align === "right" ? "right" : "left";
    const tx = off.align === "right" ? box.x + box.w : box.x;
    let ty = box.y;
    v.lines.forEach((line, i) => {
      ctx.font = i === 0 ? icaoFont : rwyFont;
      ctx.fillStyle = i === 0 ? labelFill : rwyFill;
      ctx.strokeStyle = halo;
      ctx.strokeText(line, tx, ty);
      ctx.fillText(line, tx, ty);
      ty += 11;
    });
  }

  ctx.restore();
  return occupied;
}

/**
 * Green OAC FIR lines + OTAs + adjacent domestic FIRs (CPDLC codes).
 * @param {{lite?:boolean, skipLabels?:boolean, skipLines?:boolean, occupied?:{x:number,y:number,w:number,h:number}[], width?:number, height?:number}} [opts]
 */
function drawOac(ctx, layout, bright, opts = {}) {
  const lite = opts.lite === true || opts === true; // legacy: drawOac(..., lite)
  const skipLabels = opts.skipLabels === true;
  const skipLines = opts.skipLines === true;
  const occupied = Array.isArray(opts.occupied) ? opts.occupied : [];
  const width = opts.width || 0;
  const height = opts.height || 0;

  const stroke = bright ? "rgba(20, 110, 50, 0.5)" : "rgba(90, 200, 120, 0.45)";
  const otaStroke = bright ? "#0a7a35" : "rgba(90, 235, 140, 0.95)";
  const domesticStroke = bright ? "rgba(20, 90, 140, 0.45)" : "rgba(120, 200, 230, 0.4)";
  const fill = bright ? "rgba(16, 90, 40, 0.7)" : "rgba(140, 230, 160, 0.9)";
  const otaFill = bright ? "rgba(10, 120, 50, 0.16)" : "rgba(70, 200, 110, 0.16)";
  const otaLabel = bright ? "#0a6e30" : "rgba(160, 255, 180, 0.95)";

  const airspaceOffsets = [
    { dx: 0, dy: 0 },
    { dx: 0, dy: -14 },
    { dx: 0, dy: 14 },
    { dx: 18, dy: 0 },
    { dx: -18, dy: 0 },
    { dx: 16, dy: -12 },
    { dx: -16, dy: -12 },
    { dx: 16, dy: 12 },
    { dx: -16, dy: 12 },
    { dx: 28, dy: -6 },
    { dx: -28, dy: -6 },
    { dx: 0, dy: -26 },
    { dx: 0, dy: 26 },
    { dx: 34, dy: 10 },
    { dx: -34, dy: 10 },
  ];

  function measureAirspaceLabel(code, bold) {
    const longName = code.length > 5 && !bold;
    const thinFont = longName
      ? "300 10px ui-monospace, SFMono-Regular, Menlo, monospace"
      : "300 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    const boldFont = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    const normalFont = longName
      ? "700 10px ui-monospace, SFMono-Regular, Menlo, monospace"
      : "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    const gap = 5;
    let w;
    if (bold) {
      ctx.font = thinFont;
      const wThin = ctx.measureText(code).width;
      ctx.font = boldFont;
      w = wThin + gap + ctx.measureText(bold).width;
    } else {
      ctx.font = normalFont;
      w = ctx.measureText(code).width;
    }
    return { w, h: 14, thinFont, boldFont, normalFont, gap };
  }

  function pickAirspaceSpot(ax, ay, w, h) {
    let best = null;
    let bestHits = Infinity;
    for (const off of airspaceOffsets) {
      const box = {
        x: ax + off.dx - w / 2,
        y: ay + off.dy - h / 2,
        w,
        h,
      };
      if (
        width > 0 &&
        height > 0 &&
        (box.x < 2 ||
          box.y < 2 ||
          box.x + box.w > width - 2 ||
          box.y + box.h > height - 2)
      ) {
        continue;
      }
      let hits = 0;
      for (const o of occupied) {
        if (rectsOverlap(box, o, 4)) hits += 1;
      }
      if (hits === 0) return { box, dx: off.dx, dy: off.dy };
      if (hits < bestHits) {
        bestHits = hits;
        best = { box, dx: off.dx, dy: off.dy };
      }
    }
    return (
      best || {
        box: { x: ax - w / 2, y: ay - h / 2, w, h },
        dx: 0,
        dy: 0,
      }
    );
  }

  if (!skipLines) {
    for (const seg of OAC_SEGMENTS) {
      drawPolyline(ctx, layout, seg, {
        stroke,
        width: bright ? 1.6 : 1.5,
        dash: [],
      });
    }

    for (const seg of DOMESTIC_FIR_SEGMENTS) {
      drawPolyline(ctx, layout, seg, {
        stroke: domesticStroke,
        width: bright ? 1.5 : 1.4,
        dash: [6, 5],
      });
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

  if (!skipLines) {
    for (const area of OTA_AREAS) {
      const ring = area.ring || [];
      if (ring.length < 3) continue;
      ctx.beginPath();
      let started = false;
      for (const w of ring) {
        const p = project(w.lat, w.lon, 0, 0, layout);
        if (!p.visible) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = otaFill;
      ctx.fill();
      ctx.strokeStyle = bright ? "rgba(255,255,255,0.7)" : "rgba(8,20,30,0.5)";
      ctx.lineWidth = bright ? 3 : 2.8;
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.strokeStyle = otaStroke;
      ctx.lineWidth = bright ? 2 : 1.9;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (!lite && !skipLabels) {
    ctx.textBaseline = "middle";

    // Oceanic OAC codes (optional boldCode, e.g. KZMA + KUSA)
    ctx.fillStyle = fill;
    for (const lab of OAC_LABELS) {
      const p = project(lab.lat, lab.lon, 0, 0, layout);
      if (!p.visible) continue;
      const code = String(lab.code || "");
      const bold = lab.boldCode ? String(lab.boldCode) : "";
      const m = measureAirspaceLabel(code, bold);
      const spot = pickAirspaceSpot(p.x, p.y, m.w, m.h);
      occupied.push(spot.box);
      const cx = p.x + spot.dx;
      const cy = p.y + spot.dy;
      ctx.strokeStyle = bright ? "rgba(255,255,255,0.85)" : "rgba(8,20,30,0.7)";
      ctx.lineWidth = 3;
      if (bold) {
        ctx.textAlign = "left";
        ctx.font = m.thinFont;
        const wThin = ctx.measureText(code).width;
        const x0 = cx - m.w / 2;
        ctx.strokeText(code, x0, cy);
        ctx.fillText(code, x0, cy);
        ctx.font = m.boldFont;
        ctx.strokeText(bold, x0 + wThin + m.gap, cy);
        ctx.fillText(bold, x0 + wThin + m.gap, cy);
      } else {
        ctx.textAlign = "center";
        ctx.font = m.normalFont;
        ctx.strokeText(code, cx, cy);
        ctx.fillText(code, cx, cy);
      }
    }

    // OTA labels
    ctx.textAlign = "center";
    ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = otaLabel;
    for (const area of OTA_AREAS) {
      const p = project(area.label.lat, area.label.lon, 0, 0, layout);
      if (!p.visible) continue;
      const id = String(area.id || "");
      const w = ctx.measureText(id).width;
      const spot = pickAirspaceSpot(p.x, p.y, w, 14);
      occupied.push(spot.box);
      const cx = p.x + spot.dx;
      const cy = p.y + spot.dy;
      ctx.strokeStyle = bright ? "rgba(255,255,255,0.9)" : "rgba(8,20,30,0.75)";
      ctx.lineWidth = 3.2;
      ctx.strokeText(id, cx, cy);
      ctx.fillText(id, cx, cy);
    }

    // Domestic FIR codes
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = fill;
    for (const lab of DOMESTIC_FIR_LABELS) {
      const p = project(lab.lat, lab.lon, 0, 0, layout);
      if (!p.visible) continue;
      const code = String(lab.code || "");
      const w = ctx.measureText(code).width;
      const spot = pickAirspaceSpot(p.x, p.y, w, 14);
      occupied.push(spot.box);
      const cx = p.x + spot.dx;
      const cy = p.y + spot.dy;
      ctx.strokeStyle = bright ? "rgba(255,255,255,0.85)" : "rgba(8,20,30,0.7)";
      ctx.lineWidth = 3;
      ctx.strokeText(code, cx, cy);
      ctx.fillText(code, cx, cy);
    }
  }
  ctx.restore();
}

function pathRing(ctx, layout, ring) {
  let started = false;
  for (const w of ring || []) {
    const p = project(w.lat, w.lon, 0, 0, layout);
    if (!p.visible) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else ctx.lineTo(p.x, p.y);
  }
  return started;
}

function ringCentroid(ring) {
  if (!ring?.length) return null;
  let lat = 0;
  let lon = 0;
  for (const p of ring) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

const WX_LABEL_OFFSETS = [
  { dx: 8, dy: -2, align: "left" },
  { dx: -8, dy: -2, align: "right" },
  { dx: 8, dy: 12, align: "left" },
  { dx: -8, dy: 12, align: "right" },
  { dx: 14, dy: -16, align: "left" },
  { dx: -14, dy: -16, align: "right" },
  { dx: 22, dy: 4, align: "left" },
  { dx: -22, dy: 4, align: "right" },
  { dx: 0, dy: -20, align: "left" },
  { dx: 0, dy: 18, align: "left" },
];

function pickWxLabelSpot(occupied, ax, ay, w, h, width, height) {
  let best = null;
  let bestHits = Infinity;
  for (const off of WX_LABEL_OFFSETS) {
    const x = off.align === "right" ? ax + off.dx - w : ax + off.dx;
    const y = ay + off.dy - h / 2;
    const box = { x, y, w, h };
    if (
      width > 0 &&
      height > 0 &&
      (box.x < 2 ||
        box.y < 2 ||
        box.x + box.w > width - 2 ||
        box.y + box.h > height - 2)
    ) {
      continue;
    }
    let hits = 0;
    for (const o of occupied) {
      if (rectsOverlap(box, o, 3)) hits += 1;
    }
    if (hits === 0) return { box, align: off.align };
    if (hits < bestHits) {
      bestHits = hits;
      best = { box, align: off.align };
    }
  }
  return (
    best || {
      box: { x: ax + 8, y: ay - h / 2, w, h },
      align: "left",
    }
  );
}

function drawWxLabel(ctx, occupied, ax, ay, text, fill, halo, width, height) {
  if (!text) return;
  const w = ctx.measureText(text).width;
  const h = 12;
  const spot = pickWxLabelSpot(occupied, ax, ay, w, h, width, height);
  ctx.textAlign = spot.align === "right" ? "right" : "left";
  const tx =
    spot.align === "right" ? spot.box.x + spot.box.w : spot.box.x;
  const ty = spot.box.y + h / 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, tx, ty);
  ctx.fillStyle = fill;
  ctx.fillText(text, tx, ty);
  occupied.push(spot.box);
}

function drawRadarDetail(ctx, layout, radar, lite, width, height) {
  const tiles = radar?.tiles;
  if (!tiles?.length || lite) return;
  const half = Math.min(width || 1, height || 1) * 0.5;
  const ang =
    (Math.asin(Math.min(0.999, half / Math.max(layout.radius, 1))) * 180) /
    Math.PI;
  // Match weather.js regional gate — no radar on full-globe disc
  if (ang > 48) return;
  // Scale pixel size with zoom so intensity reads clearly (MPilot-like blocks)
  const cell = Math.max(3.2, Math.min(8, (layout.radius / half) * 2.4));
  const step = cell >= 5 ? 2 : 1;
  for (const tile of tiles) {
    const { data, w, h } = tile;
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const i = (py * w + px) * 4;
        const a = data[i + 3];
        if (a < 28) continue;
        const lon = ((tile.x + px / w) / 2 ** tile.z) * 360 - 180;
        const n = Math.PI - (2 * Math.PI * (tile.y + py / h)) / 2 ** tile.z;
        const lat =
          (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        const p = project(lat, lon, 0, 0, layout);
        if (!p.visible) continue;
        if (width && height && !inCanvas(p, width, height, 0)) continue;
        ctx.fillStyle = `rgba(${data[i]},${data[i + 1]},${data[i + 2]},${Math.min(0.92, (a / 255) * 0.95)})`;
        ctx.fillRect(p.x - cell / 2, p.y - cell / 2, cell, cell);
      }
    }
  }
}

function drawVolcanoIcon(ctx, x, y, bright) {
  ctx.save();
  // Cone
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x - 7, y + 5);
  ctx.lineTo(x + 7, y + 5);
  ctx.closePath();
  ctx.fillStyle = bright ? "#6b3a12" : "rgba(220, 140, 70, 0.95)";
  ctx.strokeStyle = bright ? "#ffffff" : "rgba(20, 10, 10, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  // Crater notch
  ctx.beginPath();
  ctx.moveTo(x - 2.2, y - 5);
  ctx.lineTo(x, y - 2);
  ctx.lineTo(x + 2.2, y - 5);
  ctx.strokeStyle = bright ? "#3a1a08" : "rgba(40, 15, 5, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Ash puff
  ctx.beginPath();
  ctx.arc(x - 1.5, y - 10, 2.2, 0, Math.PI * 2);
  ctx.arc(x + 2, y - 11.5, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = bright ? "rgba(80, 80, 80, 0.55)" : "rgba(200, 200, 210, 0.55)";
  ctx.fill();
  ctx.restore();
}

/**
 * Text SIGMETs (Storms+SIGMET) + optional radar pixels (Live TS) + storm/volcano marks.
 * @param {{ occupied?: {x:number,y:number,w:number,h:number}[], width?: number, height?: number, radar?: object }} [opts]
 */
function drawWeatherLayers(ctx, layout, bright, lite, stormSystems, opts = {}) {
  const sigmets = stormSystems?.sigmets || [];
  const storms = stormSystems?.storms || [];
  const volcanoes = stormSystems?.volcanoes || [];
  const radar = opts.radar;
  const occupied = Array.isArray(opts.occupied) ? opts.occupied : [];
  const width = opts.width || 0;
  const height = opts.height || 0;
  if (
    !sigmets.length &&
    !storms.length &&
    !volcanoes.length &&
    !radar?.tiles?.length
  ) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

  const hasRadar = !!(radar?.tiles?.length);
  const isThunderPoly = (poly) => {
    const haz = String(poly.hazard || "").toUpperCase();
    const raw = String(poly.raw || "").toUpperCase();
    return (
      haz === "TS" ||
      haz === "CONVECTIVE" ||
      raw.includes("THUNDER") ||
      raw.includes("CONVECTIVE") ||
      /\bTS\b/.test(raw)
    );
  };
  const thunder = [];
  const other = [];
  for (const poly of sigmets) {
    if (isThunderPoly(poly)) thunder.push(poly);
    else other.push(poly);
  }

  const drawPolys = (list, fill, stroke, dash, lineWidth) => {
    for (const poly of list) {
      for (const ring of poly.rings || []) {
        ctx.beginPath();
        if (!pathRing(ctx, layout, ring)) continue;
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };

  // Non-convective / VA text SIGMETs (amber)
  drawPolys(
    other,
    bright ? "rgba(180, 110, 20, 0.10)" : "rgba(255, 180, 60, 0.12)",
    bright ? "rgba(140, 80, 10, 0.65)" : "rgba(255, 190, 80, 0.7)",
    [5, 4],
    bright ? 1.4 : 1.3
  );

  // Convective text SIGMETs (rose) — on Storms+SIGMET; light fill when radar is on
  drawPolys(
    thunder,
    hasRadar
      ? bright
        ? "rgba(160, 40, 90, 0.04)"
        : "rgba(255, 90, 140, 0.05)"
      : bright
        ? "rgba(160, 40, 90, 0.10)"
        : "rgba(255, 90, 140, 0.12)",
    bright ? "rgba(130, 20, 70, 0.7)" : "rgba(255, 120, 160, 0.8)",
    [4, 3],
    bright ? 1.5 : 1.4
  );

  // Live TS = regional radar intensity only
  drawRadarDetail(ctx, layout, radar, lite, width, height);

  if (!lite) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    const stormFill = bright ? "#5a1010" : "rgba(255, 200, 180, 0.95)";
    const stormHalo = bright ? "rgba(255,255,255,0.85)" : "rgba(10,10,20,0.75)";
    const sigFill = bright ? "#6a3a00" : "rgba(255, 220, 140, 0.95)";
    const tsFill = bright ? "#6a1040" : "rgba(255, 180, 210, 0.95)";
    const volFill = bright ? "#5a2a08" : "rgba(255, 200, 140, 0.95)";

    for (const s of storms) {
      const p = project(s.lat, s.lon, 0, 0, layout);
      if (!p.visible) continue;
      if (width && height && !inCanvas(p, width, height, 4)) continue;
      ctx.beginPath();
      ctx.fillStyle = bright ? "#8b1a1a" : "rgba(255, 120, 100, 0.95)";
      ctx.strokeStyle = bright ? "#ffffff" : "rgba(20, 10, 10, 0.8)";
      ctx.lineWidth = 2;
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      occupied.push({ x: p.x - 6, y: p.y - 6, w: 12, h: 12 });
      if (Number.isFinite(s.movementDir)) {
        const rad = ((s.movementDir - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.strokeStyle = bright ? "#8b1a1a" : "rgba(255, 160, 120, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(rad) * 14, p.y + Math.sin(rad) * 14);
        ctx.stroke();
      }
      const label = `${s.name}${s.classification ? " " + s.classification : ""}`;
      drawWxLabel(ctx, occupied, p.x, p.y, label, stormFill, stormHalo, width, height);
    }

    for (const v of volcanoes) {
      const p = project(v.lat, v.lon, 0, 0, layout);
      if (!p.visible) continue;
      if (width && height && !inCanvas(p, width, height, 6)) continue;
      drawVolcanoIcon(ctx, p.x, p.y, bright);
      occupied.push({ x: p.x - 8, y: p.y - 12, w: 16, h: 20 });
      drawWxLabel(
        ctx,
        occupied,
        p.x,
        p.y,
        String(v.name || "VA").slice(0, 16),
        volFill,
        stormHalo,
        width,
        height
      );
    }

    const labelCandidates = [];
    const seenLabel = new Set(
      volcanoes.map((v) =>
        String(v.name || "")
          .toUpperCase()
          .replace(/\s+/g, " ")
          .trim()
      )
    );
    const pushLabel = (poly, fill, halo) => {
      const haz = String(poly.hazard || "").toUpperCase();
      const raw = String(poly.raw || "").toUpperCase();
      const isVa =
        haz === "VA" ||
        /\bVA\b/.test(raw) ||
        raw.includes("VOLCANIC ASH") ||
        raw.includes("ERUPTION MT");
      if (isVa && volcanoes.length) return;
      const text = String(poly.label || poly.hazard || "SIGMET")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 14);
      if (!text || seenLabel.has(text)) return;
      const c = ringCentroid(poly.rings?.[0]);
      if (!c) return;
      const p = project(c.lat, c.lon, 0, 0, layout);
      if (!p.visible) return;
      if (width && height && !inCanvas(p, width, height, 8)) return;
      seenLabel.add(text);
      labelCandidates.push({
        p,
        text,
        fill,
        halo,
        d: Math.hypot(p.x - layout.cx, p.y - layout.cy),
      });
    };
    for (const poly of thunder) pushLabel(poly, tsFill, stormHalo);
    for (const poly of other) pushLabel(poly, sigFill, stormHalo);
    labelCandidates.sort((a, b) => a.d - b.d);
    const maxLabels = 12;
    for (let i = 0; i < labelCandidates.length && i < maxLabels; i += 1) {
      const L = labelCandidates[i];
      drawWxLabel(ctx, occupied, L.p.x, L.p.y, L.text, L.fill, L.halo, width, height);
    }
  }

  ctx.restore();
}

function pointInRing(lat, lon, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const xi = ring[i].lon;
    const yj = ring[j].lat;
    const xj = ring[j].lon;
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPoly(lat, lon, poly) {
  for (const ring of poly?.rings || []) {
    if (pointInRing(lat, lon, ring)) return true;
  }
  return false;
}

/**
 * Inverse orthographic: canvas pixel → lat/lon (front hemisphere only).
 */
export function unproject(x, y, layout) {
  if (!layout) return null;
  const R = layout.radius;
  const dx = (x - layout.cx) / R;
  const dy = (layout.cy - y) / R;
  const rho2 = dx * dx + dy * dy;
  if (rho2 > 1) return null;
  const rho = Math.sqrt(rho2);
  const c = Math.asin(Math.min(1, rho));
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const lat0 = toRad(layout.lat0);
  const lon0 = toRad(layout.lon0);
  if (rho < 1e-9) {
    return { lat: layout.lat0, lon: layout.lon0 };
  }
  const lat = Math.asin(
    cosC * Math.sin(lat0) + (dy * sinC * Math.cos(lat0)) / rho
  );
  const lon =
    lon0 +
    Math.atan2(
      dx * sinC,
      rho * Math.cos(lat0) * cosC - dy * Math.sin(lat0) * sinC
    );
  return { lat: (lat * 180) / Math.PI, lon: (((lon * 180) / Math.PI + 540) % 360) - 180 };
}

/**
 * Nearest / containing weather advisory under a canvas point.
 * @returns {object|null}
 */
export function hitTestWeather(layout, x, y, stormSystems) {
  if (!layout) return null;

  // Prefer volcano icon tap (small target)
  for (const v of stormSystems?.volcanoes || []) {
    const p = project(v.lat, v.lon, 0, 0, layout);
    if (!p.visible) continue;
    if (Math.hypot(p.x - x, p.y - y) <= 22) return v;
  }

  const ll = unproject(x, y, layout);
  if (!ll) return null;
  const candidates = [];
  for (const poly of stormSystems?.sigmets || []) {
    if (pointInPoly(ll.lat, ll.lon, poly)) candidates.push(poly);
  }
  if (!candidates.length) return null;
  // Prefer smallest area (most specific box)
  let best = candidates[0];
  let bestArea = Infinity;
  for (const poly of candidates) {
    const ring = poly.rings?.[0];
    if (!ring?.length) continue;
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    for (const p of ring) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
    const area = Math.max(0.01, maxLat - minLat) * Math.max(0.01, maxLon - minLon);
    if (area < bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return best;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ route: any[], natTracks?: any[], bright?: boolean, showNatTracks?: boolean, zoom?: number, pan?: {dLat?:number,dLon?:number}, lite?: boolean, stormSystems?: object, liveRadar?: object }} data
 */
export function drawChart(canvas, data) {
  const lite = data.lite === true;
  // Cap DPR for fill-rate; keep stable across lite/full so the buffer is not reallocated mid-gesture
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const bw = Math.max(1, Math.floor(width * dpr));
  const bh = Math.max(1, Math.floor(height * dpr));
  // Avoid clearing/reallocating the buffer when size is unchanged
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bright =
    data.bright === true ||
    document.documentElement.classList.contains("theme-bright");

  const focusPoints = [];
  for (const w of data.route || []) {
    if (w && Number.isFinite(w.lat) && Number.isFinite(w.lon)) {
      focusPoints.push({ lat: w.lat, lon: w.lon });
    }
  }
  if (!focusPoints.length && data.gcPlan?.points?.length) {
    // Frame the great-circle arc (not just endpoints) so long GCs stay in view
    const pts = data.gcPlan.points;
    const step = Math.max(1, Math.floor(pts.length / 24));
    for (let i = 0; i < pts.length; i += step) {
      const p = pts[i];
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
        focusPoints.push({ lat: p.lat, lon: p.lon });
      }
    }
    const last = pts[pts.length - 1];
    if (last && Number.isFinite(last.lat) && Number.isFinite(last.lon)) {
      focusPoints.push({ lat: last.lat, lon: last.lon });
    }
  }
  if (!focusPoints.length && data.gcFocusAirports?.length) {
    for (const end of data.gcFocusAirports) {
      if (end && Number.isFinite(end.lat) && Number.isFinite(end.lon)) {
        focusPoints.push({ lat: end.lat, lon: end.lon });
      }
    }
  }
  const layout = globeLayout(
    width,
    height,
    focusPoints,
    data.zoom ?? 1,
    data.pan || { dLat: 0, dLon: 0 }
  );

  drawGlobeBase(ctx, layout, bright, width, height);
  drawLand(ctx, layout, bright, lite);
  drawGrid(ctx, layout, bright, width, height, lite);
  // Day/night under airspace / weather / routes so those stay sharp
  if (!lite && data.showDayNight !== false) {
    drawDayNightShade(
      ctx,
      layout,
      bright,
      data.now instanceof Date ? data.now : new Date()
    );
  }
  // Airspace lines under airports; labels after so they can dodge ICAO text
  if (data.showAirspace !== false) {
    drawOac(ctx, layout, bright, {
      lite,
      skipLabels: true,
      // During gesture, skip heavy FIR polylines too
      skipLines: lite,
      width,
      height,
    });
  }
  const airportBoxes = drawDiversionAirports(
    ctx,
    layout,
    bright,
    width,
    height,
    data.showRwyLabels !== false,
    lite,
    data.show747Airports === true,
    data.highlightDatis === true
  );
  if (data.showAirspace !== false && !lite) {
    drawOac(ctx, layout, bright, {
      lite,
      skipLines: true,
      occupied: airportBoxes,
      width,
      height,
    });
  }

  // Skip weather while gesturing — biggest fill-rate cost after land
  if (!lite && (data.stormSystems || data.liveRadar)) {
    drawWeatherLayers(ctx, layout, bright, lite, data.stormSystems, {
      occupied: airportBoxes,
      width,
      height,
      radar: data.liveRadar,
    });
  }

  if (data.showNatTracks !== false) {
    drawNatTracks(ctx, layout, data.natTracks || [], lite);
  }

  const gcPlan = data.gcPlan;
  if (gcPlan?.points?.length >= 2) {
    drawPolyline(ctx, layout, gcPlan.points, {
      stroke: bright ? "#8b3a00" : "#ff9a3c",
      width: bright ? 2.5 : 2.2,
      dash: [7, 5],
    });
    for (const end of [gcPlan.dep, gcPlan.arr]) {
      if (!end || !Number.isFinite(end.lat)) continue;
      const p = project(end.lat, end.lon, 0, 0, layout);
      if (!p.visible || !inCanvas(p, width, height, 2)) continue;
      ctx.beginPath();
      ctx.fillStyle = bright ? "#8b3a00" : "#ffb040";
      ctx.strokeStyle = bright ? "#ffffff" : "#0d1b2a";
      ctx.lineWidth = 2;
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!lite && end.icao) {
        ctx.fillStyle = bright ? "#000000" : "rgba(255, 220, 180, 0.95)";
        ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(end.icao, p.x + 7, p.y - 7);
      }
    }
  }

  /* Filed route vs first→last GC (under solid route so route stays on top) */
  const gcCompare = data.gcCompare;
  if (gcCompare?.points?.length >= 2) {
    drawPolyline(ctx, layout, gcCompare.points, {
      stroke: bright ? "#1f7a45" : "#8fd9a8",
      width: bright ? 2.2 : 2,
      dash: [6, 5],
    });
  }

  const route = data.route || [];
  if (route.length >= 2) {
    drawPolyline(ctx, layout, route, {
      stroke: bright ? "#003d7a" : "#5cc8d8",
      width: bright ? 3 : 2.5,
      dash: [],
    });
  }

  route.forEach((w, i) => {
    const p = project(w.lat, w.lon, 0, 0, layout);
    if (!p.visible) return;
    ctx.beginPath();
    ctx.fillStyle =
      i === 0 || i === route.length - 1
        ? bright
          ? "#8b0000"
          : "#f0c040"
        : bright
          ? "#000000"
          : "#ffffff";
    ctx.strokeStyle = bright ? "#ffffff" : "#0d1b2a";
    ctx.lineWidth = bright ? 2 : 1.5;
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = bright ? "#000000" : "rgba(240, 245, 250, 0.95)";
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(w.name, p.x + 7, p.y - 7);
  });

  /* Ownship is painted on #chart-ownship so GPS updates do not redraw the globe */
  return { ...layout, width, height };
}

/**
 * Nearest chart airport to a canvas-local point (for GC DEP/DEST tap).
 * @returns {{icao:string,lat:number,lon:number}|null}
 */
export function hitTestChartAirport(
  layout,
  x,
  y,
  width,
  height,
  maxPx = 28,
  include747 = false
) {
  if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  let best = null;
  let bestD = maxPx;
  for (const ap of airportsForChart(include747)) {
    const p = project(ap.lat, ap.lon, 0, 0, layout);
    if (!p.visible || !inCanvas(p, width, height, 4)) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      bestD = d;
      best = ap;
    }
  }
  return best;
}

/**
 * Transparent overlay canvas: clear + redraw ownship only (GPS apps pattern).
 * Base globe stays untouched so fixes never blink the map.
 */
export function paintOwnshipOverlay(canvas, layout, ownship, bright) {
  if (!canvas || !layout) return;
  const width = layout.width;
  const height = layout.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.max(1, Math.floor(width * dpr));
  const bh = Math.max(1, Math.floor(height * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  drawOwnship(ctx, layout, ownship, bright, width, height);
}

/**
 * Device GPS position: accuracy ring + heading arrow (or dot if no heading).
 * @param {{ lat:number, lon:number, accuracy?:number, heading?:number|null }|null|undefined} ownship
 */
function drawOwnship(ctx, layout, ownship, bright, width, height) {
  if (!ownship || !Number.isFinite(ownship.lat) || !Number.isFinite(ownship.lon)) {
    return;
  }
  const p = project(ownship.lat, ownship.lon, 0, 0, layout);
  if (!inCanvas(p, width, height, 2)) return;

  const fill = bright ? "#c45a00" : "#ffb040";
  const stroke = bright ? "#ffffff" : "#0d1b2a";
  const ring = bright ? "rgba(196, 90, 0, 0.22)" : "rgba(255, 176, 64, 0.28)";

  // Approximate accuracy circle (metres → screen px via 1° latitude)
  const accM = Number(ownship.accuracy);
  if (Number.isFinite(accM) && accM > 0 && accM < 500000) {
    const dLat = accM / 111320;
    const pEdge = project(ownship.lat + dLat, ownship.lon, 0, 0, layout);
    if (pEdge.visible) {
      const rPx = Math.max(8, Math.min(120, Math.hypot(pEdge.x - p.x, pEdge.y - p.y)));
      ctx.beginPath();
      ctx.fillStyle = ring;
      ctx.strokeStyle = bright
        ? "rgba(196, 90, 0, 0.45)"
        : "rgba(255, 176, 64, 0.5)";
      ctx.lineWidth = 1;
      ctx.arc(p.x, p.y, rPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  const heading = ownship.heading;
  const hasHdg =
    Number.isFinite(heading) && heading >= 0 && heading < 360;

  ctx.save();
  if (hasHdg) {
    // Screen: +x right, +y down; GPS heading 0° = true north ≈ −y
    const rad = (heading * Math.PI) / 180;
    const len = 12;
    const tipX = p.x + Math.sin(rad) * len;
    const tipY = p.y - Math.cos(rad) * len;
    const leftX = p.x + Math.sin(rad + 2.5) * 7;
    const leftY = p.y - Math.cos(rad + 2.5) * 7;
    const rightX = p.x + Math.sin(rad - 2.5) * 7;
    const rightY = p.y - Math.cos(rad - 2.5) * 7;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = stroke;
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
