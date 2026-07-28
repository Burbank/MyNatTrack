/**
 * Compact offline magnetic variation model for planning.
 * Bilinear interpolation over a coarse grid (degrees East positive).
 * Approximate — not a certified MAGVAR / WMM product.
 *
 * Grid values are aligned to the World Magnetic Model WMM2025
 * (epoch 2025.0; valid 2025-01-01 … 2029-12-31) over the wider Atlantic
 * (incl. southern latitudes for pan / diversion context).
 */

/** Epoch / table date of the magnetic variation model used by this app. */
export const MAGVAR_TABLE_DATE = "2025-01-01";

/**
 * Rough Atlantic-region declination secular variation (order of magnitude).
 * Real WMM SV varies by location (often ~0.1–0.3°/year over mid-Atlantic).
 */
export const MAGVAR_DRIFT_REMARK = "approx. drift ~0.2°/year";

// Grid: lat -40..70 step ~10–5; lon -80..30 step 10 (educational Atlantic basin)
const LATS = [-40, -30, -20, -10, 0, 10, 20, 30, 35, 40, 45, 50, 55, 60, 65, 70];
const LONS = [-80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30];

// rows = lat index, cols = lon index — WMM2025-class approximations (deg E+)
const GRID = [
  // -40S
  [-2, -5, -10, -16, -22, -26, -28, -27, -22, -14, -5, 2],
  // -30S
  [-4, -7, -12, -18, -23, -26, -26, -23, -17, -9, 0, 5],
  // -20S
  [-7, -10, -14, -18, -21, -22, -20, -15, -9, -2, 4, 8],
  // -10S
  [-10, -12, -15, -17, -17, -16, -12, -7, -1, 4, 8, 11],
  // 0
  [-12, -14, -15, -15, -14, -11, -7, -2, 3, 7, 10, 12],
  // 10N
  [-13, -14, -15, -14, -12, -9, -4, 1, 5, 8, 11, 13],
  // 20N
  [-14, -14, -14, -13, -11, -7, -3, 2, 6, 9, 12, 14],
  // 30N
  [-15, -14, -13, -12, -10, -8, -5, -2, 1, 3, 6, 9],
  // 35N
  [-16, -15, -14, -13, -11, -8, -5, -1, 2, 4, 7, 10],
  // 40N
  [-17, -16, -15, -14, -12, -9, -5, -1, 3, 5, 8, 11],
  // 45N
  [-18, -17, -16, -15, -12, -9, -5, 0, 4, 6, 9, 12],
  // 50N
  [-20, -19, -17, -15, -12, -8, -4, 1, 5, 8, 11, 14],
  // 55N
  [-22, -20, -18, -16, -12, -8, -3, 2, 7, 10, 13, 15],
  // 60N
  [-24, -22, -19, -16, -12, -7, -1, 4, 9, 12, 14, 16],
  // 65N
  [-26, -23, -20, -16, -11, -5, 1, 7, 12, 15, 16, 17],
  // 70N
  [-28, -24, -20, -15, -9, -3, 4, 10, 15, 18, 18, 18],
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @returns {number} magnetic variation degrees (East positive)
 */
function magneticVariation(lat, lon) {
  // Wrap lon into a friendly range before clamp (dateline-adjacent pan)
  let L = lon;
  while (L > 180) L -= 360;
  while (L < -180) L += 360;

  const la = clamp(lat, LATS[0], LATS[LATS.length - 1]);
  const lo = clamp(L, LONS[0], LONS[LONS.length - 1]);

  let i0 = 0;
  while (i0 < LATS.length - 2 && LATS[i0 + 1] < la) i0 += 1;
  let j0 = 0;
  while (j0 < LONS.length - 2 && LONS[j0 + 1] < lo) j0 += 1;

  const i1 = i0 + 1;
  const j1 = j0 + 1;
  const t = (la - LATS[i0]) / (LATS[i1] - LATS[i0] || 1);
  const u = (lo - LONS[j0]) / (LONS[j1] - LONS[j0] || 1);

  const v00 = GRID[i0][j0];
  const v10 = GRID[i1][j0];
  const v01 = GRID[i0][j1];
  const v11 = GRID[i1][j1];

  const v0 = v00 * (1 - t) + v10 * t;
  const v1 = v01 * (1 - t) + v11 * t;
  return v0 * (1 - u) + v1 * u;
}

/** True track → magnetic track (deg) */
export function trueToMagnetic(trueTrackDeg, lat, lon) {
  const varE = magneticVariation(lat, lon);
  let mag = trueTrackDeg - varE;
  mag %= 360;
  if (mag < 0) mag += 360;
  return mag;
}

export function formatVariation(lat, lon) {
  const v = magneticVariation(lat, lon);
  const abs = Math.abs(v).toFixed(1);
  return v >= 0 ? `${abs}E` : `${abs}W`;
}
