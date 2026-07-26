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
