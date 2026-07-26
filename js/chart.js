/**
 * Offline North Atlantic globe chart (orthographic projection).
 * Land contours from Natural Earth 110m (bundled). No external tiles.
 */

import { OAC_LABELS, OAC_SEGMENTS } from "./oac.js";
import { DIVERSION_AIRPORTS, RWY_LABEL_MIN_M } from "./diversionAirports.js";

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
 * @param {number} userZoom  pinch/wheel multiplier (1 = auto-fit)
 * @param {{ dLat?: number, dLon?: number }} pan  user pan offsets (deg) from fitted center
 */
function globeLayout(width, height, focusPoints = [], userZoom = 1, pan = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const half = Math.min(width, height) * 0.5;

  const points =
    focusPoints.length >= 1 ? focusPoints : DEFAULT_VIEW.frame.slice();

  let { lat0, lon0 } =
    focusPoints.length >= 1
      ? meanCenter(focusPoints)
      : { lat0: DEFAULT_VIEW.lat0, lon0: DEFAULT_VIEW.lon0 };

  lat0 = Math.max(5, Math.min(85, lat0 + (Number(pan.dLat) || 0)));
  lon0 = lon0 + (Number(pan.dLon) || 0);
  if (lon0 > 180) lon0 -= 360;
  if (lon0 < -180) lon0 += 360;

  let maxAngle = 0;
  for (const p of points) {
    maxAngle = Math.max(maxAngle, centralAngleDeg(lat0, lon0, p.lat, p.lon));
  }
  // Tight framing — only a little ocean context around the track
  maxAngle = Math.max(maxAngle, focusPoints.length >= 2 ? 5 : 14);
  maxAngle *= focusPoints.length >= 2 ? 1.08 : 1.05;

  const sinC = Math.sin(toRad(maxAngle));
  // Outermost focus point near the panel edge
  let radius = sinC > 1e-6 ? (half * 0.96) / sinC : half * 1.4;
  radius = Math.max(radius, half * 1.15);
  radius = Math.min(radius, half * 4.5);

  const zoom = Math.max(0.5, Math.min(5, Number(userZoom) || 1));
  radius *= zoom;

  return { radius, cx, cy, lat0, lon0 };
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

function drawLand(ctx, layout, bright) {
  if (!landRings || !landRings.length) return;
  const { radius, cx, cy } = layout;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = bright ? "rgba(46, 110, 58, 0.92)" : "rgba(52, 88, 62, 0.88)";
  ctx.strokeStyle = bright ? "rgba(0, 40, 0, 0.65)" : "rgba(160, 200, 170, 0.35)";
  ctx.lineWidth = bright ? 0.9 : 0.7;
  ctx.lineJoin = "round";

  for (const ring of landRings) {
    const projected = ring.map(([lon, lat]) => project(lat, lon, 0, 0, layout));
    const visibleCount = projected.filter((p) => p.visible).length;
    if (visibleCount < 3) continue;

    // Prefer full fill when most of the ring is on the near side of the globe
    if (visibleCount / projected.length >= 0.55) {
      ctx.beginPath();
      let started = false;
      for (const p of projected) {
        if (!p.visible) continue;
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      if (started) {
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Partial coastline stroke only (avoids wild fill across the limb)
      ctx.beginPath();
      let started = false;
      for (const p of projected) {
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
  }

  // Terminator / night-side shade for roundness
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

function drawGrid(ctx, layout, bright, width, height) {
  const { radius, cx, cy } = layout;
  const bounds = estimateVisibleGeo(layout, width, height);
  // Fixed chart lattice: parallels every 5°, meridians every 10°
  const stepLat = 5;
  const stepLon = 10;
  const lats = tickRange(bounds.minLat, bounds.maxLat, stepLat);
  const lons = tickRange(bounds.minLon, bounds.maxLon, stepLon);
  const sampleLon = 0.5;
  const sampleLat = 0.5;

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

function drawNatTracks(ctx, layout, tracks) {
  if (!tracks || !tracks.length) return;
  ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (const track of tracks) {
    const pts = track.points || [];
    if (pts.length < 2) continue;
    const color = track.color || "rgba(255, 180, 120, 0.9)";
    drawPolyline(ctx, layout, pts, {
      stroke: color,
      width: 1.7,
      dash: [6, 5],
    });
    const mid = pts[Math.floor(pts.length / 2)];
    const mp = project(mid.lat, mid.lon, 0, 0, layout);
    if (mp.visible) {
      ctx.fillStyle = color;
      ctx.fillText(track.id, mp.x + 4, mp.y - 4);
    }
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

function drawDiversionAirports(ctx, layout, bright, width, height) {
  const color = bright ? "#0057b8" : "rgba(100, 190, 255, 0.95)";
  const labelFill = bright ? "#003d7a" : "rgba(160, 220, 255, 0.95)";
  const rwyFill = bright ? "rgba(0, 61, 122, 0.78)" : "rgba(160, 220, 255, 0.75)";
  const halo = bright ? "rgba(255,255,255,0.8)" : "rgba(8,20,30,0.7)";

  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (const ap of DIVERSION_AIRPORTS) {
    const p = project(ap.lat, ap.lon, 0, 0, layout);
    if (!inCanvas(p, width, height, 4)) continue;
    drawAirportGear(ctx, p.x, p.y, color, 1);

    const lx = p.x + 9;
    const ly = p.y + 1;
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = labelFill;
    ctx.strokeStyle = halo;
    ctx.lineWidth = 2.5;
    ctx.strokeText(ap.icao, lx, ly);
    ctx.fillText(ap.icao, lx, ly);

    // Largest runway direction when ≥ 2500 m (e.g. LPLA → 15/33)
    if (ap.rwy && (ap.rwyM || 0) >= RWY_LABEL_MIN_M) {
      ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = rwyFill;
      ctx.strokeText(ap.rwy, lx, ly + 11);
      ctx.fillText(ap.rwy, lx, ly + 11);
    }
  }
  ctx.restore();
}

/** Green OAC FIR shared boundaries + CPDLC codes (CZQX, EGGX, LPPO, …). */
function drawOac(ctx, layout, bright) {
  const stroke = bright ? "rgba(20, 110, 50, 0.45)" : "rgba(90, 200, 120, 0.4)";
  const fill = bright ? "rgba(16, 90, 40, 0.55)" : "rgba(130, 220, 150, 0.55)";

  for (const seg of OAC_SEGMENTS) {
    drawPolyline(ctx, layout, seg, {
      stroke,
      width: bright ? 1.5 : 1.4,
      dash: [],
    });
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.radius - 0.5, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const lab of OAC_LABELS) {
    const p = project(lab.lat, lab.lon, 0, 0, layout);
    if (!p.visible) continue;
    ctx.strokeStyle = bright ? "rgba(255,255,255,0.55)" : "rgba(8,20,30,0.45)";
    ctx.lineWidth = 2.2;
    ctx.strokeText(lab.code, p.x, p.y);
    ctx.fillText(lab.code, p.x, p.y);
  }
  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ route: any[], natTracks?: any[], bright?: boolean, showNatTracks?: boolean, zoom?: number, pan?: {dLat?:number,dLon?:number} }} data
 */
export function drawChart(canvas, data) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
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
  const layout = globeLayout(
    width,
    height,
    focusPoints,
    data.zoom ?? 1,
    data.pan || { dLat: 0, dLon: 0 }
  );

  drawGlobeBase(ctx, layout, bright, width, height);
  drawLand(ctx, layout, bright);
  drawGrid(ctx, layout, bright, width, height);
  drawOac(ctx, layout, bright);
  drawDiversionAirports(ctx, layout, bright, width, height);

  if (data.showNatTracks !== false) {
    drawNatTracks(ctx, layout, data.natTracks || []);
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

  return layout;
}
