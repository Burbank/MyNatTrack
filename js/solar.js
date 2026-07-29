/**
 * Compact solar / subsolar helpers for day–night globe shading.
 * Educational approximate model (arc-minute class) — not for navigation.
 */

function toRad(d) {
  return (d * Math.PI) / 180;
}

function toDeg(r) {
  return (r * 180) / Math.PI;
}

export function normalizeLon(lon) {
  let x = Number(lon) || 0;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/**
 * Subsolar point (where the Sun is overhead) for a UTC instant.
 * @param {Date} [date]
 * @returns {{ lat: number, lon: number }}
 */
export function subsolarPoint(date = new Date()) {
  // Fractional days since J2000.0 (includes time-of-day — do not add UT again)
  const d =
    (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  let L = (280.460 + 0.9856474 * d) % 360;
  if (L < 0) L += 360;
  let g = (357.528 + 0.9856003 * d) % 360;
  if (g < 0) g += 360;
  const gRad = toRad(g);
  const lambda = toRad(
    L + 1.915 * Math.sin(gRad) + 0.02 * Math.sin(2 * gRad)
  );
  const epsilon = toRad(23.439 - 0.0000004 * d);
  const sinDec = Math.sin(epsilon) * Math.sin(lambda);
  const lat = toDeg(Math.asin(Math.max(-1, Math.min(1, sinDec))));
  const alpha = Math.atan2(
    Math.cos(epsilon) * Math.sin(lambda),
    Math.cos(lambda)
  );
  // GMST (degrees); `d` already carries UT, so no extra 15*hours term
  let gmst = (280.46061837 + 360.98564736629 * d) % 360;
  if (gmst < 0) gmst += 360;
  const lon = normalizeLon(toDeg(alpha) - gmst);
  return { lat, lon };
}

/**
 * Spherical destination from (lat,lon) along true bearing, angular distance deg.
 * @returns {{ lat: number, lon: number }}
 */
export function sphericalDestination(lat, lon, bearingDeg, distanceDeg) {
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const θ = toRad(bearingDeg);
  const δ = toRad(distanceDeg);
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * sinδ * cosφ1,
      cosδ - sinφ1 * sinφ2
    );
  return { lat: toDeg(φ2), lon: normalizeLon(toDeg(λ2)) };
}

/**
 * Geodesic circle around a center (e.g. night cap / terminator).
 * @returns {[number, number][]} lon,lat pairs (closed ring)
 */
export function geodesicCircleLonLat(lat, lon, radiusDeg, samples = 72) {
  const ring = [];
  const n = Math.max(24, samples | 0);
  for (let i = 0; i < n; i += 1) {
    const brg = (360 * i) / n;
    const p = sphericalDestination(lat, lon, brg, radiusDeg);
    ring.push([p.lon, p.lat]);
  }
  if (ring.length) ring.push(ring[0].slice());
  return ring;
}
