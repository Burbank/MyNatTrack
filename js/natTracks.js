/**
 * Fetch / parse North Atlantic Organised Track System (OTS) messages.
 *
 * Sources (in order):
 *  1) Same-origin /api/nat-tracks proxy (serve.py → FAA NMS, or VATSIM fallback)
 *  2) VATSIM natTrak JSON (CORS open — works from GitHub Pages)
 *  3) Direct FAA NMS JSON (usually CORS-blocked in browsers)
 *
 * Educational / simulator use only — not certified.
 */

import { parseWaypointInput } from "./parser.js";

const STORAGE_KEY = "mynattrack_nat_tracks_v1";
const FAA_JSON = "https://nms.aim.faa.gov/datanat/nat.json";
/** Public CORS-enabled OTS mirror used by VATSIM oceanic (mirrors daily NAT tracks). */
const VATSIM_TRACKS = "https://nattrak.vatsim.net/api/tracks";

function parseTimeMs(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let s = String(value).trim();
  // Safari is picky: trim >3 fractional digits; allow space separator
  s = s.replace(/(\.\d{3})\d+/g, "$1").replace(" ", "T");
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : NaN;
}

function looksLikeTmi(value) {
  return /^[0-9]{1,3}[A-Z]?$/i.test(String(value || "").trim());
}

/** Infer TMI from payload / message / validity day-of-year — never a source name. */
export function inferTmi(nat) {
  if (!nat) return null;
  if (looksLikeTmi(nat.tmi)) return String(nat.tmi).trim().toUpperCase();
  const fromText = String(nat.text || "").match(/TMI\s+IS\s+([0-9]{1,3}[A-Z]?)/i);
  if (fromText) return fromText[1].toUpperCase();
  // OTS TMI is commonly the UTC day-of-year of the track scheme
  for (const t of nat.tracks || []) {
    const ms = parseTimeMs(t.validFrom) || parseTimeMs(t.validTo);
    if (!Number.isFinite(ms)) continue;
    const d = new Date(ms);
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const day = Math.floor((ms - start) / 86400000);
    if (day >= 1 && day <= 366) return String(day);
  }
  return null;
}

/**
 * Parse a single NAT fix token from a track line.
 * Supports named fixes, 57/50, 5130/30, and ARINC/expanded forms.
 */
export function parseNatFix(token, db = []) {
  const t = String(token || "")
    .trim()
    .toUpperCase();
  if (!t) return null;

  // Half-degree / whole-degree slash: 57/50 or 5130/30 → N / W
  let m = t.match(/^(\d{2})(\d{2})?\/(\d{2,3})$/);
  if (m) {
    const latDeg = parseInt(m[1], 10);
    const latMin = m[2] ? parseInt(m[2], 10) : 0;
    const lonDeg = parseInt(m[3], 10);
    if (latDeg > 90 || latMin >= 60 || lonDeg > 180) return null;
    return {
      name: t,
      lat: latDeg + latMin / 60,
      lon: -lonDeg,
      format: "nat_slash",
    };
  }

  const parsed = parseWaypointInput(t, db);
  if (!parsed.ok) return null;
  return {
    name: parsed.point.name,
    lat: parsed.point.lat,
    lon: parsed.point.lon,
    format: parsed.point.format || "named",
  };
}

function parseLevels(line) {
  if (!line || /\bNIL\b/i.test(line)) return [];
  return (line.match(/\b\d{3}\b/g) || []).map((n) => parseInt(n, 10));
}

function parseValidity(text) {
  // JUL 27/0100Z TO JUL 27/0800Z
  const m = text.match(
    /([A-Z]{3})\s+(\d{1,2})\/(\d{4})Z\s+TO\s+([A-Z]{3})\s+(\d{1,2})\/(\d{4})Z/i
  );
  if (!m) return { label: "", from: null, to: null };
  const label = `${m[1]} ${m[2]}/${m[3]}Z TO ${m[4]} ${m[5]}/${m[6]}Z`;
  return { label, from: null, to: null };
}

function extractTmi(text) {
  const m = text.match(/TMI\s+IS\s+([0-9]{1,3}[A-Z]?)/i);
  return m ? m[1].toUpperCase() : null;
}

function formatIsoValidity(from, to) {
  const a = from ? String(from).replace(/\.\d+Z$/, "Z") : "";
  const b = to ? String(to).replace(/\.\d+Z$/, "Z") : "";
  if (a && b) return `${a} TO ${b}`;
  return a || b || "";
}

function feetToFl(list) {
  return (list || [])
    .map((f) => {
      const n = Number(f);
      if (!Number.isFinite(n)) return null;
      return n >= 1000 ? Math.round(n / 100) : Math.round(n);
    })
    .filter((n) => n != null && n > 0);
}

/**
 * Parse FAA condition_message blocks into structured tracks.
 */
export function parseNatMessages(parts, db = []) {
  const tracks = [];
  const texts = [];
  let tmi = null;

  for (const part of parts || []) {
    const msg = (part.condition_message || part.message || "").replace(/\r/g, "");
    if (!msg.trim()) continue;
    texts.push(msg.trim());
    if (!tmi) tmi = extractTmi(msg);
    const validity = parseValidity(msg);
    const icao = part.icao_id || part.origin_id || "";
    const start = part.start_datetime || null;
    const end = part.end_datetime || null;

    const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Track line: "A DINIM 51/20 …" or "S DORYY 57/50 …"
      const tm = line.match(/^([A-Z])\s+(.+)$/);
      if (!tm) continue;
      if (/^(NAT|PART|REMARKS|EAST|WEST|EUR|NAR|END|TMI|SEND|PBCS|OPERATORS)/i.test(line)) {
        continue;
      }
      const rest = tm[2];
      if (/^(LVLS|RTS)/i.test(rest)) continue;

      const id = tm[1];
      const tokens = [];
      for (const tok of rest.split(/\s+/)) {
        if (/^(EAST|WEST)$/i.test(tok)) break;
        if (/^LVLS$/i.test(tok)) break;
        tokens.push(tok);
      }
      if (tokens.length < 2) continue;

      const points = [];
      for (const tok of tokens) {
        const fix = parseNatFix(tok, db);
        if (fix) points.push(fix);
      }
      if (points.length < 2) continue;

      tracks.push({
        id,
        points,
        icao,
        validFrom: start,
        validTo: end,
        validityLabel: validity.label,
        eastLevels: [],
        westLevels: [],
        direction: "unknown",
      });
    }

    // Second pass: attach FLs from following lines per track id (simple scan)
    let currentId = null;
    for (const line of lines) {
      const head = line.match(/^([A-Z])\s+\S/);
      if (head && !/^(EAST|WEST)/i.test(line)) {
        currentId = head[1];
      }
      if (!currentId) continue;
      const track = tracks.filter((t) => t.id === currentId && t.icao === icao).at(-1);
      if (!track) continue;
      if (/^EAST\s+LVLS/i.test(line)) {
        track.eastLevels = parseLevels(line);
      } else if (/^WEST\s+LVLS/i.test(line)) {
        track.westLevels = parseLevels(line);
      }
      if (track.eastLevels.length && !track.westLevels.length) track.direction = "east";
      else if (track.westLevels.length && !track.eastLevels.length) track.direction = "west";
      else if (track.eastLevels.length && track.westLevels.length) track.direction = "both";
    }
  }

  // Deduplicate by id+validity window (keep first with most points)
  const byKey = new Map();
  for (const t of tracks) {
    const key = `${t.id}|${t.validFrom}|${t.validTo}|${t.icao}`;
    const prev = byKey.get(key);
    if (!prev || t.points.length > prev.points.length) byKey.set(key, t);
  }

  return {
    tmi,
    tracks: [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id)),
    text: texts.join("\n\n────────\n\n"),
    parts: parts || [],
  };
}

/**
 * Parse VATSIM natTrak /api/tracks rows into the same track shape as FAA parse.
 */
export function parseVatsimTracks(rows, db = []) {
  const tracks = [];
  const textLines = [
    "Source: VATSIM natTrak (https://nattrak.vatsim.net/api/tracks)",
    "",
  ];

  const nowMs = Date.now();
  for (const row of rows || []) {
    if (!row) continue;
    if (Number(row.concorde) > 0) continue;

    const id = String(row.identifier || "")
      .trim()
      .toUpperCase();
    const route = String(row.last_routeing || "").trim();
    if (!/^[A-Z]$/.test(id) || !route) continue;

    const validFrom = row.valid_from || null;
    const validTo = row.valid_to || null;
    const fromMs = parseTimeMs(validFrom);
    const toMs = parseTimeMs(validTo);

    // Keep inactive/expired rows briefly so west/east clocks can show "Expired"
    // instead of empty placeholders when VATSIM flips active=false after valid_to.
    if (row.active === false) {
      const pending = Number.isFinite(fromMs) && fromMs > nowMs;
      const recentlyEnded =
        Number.isFinite(toMs) && toMs > nowMs - 18 * 3600 * 1000;
      if (!pending && !recentlyEnded) continue;
    }

    const points = [];
    for (const tok of route.split(/\s+/)) {
      const fix = parseNatFix(tok, db);
      if (fix) points.push(fix);
    }
    if (points.length < 2) continue;

    const fls = feetToFl(row.flight_levels);
    const dirRaw = String(row.direction || "").toLowerCase();
    const direction =
      dirRaw === "east" || dirRaw === "west" ? dirRaw : "unknown";
    const validityLabel = formatIsoValidity(validFrom, validTo);

    tracks.push({
      id,
      points,
      icao: "VATSIM",
      validFrom,
      validTo,
      validityLabel,
      eastLevels: direction === "east" ? fls : [],
      westLevels: direction === "west" ? fls : [],
      direction,
    });

    textLines.push(`${id} ${route}`);
    if (validityLabel) textLines.push(`  VALID ${validityLabel}`);
    if (direction === "east" && fls.length) {
      textLines.push(`  EAST LVLS ${fls.join(" ")}`);
    } else if (direction === "west" && fls.length) {
      textLines.push(`  WEST LVLS ${fls.join(" ")}`);
    } else if (fls.length) {
      textLines.push(`  LVLS ${fls.join(" ")}`);
    }
    textLines.push("");
  }

  tracks.sort((a, b) => a.id.localeCompare(b.id));
  const parsed = {
    tmi: null,
    tracks,
    text: textLines.join("\n").trim(),
    parts: [],
  };
  parsed.tmi = inferTmi(parsed);
  return parsed;
}

export function loadCachedNatTracks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCachedNatTracks(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function buildPayload(parsed, source) {
  const payload = {
    fetchedAt: new Date().toISOString(),
    source,
    tmi: parsed.tmi || inferTmi(parsed),
    text: parsed.text,
    tracks: parsed.tracks,
    parts: parsed.parts || [],
  };
  saveCachedNatTracks(payload);
  return { ok: true, fromCache: false, ...payload };
}

async function tryFetchJson(url, label) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch latest NAT tracks. Prefers local FAA proxy, then VATSIM (CORS-open), then direct FAA.
 */
export async function fetchNatTracks(db = []) {
  const errors = [];

  // 1) Local Mac proxy (FAA when available; may also return VATSIM-shaped payload)
  try {
    const data = await tryFetchJson("./api/nat-tracks", "proxy");
    if (data.format === "vatsim" || Array.isArray(data.vatsimTracks)) {
      const parsed = parseVatsimTracks(data.vatsimTracks || data.tracks || [], db);
      if (parsed.tracks.length) {
        return buildPayload(
          parsed,
          data.source || "VATSIM natTrak (proxy)"
        );
      }
    }
    const parts = data.parts || data;
    if (Array.isArray(parts) && parts.length) {
      const parsed = parseNatMessages(parts, db);
      if (parsed.tracks.length || parsed.text) {
        return buildPayload(parsed, data.source || "FAA NMS (proxy)");
      }
    }
    errors.push("proxy: empty payload");
  } catch (e) {
    errors.push(`proxy: ${e.message}`);
  }

  // 2) VATSIM natTrak — works from GitHub Pages (Access-Control-Allow-Origin: *)
  try {
    const rows = await tryFetchJson(VATSIM_TRACKS, "VATSIM");
    if (Array.isArray(rows) && rows.length) {
      const parsed = parseVatsimTracks(rows, db);
      if (parsed.tracks.length) {
        return buildPayload(parsed, "VATSIM natTrak");
      }
      errors.push("VATSIM: no parseable active tracks");
    } else {
      errors.push("VATSIM: empty list");
    }
  } catch (e) {
    errors.push(`VATSIM: ${e.message}`);
  }

  // 3) Direct FAA (usually fails CORS in Safari / GitHub Pages)
  try {
    const parts = await tryFetchJson(FAA_JSON, "FAA");
    if (Array.isArray(parts) && parts.length) {
      const parsed = parseNatMessages(parts, db);
      return buildPayload(parsed, "FAA NMS (direct)");
    }
    errors.push("FAA: empty list");
  } catch (e) {
    errors.push(`FAA: ${e.message}`);
  }

  const cached = loadCachedNatTracks();
  if (cached) {
    return {
      ok: true,
      fromCache: true,
      ...cached,
      warning: `Online fetch failed (${errors.join("; ")}). Showing last saved message.`,
    };
  }
  return {
    ok: false,
    error:
      "Could not load NAT tracks from VATSIM natTrak or FAA. " +
      errors.join("; "),
  };
}

/** Distinct color per track letter */
export function trackColor(id, direction) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const i = Math.max(0, alphabet.indexOf(String(id || "A").toUpperCase()));
  const hue =
    direction === "east" ? 12 + i * 8 : direction === "west" ? 200 + i * 6 : 140 + i * 7;
  return `hsla(${hue % 360}, 70%, 62%, 0.9)`;
}

/** True when track is inside its validity window (unknown times count as valid). */
export function isTrackValidAt(track, nowMs = Date.now()) {
  if (!track) return false;
  const fromMs = parseTimeMs(track.validFrom);
  const toMs = parseTimeMs(track.validTo);
  if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) return true;
  if (Number.isFinite(fromMs) && nowMs < fromMs) return false;
  if (Number.isFinite(toMs) && nowMs > toMs) return false;
  return true;
}

export function formatHhmmZ(ms) {
  if (!Number.isFinite(ms)) return "————Z";
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}${mm}Z`;
}

/** ETE-style countdown: H+MM */
export function formatCountdownHmm(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}+${String(m).padStart(2, "0")}`;
}

/**
 * Live clock card model for one direction.
 * Prefers the currently active window, else next pending, else last expired.
 * @returns {{
 *   phase: 'unknown'|'pending'|'active'|'expired',
 *   title: string,
 *   windowLabel: string,
 *   countdown: string,
 *   tone: 'muted'|'active'|'urgent'|'expired'
 * }}
 */
export function directionClockModel(tracks, direction, nowMs = Date.now()) {
  const defaultTitle =
    direction === "east" ? "Eastbound Tracks" : "Westbound Tracks";

  const windows = [];
  for (const t of tracks || []) {
    const dir = t.direction || "unknown";
    if (dir !== direction && dir !== "both") continue;
    const fromMs = parseTimeMs(t.validFrom);
    const toMs = parseTimeMs(t.validTo);
    if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) continue;
    windows.push({ fromMs, toMs });
  }

  if (!windows.length) {
    return {
      phase: "unknown",
      title: defaultTitle,
      windowLabel: "No time data",
      countdown: "—",
      tone: "muted",
    };
  }

  const active = windows.filter(
    (w) =>
      (!Number.isFinite(w.fromMs) || nowMs >= w.fromMs) &&
      (!Number.isFinite(w.toMs) || nowMs <= w.toMs)
  );
  const pending = windows
    .filter((w) => Number.isFinite(w.fromMs) && nowMs < w.fromMs)
    .sort((a, b) => a.fromMs - b.fromMs);
  const expired = windows
    .filter((w) => Number.isFinite(w.toMs) && nowMs > w.toMs)
    .sort((a, b) => b.toMs - a.toMs);

  /** @type {{ fromMs: number, toMs: number } | null} */
  let chosen = null;
  /** @type {'pending'|'active'|'expired'} */
  let phase = "expired";

  if (active.length) {
    phase = "active";
    const froms = active.map((w) => w.fromMs).filter(Number.isFinite);
    const tos = active.map((w) => w.toMs).filter(Number.isFinite);
    chosen = {
      fromMs: froms.length ? Math.min(...froms) : NaN,
      toMs: tos.length ? Math.max(...tos) : NaN,
    };
  } else if (pending.length) {
    phase = "pending";
    chosen = pending[0];
  } else {
    phase = "expired";
    chosen = expired[0] || windows[0];
  }

  const fromMs = chosen?.fromMs;
  const toMs = chosen?.toMs;
  const windowLabel =
    Number.isFinite(fromMs) && Number.isFinite(toMs)
      ? `${formatHhmmZ(fromMs)} to ${formatHhmmZ(toMs)}`
      : Number.isFinite(fromMs)
        ? `from ${formatHhmmZ(fromMs)}`
        : `until ${formatHhmmZ(toMs)}`;

  if (phase === "pending") {
    const left = fromMs - nowMs;
    const dirWord = direction === "east" ? "Eastbound" : "Westbound";
    return {
      phase,
      title: `${dirWord} · Will Become Active in`,
      windowLabel,
      countdown: formatCountdownHmm(left) || "0+00",
      tone: left < 3600000 ? "urgent" : "muted",
    };
  }

  if (phase === "expired") {
    return {
      phase,
      title: defaultTitle,
      windowLabel,
      countdown: "Expired",
      tone: "expired",
    };
  }

  const left = Number.isFinite(toMs) ? toMs - nowMs : NaN;
  return {
    phase,
    title: defaultTitle,
    windowLabel,
    countdown: formatCountdownHmm(left) || "0+00",
    tone: Number.isFinite(left) && left < 3600000 ? "urgent" : "active",
  };
}
