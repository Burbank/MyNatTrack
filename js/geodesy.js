/**
 * WGS-84 Vincenty direct/inverse for distance (NM) and initial/final bearings.
 * Private-use navigation aid — not certified.
 */
const WGS84 = {
  a: 6378137.0,
  f: 1 / 298.257223563,
  b: 6356752.314245,
};

const NM_PER_M = 1 / 1852;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function normalizeBearing(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/**
 * Vincenty inverse: distance (m), initial bearing (deg true), final bearing (deg true).
 */
export function vincentyInverse(lat1, lon1, lat2, lon2) {
  const { a, b, f } = WGS84;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const L = toRad(lon2 - lon1);

  const U1 = Math.atan((1 - f) * Math.tan(φ1));
  const U2 = Math.atan((1 - f) * Math.tan(φ2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let λ = L;
  let λPrev;
  let sinλ;
  let cosλ;
  let sinσ;
  let cosσ;
  let σ;
  let sinα;
  let cos2α;
  let cos2σm;
  let C;
  let iterations = 0;

  do {
    sinλ = Math.sin(λ);
    cosλ = Math.cos(λ);
    const sinσSq =
      (cosU2 * sinλ) ** 2 +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosλ) ** 2;
    sinσ = Math.sqrt(sinσSq);
    if (sinσ === 0) {
      return { distanceM: 0, distanceNm: 0, initialBearing: 0, finalBearing: 0 };
    }
    cosσ = sinU1 * sinU2 + cosU1 * cosU2 * cosλ;
    σ = Math.atan2(sinσ, cosσ);
    sinα = (cosU1 * cosU2 * sinλ) / sinσ;
    cos2α = 1 - sinα * sinα;
    cos2σm = cos2α !== 0 ? cosσ - (2 * sinU1 * sinU2) / cos2α : 0;
    C = (f / 16) * cos2α * (4 + f * (4 - 3 * cos2α));
    λPrev = λ;
    λ =
      L +
      (1 - C) *
        f *
        sinα *
        (σ +
          C *
            sinσ *
            (cos2σm + C * cosσ * (-1 + 2 * cos2σm * cos2σm)));
    iterations += 1;
  } while (Math.abs(λ - λPrev) > 1e-12 && iterations < 200);

  if (iterations >= 200) {
    throw new Error("Vincenty inverse failed to converge");
  }

  const uSq = (cos2α * (a * a - b * b)) / (b * b);
  const A =
    1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const Δσ =
    B *
    sinσ *
    (cos2σm +
      (B / 4) *
        (cosσ * (-1 + 2 * cos2σm * cos2σm) -
          (B / 6) *
            cos2σm *
            (-3 + 4 * sinσ * sinσ) *
            (-3 + 4 * cos2σm * cos2σm)));

  const distanceM = b * A * (σ - Δσ);
  const initialBearing = normalizeBearing(
    toDeg(Math.atan2(cosU2 * sinλ, cosU1 * sinU2 - sinU1 * cosU2 * cosλ))
  );
  const finalBearing = normalizeBearing(
    toDeg(Math.atan2(cosU1 * sinλ, -sinU1 * cosU2 + cosU1 * sinU2 * cosλ))
  );

  return {
    distanceM,
    distanceNm: distanceM * NM_PER_M,
    initialBearing,
    finalBearing,
  };
}

export function formatTrack(deg) {
  return String(Math.round(normalizeBearing(deg)) % 360).padStart(3, "0");
}

export function formatDistanceNm(nm) {
  return nm.toFixed(1);
}

/**
 * Circular mean of two bearings (deg). Used as FMS-style average great-circle track
 * between initial outbound and final inbound bearings.
 */
export function averageBearing(bearingA, bearingB) {
  const a = toRad(normalizeBearing(bearingA));
  const b = toRad(normalizeBearing(bearingB));
  const x = Math.cos(a) + Math.cos(b);
  const y = Math.sin(a) + Math.sin(b);
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
    return normalizeBearing(bearingA);
  }
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

/**
 * Spherical great-circle samples for chart drawing (display only).
 * @returns {{ lat: number, lon: number }[]}
 */
export function greatCircleSamples(lat1, lon1, lat2, lon2, steps = 72) {
  const φ1 = toRad(lat1);
  const λ1 = toRad(lon1);
  const φ2 = toRad(lat2);
  const λ2 = toRad(lon2);
  const sinΔφ = Math.sin((φ2 - φ1) / 2);
  const sinΔλ = Math.sin((λ2 - λ1) / 2);
  const Δ =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ)
      )
    );
  if (!(Δ > 1e-12)) {
    return [
      { lat: lat1, lon: lon1 },
      { lat: lat2, lon: lon2 },
    ];
  }
  const sinΔ = Math.sin(Δ);
  const n = Math.max(2, Math.floor(steps));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * Δ) / sinΔ;
    const B = Math.sin(f * Δ) / sinΔ;
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    pts.push({
      lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      lon: toDeg(Math.atan2(y, x)),
    });
  }
  return pts;
}

/**
 * Format minutes as HH:MM (crude ETE / block time).
 */
export function formatEteHhMm(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Crude 747-class time from GC distance + mid-latitude westerlies.
 * TAS ≈ 480 kt (M0.85). Prevailing wind: west→east, peaking ~45 kt near 50°N.
 * @param {{ terminalPad?: boolean }} [opts] — climb/descent pad when true (airport legs / GC plan).
 * @returns {{ minutes: number, label: string, gsKt: number, windKt: number }}
 */
export function estimate747BlockTime(distanceNm, lat1, lon1, lat2, lon2, opts = {}) {
  const terminalPad = opts.terminalPad !== false;
  const nm = Math.max(0, Number(distanceNm) || 0);
  const TAS = 480;
  let windKt = 0;
  if (
    Number.isFinite(lat1) &&
    Number.isFinite(lon1) &&
    Number.isFinite(lat2) &&
    Number.isFinite(lon2) &&
    nm > 1
  ) {
    const mid = greatCircleSamples(lat1, lon1, lat2, lon2, 8)[4] || {
      lat: (lat1 + lat2) / 2,
      lon: (lon1 + lon2) / 2,
    };
    let track = Number.isFinite(opts.initialBearing) ? opts.initialBearing : null;
    if (track == null) {
      try {
        track = vincentyInverse(lat1, lon1, lat2, lon2).initialBearing;
      } catch {
        track = 0;
      }
    }
    windKt = prevailingTailwindKt(mid.lat, track, mid.lon);
  }
  const gsKt = Math.max(280, TAS + windKt);
  const cruiseMin = nm > 0 ? (nm / gsKt) * 60 : 0;
  const pad = terminalPad ? (nm < 120 ? 10 : 20) : 0;
  const minutes = Math.max(0, Math.round(cruiseMin + pad));
  return {
    minutes,
    label: formatEteHhMm(minutes),
    gsKt: Math.round(gsKt),
    windKt: Math.round(windKt),
  };
}

/**
 * Crude global prevailing wind → tailwind along true track (deg).
 * Pure math (no data tables): mid-latitude westerlies, Asia/NPAC jet, SH jet,
 * and tropical easterly trades. Educational only.
 * @param {number} [lon] optional — enables Asia/North-Pacific jet boost
 */
function prevailingTailwindKt(lat, trackDeg, lon) {
  const latN = Number(lat);
  if (!Number.isFinite(latN)) return 0;
  const latAbs = Math.abs(latN);
  const θ = ((Number(trackDeg) || 0) * Math.PI) / 180;

  /** Best (speedKt, wind-from deg true). FROM west=270, FROM east=90. */
  let bestW = 0;
  let fromDeg = 270;

  const consider = (speed, from) => {
    if (speed > bestW) {
      bestW = speed;
      fromDeg = from;
    }
  };

  // Mid-latitude westerlies (NH stronger; SH included for southern routes)
  if (latAbs >= 22 && latAbs <= 72) {
    const peak = latN >= 0 ? 45 : 30;
    const core = latN >= 0 ? 50 : -48;
    const band = Math.exp(-0.5 * ((latN - core) / 14) ** 2);
    consider(peak * band, 270);
  }

  // Asia / North Pacific subtropical jet (~35°N, lon E Asia or far W Pacific)
  if (
    Number.isFinite(lon) &&
    latN >= 25 &&
    latN <= 48 &&
    (lon >= 100 || lon <= -140)
  ) {
    const band = Math.exp(-0.5 * ((latN - 35) / 10) ** 2);
    consider(52 * band, 270);
  }

  // South Pacific / Indian Ocean mid-lat jet (weaker than NH)
  if (
    Number.isFinite(lon) &&
    latN <= -25 &&
    latN >= -55 &&
    ((lon >= 40 && lon <= 180) || lon <= -140)
  ) {
    const band = Math.exp(-0.5 * ((latN + 45) / 12) ** 2);
    consider(32 * band, 270);
  }

  // Tropical trade easterlies (both hemispheres)
  if (latAbs >= 5 && latAbs <= 24) {
    const band = Math.exp(-0.5 * ((latAbs - 14) / 6) ** 2);
    consider(18 * band, 90);
  }

  if (bestW < 0.5) return 0;
  // Tailwind = component of wind-TO along track
  const toRad = (((fromDeg + 180) % 360) * Math.PI) / 180;
  return bestW * Math.cos(θ - toRad);
}
