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
  DIVERSION_AIRPORTS,
  RWY_LABEL_MIN_M,
  runwayLabels,
} from "./diversionAirports.js";

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
 */
function drawDiversionAirports(ctx, layout, bright, width, height, showRwyLabels = true) {
  const color = bright ? "#0057b8" : "rgba(100, 190, 255, 0.95)";
  const labelFill = bright ? "#003d7a" : "rgba(160, 220, 255, 0.95)";
  const rwyFill = bright ? "rgba(0, 61, 122, 0.78)" : "rgba(160, 220, 255, 0.75)";
  const halo = bright ? "rgba(255,255,255,0.85)" : "rgba(8,20,30,0.75)";
  const leader = bright ? "rgba(0, 61, 122, 0.45)" : "rgba(140, 200, 240, 0.45)";

  const icaoFont = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const rwyFont = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  const includeRwys = showRwyLabels !== false;

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

  /** @type {{ap:any,x:number,y:number,lines:string[],metrics:number[],nn:number}[]} */
  const visible = [];
  for (const ap of DIVERSION_AIRPORTS) {
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

  // Symbols
  for (const v of visible) {
    drawAirportGear(ctx, v.x, v.y, color, 1);
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
}

/** Green OAC FIR lines + OTAs + adjacent domestic FIRs (CPDLC codes). */
function drawOac(ctx, layout, bright) {
  const stroke = bright ? "rgba(20, 110, 50, 0.5)" : "rgba(90, 200, 120, 0.45)";
  const otaStroke = bright ? "#0a7a35" : "rgba(90, 235, 140, 0.95)";
  const domesticStroke = bright ? "rgba(20, 90, 140, 0.45)" : "rgba(120, 200, 230, 0.4)";
  const fill = bright ? "rgba(16, 90, 40, 0.7)" : "rgba(140, 230, 160, 0.9)";
  const otaFill = bright ? "rgba(10, 120, 50, 0.16)" : "rgba(70, 200, 110, 0.16)";
  const otaLabel = bright ? "#0a6e30" : "rgba(160, 255, 180, 0.95)";

  for (const seg of OAC_SEGMENTS) {
    drawPolyline(ctx, layout, seg, {
      stroke,
      width: bright ? 1.6 : 1.5,
      dash: [],
    });
  }

  // Domestic / oceanic interface — dashed, same weight family as OAC
  for (const seg of DOMESTIC_FIR_SEGMENTS) {
    drawPolyline(ctx, layout, seg, {
      stroke: domesticStroke,
      width: bright ? 1.5 : 1.4,
      dash: [6, 5],
    });
  }

  // Transition areas — stronger dashed outline + fill
  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.radius - 0.5, 0, Math.PI * 2);
  ctx.clip();

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

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Oceanic OAC codes
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = fill;
  for (const lab of OAC_LABELS) {
    const p = project(lab.lat, lab.lon, 0, 0, layout);
    if (!p.visible) continue;
    ctx.strokeStyle = bright ? "rgba(255,255,255,0.85)" : "rgba(8,20,30,0.7)";
    ctx.lineWidth = 3;
    ctx.strokeText(lab.code, p.x, p.y);
    ctx.fillText(lab.code, p.x, p.y);
  }

  // OTA labels
  ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = otaLabel;
  for (const area of OTA_AREAS) {
    const p = project(area.label.lat, area.label.lon, 0, 0, layout);
    if (!p.visible) continue;
    ctx.strokeStyle = bright ? "rgba(255,255,255,0.9)" : "rgba(8,20,30,0.75)";
    ctx.lineWidth = 3.2;
    ctx.strokeText(area.id, p.x, p.y);
    ctx.fillText(area.id, p.x, p.y);
  }

  // Domestic FIR codes — same subtle style as oceanic OAC labels
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = fill;
  for (const lab of DOMESTIC_FIR_LABELS) {
    const p = project(lab.lat, lab.lon, 0, 0, layout);
    if (!p.visible) continue;
    ctx.strokeStyle = bright ? "rgba(255,255,255,0.85)" : "rgba(8,20,30,0.7)";
    ctx.lineWidth = 3;
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
  if (data.showAirspace !== false) {
    drawOac(ctx, layout, bright);
  }
  drawDiversionAirports(
    ctx,
    layout,
    bright,
    width,
    height,
    data.showRwyLabels !== false
  );

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

  drawOwnship(ctx, layout, data.ownship, bright, width, height);

  return layout;
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
