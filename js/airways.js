/**
 * WATRS / New York OAC airway helpers (educational).
 * Sequences are simplified from published flight-plan samples — verify CIFP/NFDC.
 */

/** ICAO-ish airway id: M202, L603, A699, UL180, N89A, AR18, BR65V */
export function isAirwayToken(token) {
  const t = String(token || "")
    .trim()
    .toUpperCase();
  if (!t || t.length > 6) return false;
  // Exclude pure lat/lon / ARINC digit codes
  if (/^\d/.test(t) || /^[NS]\d/.test(t) || /^H\d/.test(t)) return false;
  return /^[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(t);
}

/**
 * Expand airway tokens using bounding fix names already in the token stream.
 * `airways` map: { M202: { fixes: string[] }, ... } (order = one direction).
 * Returns { tokens, expanded, skipped } where skipped are airway ids that could not expand.
 */
export function expandAirwayTokens(rawTokens, airways = {}) {
  const tokens = (rawTokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  const out = [];
  const expanded = [];
  const skipped = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i].toUpperCase();
    const def = airways[tok];
    if (!isAirwayToken(tok) || !def?.fixes?.length) {
      out.push(tokens[i]);
      continue;
    }

    const prev = out.length
      ? String(out[out.length - 1] || "")
          .trim()
          .toUpperCase()
      : "";
    const next = tokens[i + 1]
      ? String(tokens[i + 1] || "")
          .trim()
          .toUpperCase()
      : "";
    const mids = segmentBetween(def.fixes, prev, next);
    if (!mids) {
      skipped.push(tok);
      continue;
    }
    for (const name of mids) out.push(name);
    if (mids.length) expanded.push({ airway: tok, via: mids, from: prev, to: next });
  }

  return { tokens: out, expanded, skipped };
}

/** Intermediate fixes strictly between a and b on airway (either direction). */
function segmentBetween(fixes, fromName, toName) {
  if (!fixes?.length || !fromName || !toName) return null;
  const a = fixes.findIndex((f) => f === fromName);
  const b = fixes.findIndex((f) => f === toName);
  if (a < 0 || b < 0 || a === b) return null;
  if (a < b) return fixes.slice(a + 1, b);
  return fixes.slice(b + 1, a).reverse();
}

export function airwaysMapFromPayload(payload) {
  const map = Object.create(null);
  const airways = payload?.airways || {};
  for (const [id, def] of Object.entries(airways)) {
    const key = String(id || "")
      .trim()
      .toUpperCase();
    const fixes = (def?.fixes || [])
      .map((f) =>
        String(f || "")
          .trim()
          .toUpperCase()
      )
      .filter(Boolean);
    if (key && fixes.length) map[key] = { fixes, notes: def?.notes || "" };
  }
  return map;
}
