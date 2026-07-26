/**
 * Fetch / parse North Atlantic Organised Track System (OTS) messages.
 * Source: FAA NMS JSON (via local /api/nat-tracks proxy when online).
 * Educational / simulator use only — not certified.
 */

import { parseWaypointInput } from "./parser.js";

const STORAGE_KEY = "mynattrack_nat_tracks_v1";
const FAA_JSON = "https://nms.aim.faa.gov/datanat/nat.json";

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

/**
 * Parse FAA condition_message blocks into structured tracks.
 */
export function parseNatMessages(parts, db = []) {
  const tracks = [];
  const texts = [];
  let tmi = null;
  const groups = [];

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
      // Skip remark-like single letters without route tokens
      const rest = tm[2];
      if (/^(LVLS|RTS)/i.test(rest)) continue;

      const id = tm[1];
      // Stop at EAST/WEST LVLS if glued somehow; normally next lines
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
      groups.push({ id, icao, start, end });
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

/**
 * Fetch latest NAT tracks. Prefers same-origin proxy (serve.py), then direct FAA (often CORS-blocked).
 */
export async function fetchNatTracks(db = []) {
  const errors = [];
  let parts = null;
  let source = null;

  // 1) Local Mac proxy (works for iPad on LAN when serve.py is running)
  try {
    const res = await fetch("./api/nat-tracks", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      parts = data.parts || data;
      source = data.source || "FAA NMS (proxy)";
    } else {
      errors.push(`proxy HTTP ${res.status}`);
    }
  } catch (e) {
    errors.push(`proxy: ${e.message}`);
  }

  // 2) Direct FAA (usually fails CORS in Safari; ok if headers ever allow it)
  if (!parts) {
    try {
      const res = await fetch(FAA_JSON, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        parts = await res.json();
        source = "FAA NMS (direct)";
      } else {
        errors.push(`FAA HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`FAA: ${e.message}`);
    }
  }

  if (!parts || !Array.isArray(parts)) {
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
        "Could not load NAT tracks. When the Mac server is running, Refresh uses the FAA feed via a local proxy. " +
        errors.join("; "),
    };
  }

  const parsed = parseNatMessages(parts, db);
  const payload = {
    fetchedAt: new Date().toISOString(),
    source,
    tmi: parsed.tmi,
    text: parsed.text,
    tracks: parsed.tracks,
    parts,
  };
  saveCachedNatTracks(payload);
  return { ok: true, fromCache: false, ...payload };
}

/** Distinct color per track letter */
export function trackColor(id, direction) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const i = Math.max(0, alphabet.indexOf(String(id || "A").toUpperCase()));
  const hue =
    direction === "east" ? 12 + i * 8 : direction === "west" ? 200 + i * 6 : 140 + i * 7;
  return `hsla(${hue % 360}, 70%, 62%, 0.9)`;
}
