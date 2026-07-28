/**
 * Parse named fixes, ARINC 424 oceanic shorthand, and full FMC coordinate strings.
 *
 * ARINC 424 §7.2.5 (summary):
 * - Whole-degree 5-char: lat (2) + lon last-2 (2) + letter, OR lat (2) + letter + lon last-2
 *   Letter last → lon < 100°; letter 3rd → lon ≥ 100°
 *   Letter: N=N/W, E=N/E, S=S/E, W=S/W
 * - NAT half-degree: Hxxyy = xx°30'N / yy°W (e.g. H5250)
 * - Classic N-prefix half-degree (ambiguous): Nxx yy = xx°30'N / yy°W (e.g. N5050)
 */

import {
  expandAirwayTokens,
  isAirwayToken,
} from "./airways.js";

function dmsToDeg(deg, min = 0, sec = 0, hemi = "N") {
  let v = Math.abs(deg) + min / 60 + sec / 3600;
  const h = hemi.toUpperCase();
  if (h === "S" || h === "W") v = -v;
  return v;
}

function hemiFromArincLetter(letter) {
  switch (letter) {
    case "N":
      return { latH: "N", lonH: "W" };
    case "E":
      return { latH: "N", lonH: "E" };
    case "S":
      return { latH: "S", lonH: "E" };
    case "W":
      return { latH: "S", lonH: "W" };
    default:
      return null;
  }
}

function okPoint(name, lat, lon, extra = {}) {
  return {
    ok: true,
    point: {
      id: name,
      name,
      lat,
      lon,
      accuracy: "exact",
      fromDb: false,
      format: extra.format || "coord",
      ...extra,
    },
  };
}

/**
 * ARINC 424 §7.2.5 whole-degree 5-character oceanic shorthand.
 * Examples: 5050N → 50N050W; 50N50 → 50N150W; 5215N → 52N015W; 4020S → 40S020E
 */
function parseArinc424Shorthand(input) {
  const s = String(input || "")
    .trim()
    .toUpperCase();

  // Letter in 3rd position → longitude ≥ 100°  (e.g. 50N50)
  let m = s.match(/^(\d{2})([NESW])(\d{2})$/);
  if (m) {
    const hemi = hemiFromArincLetter(m[2]);
    if (!hemi) return null;
    const latDeg = parseInt(m[1], 10);
    const lonDeg = 100 + parseInt(m[3], 10);
    if (latDeg > 90 || lonDeg > 180) return null;
    return okPoint(
      s,
      dmsToDeg(latDeg, 0, 0, hemi.latH),
      dmsToDeg(lonDeg, 0, 0, hemi.lonH),
      { format: "arinc424", arinc: s }
    );
  }

  // Letter in last position → longitude < 100°  (e.g. 5050N, 5215N, 4020S)
  m = s.match(/^(\d{2})(\d{2})([NESW])$/);
  if (m) {
    const hemi = hemiFromArincLetter(m[3]);
    if (!hemi) return null;
    const latDeg = parseInt(m[1], 10);
    const lonDeg = parseInt(m[2], 10);
    if (latDeg > 90 || lonDeg >= 100) return null;
    return okPoint(
      s,
      dmsToDeg(latDeg, 0, 0, hemi.latH),
      dmsToDeg(lonDeg, 0, 0, hemi.lonH),
      { format: "arinc424", arinc: s }
    );
  }

  return null;
}

/**
 * NAT-recommended half-degree coding: Hxxyy = xx°30'N / yy°00'W
 * Example: H5250 → 52°30'N 050°00'W
 */
function parseArincHalfDegreeH(input) {
  const s = String(input || "")
    .trim()
    .toUpperCase();
  const m = s.match(/^H(\d{2})(\d{2})$/);
  if (!m) return null;
  const latDeg = parseInt(m[1], 10);
  const lonDeg = parseInt(m[2], 10);
  if (latDeg > 89 || lonDeg > 99) return null;
  return okPoint(s, dmsToDeg(latDeg, 30, 0, "N"), dmsToDeg(lonDeg, 0, 0, "W"), {
    format: "arinc424_H",
    arinc: s,
  });
}

/**
 * Classic (ambiguous) N-prefix half-degree: Nxx yy = xx°30'N / yy°W
 * Example: N5050 → 50°30'N 050°00'W
 * Prefer Hxxyy in NAT ops; still accepted for FMS compatibility.
 */
function parseArincHalfDegreeNPrefix(input) {
  const s = String(input || "")
    .trim()
    .toUpperCase();
  const m = s.match(/^N(\d{2})(\d{2})$/);
  if (!m) return null;
  // Avoid stealing full forms that start with N (handled elsewhere as N50W040…)
  if (/[EW]/.test(s.slice(1))) return null;
  const latDeg = parseInt(m[1], 10);
  const lonDeg = parseInt(m[2], 10);
  if (latDeg > 89 || lonDeg > 99) return null;
  return okPoint(s, dmsToDeg(latDeg, 30, 0, "N"), dmsToDeg(lonDeg, 0, 0, "W"), {
    format: "arinc424_N",
    arinc: s,
  });
}

function parsePackedLat(digits, hemi) {
  const s = digits.replace(/\D/g, "");
  if (s.length < 2 || s.length > 6) return null;
  const deg = parseInt(s.slice(0, 2), 10);
  let min = 0;
  let sec = 0;
  if (s.length >= 4) min = parseInt(s.slice(2, 4), 10);
  if (s.length === 5) {
    min = parseInt(s.slice(2, 4), 10) + parseInt(s[4], 10) / 10;
  } else if (s.length === 6) {
    sec = parseInt(s.slice(4, 6), 10);
  }
  if (deg > 90 || min >= 60 || sec >= 60) return null;
  return dmsToDeg(deg, min, sec, hemi);
}

function parsePackedLon(digits, hemi) {
  const s = digits.replace(/\D/g, "");
  if (s.length < 3 || s.length > 7) return null;
  const deg = parseInt(s.slice(0, 3), 10);
  let min = 0;
  let sec = 0;
  if (s.length >= 5) min = parseInt(s.slice(3, 5), 10);
  if (s.length === 6) {
    min = parseInt(s.slice(3, 5), 10) + parseInt(s[5], 10) / 10;
  } else if (s.length === 7) {
    sec = parseInt(s.slice(5, 7), 10);
  }
  if (deg > 180 || min >= 60 || sec >= 60) return null;
  return dmsToDeg(deg, min, sec, hemi);
}

/**
 * Strip excess leading zeros so FMS integer digit counts match:
 * lat ddmm (4), lon dddmm (5). Returns { digits, stripped }.
 */
function collapseLeadingZeros(intDigits, targetLen) {
  let digits = String(intDigits || "").replace(/\D/g, "");
  let stripped = 0;
  while (digits.length > targetLen && digits.startsWith("0")) {
    digits = digits.slice(1);
    stripped += 1;
  }
  return { digits, stripped };
}

/**
 * Flexible lat: dd, ddmm, or ddmm.m — tolerates extra leading zeros (005328.8 → 5328.8).
 * @returns {{ok:true,value:number,stripped:number}|{ok:false,stripped:number,tooMany:boolean}}
 */
function parseFlexibleLatPart(part, hemi) {
  const raw = String(part || "");
  const [intRaw, frac = ""] = raw.split(".");
  const collapsed = collapseLeadingZeros(intRaw, 4);
  const d = collapsed.digits;
  if (d.length !== 2 && d.length !== 4) {
    return {
      ok: false,
      stripped: collapsed.stripped,
      tooMany: String(intRaw).replace(/\D/g, "").length > 4,
    };
  }
  const deg = parseInt(d.slice(0, 2), 10);
  let min = d.length === 4 ? parseInt(d.slice(2, 4), 10) : 0;
  if (frac) min += parseFloat(`0.${frac}`);
  if (!Number.isFinite(deg) || deg > 90 || min >= 60) {
    return { ok: false, stripped: collapsed.stripped, tooMany: false };
  }
  return {
    ok: true,
    value: dmsToDeg(deg, min, 0, hemi),
    stripped: collapsed.stripped,
  };
}

/**
 * Flexible lon: ddd, dddmm, or dddmm.m — tolerates extra leading zeros (000530.0 → 00530.0).
 */
function parseFlexibleLonPart(part, hemi) {
  const raw = String(part || "");
  const [intRaw, frac = ""] = raw.split(".");
  const collapsed = collapseLeadingZeros(intRaw, 5);
  const d = collapsed.digits;
  if (d.length !== 3 && d.length !== 5) {
    return {
      ok: false,
      stripped: collapsed.stripped,
      tooMany: String(intRaw).replace(/\D/g, "").length > 5,
    };
  }
  const deg = parseInt(d.slice(0, 3), 10);
  let min = d.length === 5 ? parseInt(d.slice(3, 5), 10) : 0;
  if (frac) min += parseFloat(`0.${frac}`);
  if (!Number.isFinite(deg) || deg > 180 || min >= 60) {
    return { ok: false, stripped: collapsed.stripped, tooMany: false };
  }
  return {
    ok: true,
    value: dmsToDeg(deg, min, 0, hemi),
    stripped: collapsed.stripped,
  };
}

function looksLikeCoordPair(input) {
  return /^[NS]\d/i.test(input) && /[EW]\d/i.test(input);
}

function looksLikeExcessZeros(input) {
  // Lon integer run longer than dddmm, or lat longer than ddmm, with leading 0s
  const m = String(input || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .match(/^([NS])(\d+)(?:\.(\d+))?([EW])(\d+)(?:\.(\d+))?$/);
  if (!m) return false;
  return m[2].length > 4 || m[5].length > 5;
}

function unrecognizedCoordError(raw, opts = {}) {
  let msg =
    `Unrecognized waypoint: ${raw}. Try a name (SOMAX), ARINC (5215N, 50N50, H5250), ` +
    `or FMS (N5000.0W05000.0 — n/s/e/w OK).`;
  if (opts.tooManyZeros) {
    msg +=
      " Too many digits/zeros: longitude is 3°+2′ (W00530.0, not W000530.0); " +
      "latitude is 2°+2′ (N5328.8).";
  }
  return { ok: false, error: msg };
}

/**
 * @param {string} raw
 * @param {Array<{name:string,lat:number,lon:number}>} [db]
 */
export function parseWaypointInput(raw, db = []) {
  if (!raw || !String(raw).trim()) {
    return { ok: false, error: "Empty input" };
  }
  // Compass letters and ARINC letters accepted in either case
  const input = String(raw).trim().toUpperCase().replace(/\s+/g, "");

  // Named 5-letter (or ICAO) fix from DB — before digit shorthand
  const named = db.find((w) => w.name === input || w.id === input);
  if (named) {
    return {
      ok: true,
      point: {
        id: named.id || named.name,
        name: named.name,
        lat: named.lat,
        lon: named.lon,
        accuracy: named.accuracy || "exact",
        fromDb: true,
        format: "named",
      },
    };
  }

  // NAT half-degree H-format (preferred): H5250
  const halfH = parseArincHalfDegreeH(input);
  if (halfH) return halfH;

  // Classic N-prefix half-degree: N5050 (before full N50W… forms that are longer)
  if (/^N\d{4}$/.test(input)) {
    const halfN = parseArincHalfDegreeNPrefix(input);
    if (halfN) return halfN;
  }

  // ARINC 424 5-char whole-degree shorthand: 5050N / 50N50 / 5215N
  const arinc = parseArinc424Shorthand(input);
  if (arinc) return arinc;

  // Full FMS (strict): N5000.0W05000.0 / N50W040 / N5030W04000
  let m = input.match(
    /^([NS])(\d{2})(?:(\d{2})(?:\.(\d+))?)?([EW])(\d{2,3})(?:(\d{2})(?:\.(\d+))?)?$/
  );
  if (m) {
    const latH = m[1];
    const latDeg = parseInt(m[2], 10);
    const latMin = m[3]
      ? parseInt(m[3], 10) + (m[4] ? parseFloat("0." + m[4]) : 0)
      : 0;
    const lonH = m[5];
    const lonDeg = parseInt(m[6], 10);
    const lonMin = m[7]
      ? parseInt(m[7], 10) + (m[8] ? parseFloat("0." + m[8]) : 0)
      : 0;
    if (latDeg <= 90 && lonDeg <= 180 && latMin < 60 && lonMin < 60) {
      return okPoint(
        input,
        dmsToDeg(latDeg, latMin, 0, latH),
        dmsToDeg(lonDeg, lonMin, 0, lonH),
        { format: "fms_full" }
      );
    }
  }

  // Flexible FMS: allow extra leading zeros (N5328.8W000530.0 → W00530.0)
  m = input.match(/^([NS])(\d+(?:\.\d+)?)([EW])(\d+(?:\.\d+)?)$/);
  if (m) {
    const latParsed = parseFlexibleLatPart(m[2], m[1]);
    const lonParsed = parseFlexibleLonPart(m[4], m[3]);
    if (latParsed.ok && lonParsed.ok) {
      return okPoint(input, latParsed.value, lonParsed.value, {
        format: "fms_flex",
      });
    }
    if (
      looksLikeExcessZeros(input) ||
      latParsed.tooMany ||
      lonParsed.tooMany
    ) {
      return unrecognizedCoordError(raw, { tooManyZeros: true });
    }
  } else if (looksLikeCoordPair(input) && looksLikeExcessZeros(input)) {
    return unrecognizedCoordError(raw, { tooManyZeros: true });
  }

  // Expanded oceanic: 57N020W / 5730N020W / 57N02030W
  m = input.match(/^(\d{2})(\d{2})?([NS])(\d{3})(\d{2})?([EW])$/);
  if (m) {
    const lat = dmsToDeg(
      parseInt(m[1], 10),
      m[2] ? parseInt(m[2], 10) : 0,
      0,
      m[3]
    );
    const lon = dmsToDeg(
      parseInt(m[4], 10),
      m[5] ? parseInt(m[5], 10) : 0,
      0,
      m[6]
    );
    return okPoint(input, lat, lon, { format: "expanded" });
  }

  // Glued packed: 5040N01500W
  m = input.match(/^(\d{4,6})([NS])(\d{5,7})([EW])$/);
  if (m) {
    const lat = parsePackedLat(m[1], m[2]);
    const lon = parsePackedLon(m[3], m[4]);
    if (lat != null && lon != null) {
      return okPoint(input, lat, lon, { format: "packed" });
    }
  }

  // NAT slash whole-degree: 54/30 → 54N030W
  m = input.match(/^(\d{2})\/(\d{2})$/);
  if (m) {
    const lat = dmsToDeg(parseInt(m[1], 10), 0, 0, "N");
    const lon = dmsToDeg(parseInt(m[2], 10), 0, 0, "W");
    const name = `${m[1]}N${m[2].padStart(3, "0")}W`;
    return okPoint(name, lat, lon, {
      format: "slash",
      id: `${m[1]}/${m[2]}`,
    });
  }

  // Decimal degrees: 50.0,-15.0
  m = input.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return okPoint(formatCoordLabel(lat, lon), lat, lon, {
        format: "decimal",
        id: `${lat},${lon}`,
      });
    }
  }

  // Pure alpha 5-letter not in DB
  if (/^[A-Z]{5}$/.test(input)) {
    return {
      ok: false,
      error: `Named waypoint ${input} is not in the local database. Enter coordinates or an ARINC code (e.g. 5215N, H5250).`,
    };
  }

  return unrecognizedCoordError(raw, {
    tooManyZeros: looksLikeExcessZeros(input),
  });
}

function formatCoordLabel(lat, lon) {
  const latH = lat >= 0 ? "N" : "S";
  const lonH = lon >= 0 ? "E" : "W";
  const latAbs = Math.abs(lat);
  const lonAbs = Math.abs(lon);
  const latD = Math.floor(latAbs);
  const lonD = Math.floor(lonAbs);
  const latM = Math.round((latAbs - latD) * 60);
  const lonM = Math.round((lonAbs - lonD) * 60);
  return `${String(latD).padStart(2, "0")}${String(latM).padStart(2, "0")}${latH}${String(lonD).padStart(3, "0")}${String(lonM).padStart(2, "0")}${lonH}`;
}

/** Degrees + decimal minutes with rollover (e.g. 59.95' → next degree). */
function degMinTenths(absDeg) {
  let deg = Math.floor(absDeg + 1e-12);
  let min = Math.round((absDeg - deg) * 60 * 10) / 10;
  if (min >= 60) {
    deg += 1;
    min = 0;
  }
  return { deg, min };
}

function formatMinTenths(min) {
  const whole = Math.floor(min + 1e-9);
  const tenth = Math.round((min - whole) * 10);
  return `${String(whole).padStart(2, "0")}.${tenth}`;
}

/** Cockpit / Jeppesen long-hand: N50 00.0 */
export function formatCockpitLat(lat) {
  const hemi = lat >= 0 ? "N" : "S";
  const { deg, min } = degMinTenths(Math.abs(lat));
  return `${hemi}${String(deg).padStart(2, "0")} ${formatMinTenths(min)}`;
}

/** Cockpit / Jeppesen long-hand: W020 00.0 (longitude always 3 digits). */
export function formatCockpitLon(lon) {
  const hemi = lon >= 0 ? "E" : "W";
  const { deg, min } = degMinTenths(Math.abs(lon));
  return `${hemi}${String(deg).padStart(3, "0")} ${formatMinTenths(min)}`;
}

/** Full long-hand pair: N50 00.0 W020 00.0 */
export function formatCockpitLatLon(lat, lon) {
  return `${formatCockpitLat(lat)} ${formatCockpitLon(lon)}`;
}

/**
 * Format a whole/half-degree North Atlantic grid point as ARINC 424 identifier when possible.
 */
export function toArinc424(lat, lon) {
  const latAbs = Math.abs(lat);
  const lonAbs = Math.abs(lon);
  const latDeg = Math.floor(latAbs + 1e-9);
  const lonDeg = Math.floor(lonAbs + 1e-9);
  const latMin = Math.round((latAbs - latDeg) * 60);
  const lonMin = Math.round((lonAbs - lonDeg) * 60);

  // Half-degree N/W only → H format
  if (
    lat >= 0 &&
    lon <= 0 &&
    latMin === 30 &&
    lonMin === 0 &&
    lonDeg < 100
  ) {
    return `H${String(latDeg).padStart(2, "0")}${String(lonDeg).padStart(2, "0")}`;
  }

  if (latMin !== 0 || lonMin !== 0) return null;

  let letter;
  if (lat >= 0 && lon <= 0) letter = "N";
  else if (lat >= 0 && lon >= 0) letter = "E";
  else if (lat < 0 && lon >= 0) letter = "S";
  else letter = "W";

  const latStr = String(latDeg).padStart(2, "0");
  if (lonDeg >= 100) {
    const yy = String(lonDeg - 100).padStart(2, "0");
    return `${latStr}${letter}${yy}`;
  }
  const yy = String(lonDeg).padStart(2, "0");
  return `${latStr}${yy}${letter}`;
}

/**
 * Split a pasted space-separated route string into tokens and parse each.
 * Separators: whitespace, commas, or middle dots (·).
 * Example: "SOMAX 5020N 4930N 4740N 43N050W SOORY"
 *
 * If `airways` is provided, ICAO airway tokens (e.g. M202) are expanded to
 * intermediate fixes between the surrounding named waypoints when known.
 *
 * Also returns `slots` + `unknowns` so the UI can teach missing names
 * without rejecting the whole paste.
 */
export function parseRouteString(raw, db = [], airways = null) {
  const text = String(raw || "").trim();
  if (!text) {
    return {
      ok: false,
      error: "Empty input",
      points: [],
      errors: [],
      slots: [],
      unknowns: [],
      tokens: [],
      airwaySkipped: [],
      airwayExpanded: [],
    };
  }

  let tokens = text
    .replace(/[·•]/g, " ")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return {
      ok: false,
      error: "Empty input",
      points: [],
      errors: [],
      slots: [],
      unknowns: [],
      tokens: [],
      airwaySkipped: [],
      airwayExpanded: [],
    };
  }

  let airwaySkipped = [];
  let airwayExpanded = [];
  if (airways && typeof airways === "object") {
    const exp = expandAirwayTokens(tokens, airways);
    tokens = exp.tokens;
    airwaySkipped = exp.skipped || [];
    airwayExpanded = exp.expanded || [];
  }

  const points = [];
  const errors = [];
  const slots = [];
  const unknowns = [];
  tokens.forEach((token, i) => {
    const result = parseWaypointInput(token, db);
    if (!result.ok) {
      const err = { token, index: i, error: result.error };
      errors.push(err);
      unknowns.push(err);
      slots.push({ type: "unknown", token, index: i });
    } else {
      points.push(result.point);
      slots.push({ type: "point", token, index: i, point: result.point });
    }
  });

  // Unexpanded airway ids count as skipped (not teachable as a single fix)
  for (const awy of airwaySkipped) {
    if (!unknowns.some((u) => u.token === awy)) {
      unknowns.push({
        token: awy,
        index: -1,
        error: `Airway ${awy} could not be expanded (need bounding fixes on that airway).`,
        airway: true,
      });
    }
  }

  if (errors.length || airwaySkipped.length) {
    const detail = errors
      .map((e) => `${e.token} (${e.error})`)
      .join("; ");
    const awyBit = airwaySkipped.length
      ? `${detail ? "; " : ""}airway(s) not expanded: ${airwaySkipped.join(", ")}`
      : "";
    return {
      ok: false,
      error: errors.length
        ? `Could not parse ${errors.length} of ${tokens.length} waypoint(s): ${detail}${awyBit}`
        : `Could not expand airway(s): ${airwaySkipped.join(", ")}`,
      points,
      errors,
      slots,
      unknowns,
      tokens,
      airwaySkipped,
      airwayExpanded,
    };
  }

  return {
    ok: true,
    points,
    errors: [],
    slots,
    unknowns: [],
    tokens,
    airwaySkipped: [],
    airwayExpanded,
  };
}

export function suggestWaypoints(query, db, limit = 8) {
  const q = String(query || "")
    .trim()
    .toUpperCase();
  if (!q) return [];
  // Don't suggest named fixes while typing an ARINC digit code or a full route paste
  if (/\s/.test(q) || /^\d/.test(q) || /^H\d/.test(q) || /^N\d/.test(q)) return [];
  return db
    .filter((w) => w.name.includes(q) || (w.id && w.id.includes(q)))
    .slice(0, limit);
}

/**
 * Parse a latitude cell from the waypoints Markdown tables.
 * Accepts cockpit (N50 00.0), DMS (50°00'00" N), or glued FMS lat-only fragments
 * when paired via parseMdLonCell. Rejects approximate (~) / range text.
 * @returns {number|null}
 */
export function parseMdLatCell(raw) {
  const s = String(raw || "").trim();
  if (!s || /~|–|—|\.\.|various|variable|western|range/i.test(s)) return null;

  // Cockpit / glued: N50 00.0 or N5000.0
  let m = s.match(/^([NS])\s*(\d{2})\s*(\d{2}(?:\.\d+)?)?$/i);
  if (m) {
    const deg = parseInt(m[2], 10);
    const min = m[3] ? parseFloat(m[3]) : 0;
    if (deg > 90 || min >= 60) return null;
    return dmsToDeg(deg, min, 0, m[1]);
  }

  // DMS: 50°00'00" N  /  50°00' N  /  38°45.7' N
  m = s.match(
    /^(\d{1,2})\s*°\s*(\d{1,2}(?:\.\d+)?)?\s*(?:['′]\s*(\d{1,2}(?:\.\d+)?)?\s*(?:["″])?)?\s*([NS])$/i
  );
  if (m) {
    const deg = parseInt(m[1], 10);
    const min = m[2] ? parseFloat(m[2]) : 0;
    const sec = m[3] ? parseFloat(m[3]) : 0;
    if (deg > 90 || min >= 60 || sec >= 60) return null;
    return dmsToDeg(deg, min, sec, m[4]);
  }

  // Full pair in one cell (rare): N50 00.0 W015 00.0
  const glued = String(s).toUpperCase().replace(/\s+/g, "");
  const full = parseWaypointInput(glued, []);
  if (full.ok && full.point) return full.point.lat;

  return null;
}

/**
 * Parse a longitude cell from the waypoints Markdown tables.
 * @returns {number|null}
 */
export function parseMdLonCell(raw) {
  const s = String(raw || "").trim();
  if (!s || /~|–|—|\.\.|various|variable|western|range/i.test(s)) return null;

  // Cockpit / glued: W015 00.0 or W01500.0
  let m = s.match(/^([EW])\s*(\d{2,3})\s*(\d{2}(?:\.\d+)?)?$/i);
  if (m) {
    const deg = parseInt(m[2], 10);
    const min = m[3] ? parseFloat(m[3]) : 0;
    if (deg > 180 || min >= 60) return null;
    return dmsToDeg(deg, min, 0, m[1]);
  }

  // DMS: 015°00'00" W  /  025°10' W  /  060°16'03.3" W
  m = s.match(
    /^(\d{1,3})\s*°\s*(\d{1,2}(?:\.\d+)?)?\s*(?:['′]\s*(\d{1,2}(?:\.\d+)?)?\s*(?:["″])?)?\s*([EW])$/i
  );
  if (m) {
    const deg = parseInt(m[1], 10);
    const min = m[2] ? parseFloat(m[2]) : 0;
    const sec = m[3] ? parseFloat(m[3]) : 0;
    if (deg > 180 || min >= 60 || sec >= 60) return null;
    return dmsToDeg(deg, min, sec, m[4]);
  }

  const glued = String(s).toUpperCase().replace(/\s+/g, "");
  const full = parseWaypointInput(glued, []);
  if (full.ok && full.point) return full.point.lon;

  return null;
}

/**
 * Extract named waypoints with parseable lat/lon from Markdown pipe tables.
 * Skips approximate rows and non-fix tables (e.g. airports with combined coords).
 * @returns {{ name: string, lat: number, lon: number, notes: string }[]}
 */
export function parseWaypointsFromMarkdown(md) {
  const lines = String(md || "").split(/\r?\n/);
  /** @type {{ name: string, lat: number, lon: number, notes: string }[]} */
  const out = [];
  const seen = new Set();

  let cols = null; // { name, lat, lon, notes }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      cols = null;
      continue;
    }
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 3) continue;

    // Separator row
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;

    const lower = cells.map((c) => c.toLowerCase());
    const nameIdx = lower.findIndex((c) =>
      /^(waypoint|fix|name)$/.test(c)
    );
    const latIdx = lower.findIndex((c) => /^lat(itude)?$/.test(c));
    const lonIdx = lower.findIndex((c) => /^lon(gitude)?$/.test(c));
    if (nameIdx >= 0 && latIdx >= 0 && lonIdx >= 0) {
      const notesIdx = lower.findIndex((c) => /note|source/.test(c));
      cols = {
        name: nameIdx,
        lat: latIdx,
        lon: lonIdx,
        notes: notesIdx >= 0 ? notesIdx : -1,
      };
      continue;
    }

    if (!cols) continue;

    const name = String(cells[cols.name] || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    // Named fixes / short ICAO-style ids only (skip prose cells)
    if (!/^[A-Z][A-Z0-9]{1,5}$/.test(name)) continue;

    const lat = parseMdLatCell(cells[cols.lat]);
    const lon = parseMdLonCell(cells[cols.lon]);
    if (lat == null || lon == null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    const notes =
      cols.notes >= 0 && cells[cols.notes]
        ? String(cells[cols.notes]).trim()
        : "Imported from markdown";

    out.push({ name, lat, lon, notes });
  }

  return out;
}
