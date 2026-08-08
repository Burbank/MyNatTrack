/**
 * 747-8 airports with confirmed digital ATIS on atis.guru.
 * Educational / convenience only — not a certified ATIS source.
 */

/** Chart ICAO → atis.guru path when identifiers differ (e.g. KDJT was KPBI). */
const DATIS_URL_ALIAS = {
  KDJT: "KPBI",
};

const DATIS_ICAO = new Set([
  // United States / Puerto Rico
  "KABQ",
  "KATL",
  "KAUS",
  "KBDL",
  "KBNA",
  "KBOS",
  "KBWI",
  "KCHS",
  "KCLE",
  "KCVG",
  "KDAL",
  "KDEN",
  "KDFW",
  "KDTW",
  "KELP",
  "KEWR",
  "KFLL",
  "KIAD",
  "KIAH",
  "KIND",
  "KJAX",
  "KJFK",
  "KLAS",
  "KLAX",
  "KMCI",
  "KMCO",
  "KMEM",
  "KMIA",
  "KMKE",
  "KMSP",
  "KOAK",
  "KOKC",
  "KONT",
  "KORD",
  "KPBI",
  "KDJT", // chart ICAO for West Palm Beach (ATIS URL still KPBI)
  "KPDX",
  "KPHL",
  "KPIT",
  "KSAN",
  "KSAT",
  "KSDF",
  "KSEA",
  "KSFO",
  "KSLC",
  "KSTL",
  "KTPA",
  "PANC",
  "PHNL",
  "TJSJ",
  // Australia / New Zealand
  "YPAD",
  "YMAV",
  "YBBN",
  "YMML",
  "YPPH",
  "YSSY",
  "NZAA",
  // Europe
  "EBBR",
  "EDDF",
  "EDDM",
  "EHAM",
  "EGCC",
  "EGKK",
  "EGLL",
  "ENBR",
  "ENGM",
  "LOWG",
  "LOWL",
  "LOWW",
  "LSGG",
  "LSZH",
  // Middle East / Asia / other majors
  "OTBD",
  "OMDB",
  "OMAA",
  "RJAA",
  "RJBB",
  "RJGG",
  "RJTT",
  "RKSI",
  "VHHH",
  "WSSS",
  "ZBAA",
  "ZGGG",
  "ZSPD",
  "ZGSZ",
  "VTBS",
  "VIDP",
  "VABB",
  "VOMM",
  "VOBL",
]);

function normalizeDatisIcao(icao) {
  return String(icao || "")
    .trim()
    .toUpperCase();
}

/** ICAO used in the atis.guru path (may differ from chart label). */
function datisPathIcao(icao) {
  const code = normalizeDatisIcao(icao);
  return DATIS_URL_ALIAS[code] || code;
}

/** @param {string} icao */
export function hasDigitalAtis(icao) {
  const code = normalizeDatisIcao(icao);
  if (!code) return false;
  return DATIS_ICAO.has(code) || DATIS_ICAO.has(datisPathIcao(code));
}

/** @param {string} icao */
export function datisHttpsUrl(icao) {
  if (!hasDigitalAtis(icao)) return "";
  const pathCode = datisPathIcao(icao);
  return `https://atis.guru/atis/${pathCode}`;
}

/**
 * Open live D-ATIS in Safari / a new browser tab (not inside the PWA).
 * Requires a user gesture; no-op when offline.
 * @param {string} icao
 */
export function openDatisInSafari(icao) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }
  const httpsUrl = datisHttpsUrl(icao);
  if (!httpsUrl) return false;

  // Anchor + _blank keeps the Home Screen app in place and opens Safari/system browser.
  try {
    const a = document.createElement("a");
    a.href = httpsUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    /* fall through */
  }

  const win = window.open(httpsUrl, "_blank", "noopener,noreferrer");
  if (win) return true;

  // Last resort on stubborn standalone shells: hand off to Safari without in-app browse
  const hostPath = httpsUrl.replace(/^https:\/\//i, "");
  window.location.href = `x-safari-https://${hostPath}`;
  return true;
}
