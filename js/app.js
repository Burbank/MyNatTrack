import {
  vincentyInverse,
  averageBearing,
  formatTrack,
  formatDistanceNm,
} from "./geodesy.js";
import {
  formatCockpitLat,
  formatCockpitLatLon,
  formatCockpitLon,
  parseRouteString,
  parseWaypointInput,
  parseWaypointsFromMarkdown,
  suggestWaypoints,
} from "./parser.js";
import {
  trueToMagnetic,
  formatVariation,
  MAGVAR_TABLE_DATE,
  MAGVAR_DRIFT_REMARK,
} from "./magvar.js";
import { drawChart, loadLandData } from "./chart.js";
import {
  fetchNatTracks,
  loadCachedNatTracks,
  trackColor,
  isTrackValidAt,
  directionClockModel,
  inferTmi,
} from "./natTracks.js";
import { ensureUnlocked } from "./auth.js";
import {
  diversionAirportsAlpha,
  runwayLabels,
} from "./diversionAirports.js";

const STORAGE_KEY = "mynattrack_route_v1";
/** Explicit stored baseline for NM difference (Save route / Route stored). */
const STORED_ROUTE_KEY = "mynattrack_stored_route_v1";
const SETTINGS_KEY = "mynattrack_settings_v1";
/** Waypoints learned silently from NAT track messages (coords already in the message). */
const LEARNED_WP_KEY = "mynattrack_learned_waypoints_v1";
const LEARNED_VERIFIED_KEY = "mynattrack_accuracy_verified_v1";
const LEARNED_MD_START = "<!-- LEARNED-NAT-START -->";
const LEARNED_MD_END = "<!-- LEARNED-NAT-END -->";

const state = {
  db: [],
  route: [],
  /** @type {number|null} index being edited, or null when appending */
  editingIndex: null,
  /** @type {number|null} insert after this index (null = append at end) */
  insertAfterIndex: null,
  settings: {
    showMagnetic: true,
    showAirspace: true,
    showRwyLabels: true,
    showEastTracks: true,
    showWestTracks: true,
    /** Remember Valid-only checkbox across reloads (same as East/West) */
    validOnlyTracks: true,
  },
  mdText: "",
  /** Original bundled markdown before learned-NAT section is merged */
  mdBaseText: "",
  /** Bundled waypoints.json accuracy date; may be superseded by learned updates */
  accuracyVerifiedOn: "",
  nat: null,
  /** Last NAT fetch failure (shown only in the NAT panel) */
  natFetchError: "",
  natLoading: false,
  /** Signature of currently-valid track ids (for chart refresh on expiry) */
  natValidityKey: "",
  /** Pinch / wheel zoom on top of auto-fit (1 = fitted) */
  chartZoom: 1.35,
  /** Pan offsets from fitted center (degrees) */
  chartPan: { dLat: 0, dLon: 0 },
  /** Last drawn layout (for pan sensitivity) */
  lastChartLayout: null,
  /** Device GPS for ownship marker on chart */
  gps: null,
  gpsWatchId: null,
  gpsLastDrawMs: 0,
  /** edit = route+chart+legs; fly = chart left, legs right */
  uiMode: "edit",
  /**
   * Active leg FROM-index (route[i] → route[i+1]).
   * Sequenced forward by along-track / capture; hysteresis avoids flip-flop.
   */
  activeLegIndex: null,
  routeSeqKey: "",
  /**
   * Explicit baseline from “Save route” / “Route stored”.
   * Diffs always compare the working route against this snapshot.
   * @type {null | { waypoints: number, totalNm: number, key: string, route: object[] }}
   */
  storedRoute: null,
  /** Cached from last renderLegs — avoids Vincenty on every GPS fix. */
  routeTotals: { legsCount: 0, totalNm: 0, key: "" },
  /**
   * Teach-unknown-waypoint wizard.
   * @type {null | {
   *   unknowns: { token: string, index: number }[],
   *   cursor: number,
   *   slots: object[],
   *   commit: { kind: 'replace'|'append'|'insert'|'edit', insertAt?: number, editIndex?: number }
   * }}
   */
  teach: null,
};

const el = {
  input: document.getElementById("wp-input"),
  suggest: document.getElementById("suggest"),
  addBtn: document.getElementById("add-btn"),
  clearBtn: document.getElementById("clear-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  routeHint: document.getElementById("route-hint"),
  routeStoreBtn: document.getElementById("route-store-btn"),
  routeStoreLabel: document.getElementById("route-store-label"),
  routeStoreConfirm: document.getElementById("route-store-confirm"),
  routeStoreConfirmCancel: document.getElementById("route-store-confirm-cancel"),
  routeStoreConfirmOk: document.getElementById("route-store-confirm-ok"),
  routeClearConfirm: document.getElementById("route-clear-confirm"),
  routeClearConfirmCancel: document.getElementById("route-clear-confirm-cancel"),
  routeClearEditsBtn: document.getElementById("route-clear-edits-btn"),
  routeClearAllBtn: document.getElementById("route-clear-all-btn"),
  routeList: document.getElementById("route-list"),
  legsBody: document.getElementById("legs-body"),
  totals: document.getElementById("totals"),
  totalsCompare: document.getElementById("totals-compare"),
  legsModDiff: document.getElementById("legs-mod-diff"),
  chart: document.getElementById("chart"),
  error: document.getElementById("error"),
  teachPanel: document.getElementById("teach-panel"),
  teachTitle: document.getElementById("teach-title"),
  teachProgress: document.getElementById("teach-progress"),
  teachName: document.getElementById("teach-name"),
  teachCoords: document.getElementById("teach-coords"),
  teachError: document.getElementById("teach-error"),
  teachSaveBtn: document.getElementById("teach-save-btn"),
  teachSkipBtn: document.getElementById("teach-skip-btn"),
  teachCancelBtn: document.getElementById("teach-cancel-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  settingsClose: document.getElementById("settings-close"),
  verifyFlowBtn: document.getElementById("verify-flow-btn"),
  verifyFlowPanel: document.getElementById("verify-flow-panel"),
  verifyFlowClose: document.getElementById("verify-flow-close"),
  magToggle: document.getElementById("mag-toggle"),
  airspaceToggle: document.getElementById("airspace-toggle"),
  magvarTableDate: document.getElementById("magvar-table-date"),
  rwyLabelsToggle: document.getElementById("rwy-labels-toggle"),
  diversionIcaoList: document.getElementById("diversion-icao-list"),
  openMdBtn: document.getElementById("open-md-btn"),
  mdPanel: document.getElementById("md-panel"),
  mdClose: document.getElementById("md-close"),
  mdShareBtn: document.getElementById("md-share-btn"),
  mdImportBtn: document.getElementById("md-import-btn"),
  mdContent: document.getElementById("md-content"),
  mdShareHelp: document.getElementById("md-share-help"),
  mdShareHelpCancel: document.getElementById("md-share-help-cancel"),
  mdShareHelpContinue: document.getElementById("md-share-help-continue"),
  mdImportHelp: document.getElementById("md-import-help"),
  mdImportHelpCancel: document.getElementById("md-import-help-cancel"),
  mdImportHelpContinue: document.getElementById("md-import-help-continue"),
  mdImportFile: document.getElementById("md-import-file"),
  mdImportStatus: document.getElementById("md-import-status"),
  settingsVerify: document.getElementById("settings-verify"),
  natTracksBtn: document.getElementById("nat-tracks-btn"),
  natPanel: document.getElementById("nat-panel"),
  natClose: document.getElementById("nat-close"),
  natRefreshBtn: document.getElementById("nat-refresh-btn"),
  showEastTracks: document.getElementById("show-east-tracks"),
  showWestTracks: document.getElementById("show-west-tracks"),
  validOnlyTracks: document.getElementById("valid-only-tracks"),
  natTmi: document.getElementById("nat-tmi"),
  natStatus: document.getElementById("nat-status"),
  natMessage: document.getElementById("nat-message"),
  natClockEast: document.getElementById("nat-clock-east"),
  natClockWest: document.getElementById("nat-clock-west"),
  chartUtcClock: document.getElementById("chart-utc-clock"),
  natUtcClock: document.getElementById("nat-utc-clock"),
  themeBtn: document.getElementById("theme-btn"),
  chartFullscreenBtn: document.getElementById("chart-fullscreen-btn"),
  modeEditBtn: document.getElementById("mode-edit-btn"),
  modeFlyBtn: document.getElementById("mode-fly-btn"),
  thAvgMag: document.getElementById("th-avg-mag"),
  thInitMag: document.getElementById("th-init-mag"),
};

const THEME_KEY = "mynattrack_theme_v1";
const UI_MODE_KEY = "mynattrack_ui_mode_v1";

let chartRaf = 0;
let chartLitePending = false;
let chartIdleTimer = 0;
let natClockTimer = 0;

function loadThemePref() {
  try {
    return localStorage.getItem(THEME_KEY) === "bright" ? "bright" : "dim";
  } catch {
    return "dim";
  }
}

function applyTheme(mode, { paint = true } = {}) {
  const bright = mode === "bright";
  document.documentElement.classList.toggle("theme-bright", bright);
  if (el.themeBtn) {
    el.themeBtn.textContent = bright ? "Dim" : "Bright";
    el.themeBtn.title = bright
      ? "Switch to dim cockpit theme"
      : "Switch to Hi-Contrast Day Theme";
    el.themeBtn.setAttribute("aria-pressed", bright ? "true" : "false");
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", bright ? "#ffffff" : "#0b1520");
  try {
    localStorage.setItem(THEME_KEY, bright ? "bright" : "dim");
  } catch {
    /* ignore */
  }
  if (paint) renderChart();
}

function toggleTheme() {
  applyTheme(
    document.documentElement.classList.contains("theme-bright") ? "dim" : "bright"
  );
}

function syncTrackToggleUi() {
  // One shared set of checkboxes for normal + fullscreen — keep UI aligned with settings
  if (el.validOnlyTracks) {
    el.validOnlyTracks.checked = state.settings.validOnlyTracks !== false;
  }
  if (el.showEastTracks) {
    el.showEastTracks.checked = state.settings.showEastTracks !== false;
  }
  if (el.showWestTracks) {
    el.showWestTracks.checked = state.settings.showWestTracks !== false;
  }
}

function setChartFullscreen(on) {
  document.body.classList.toggle("chart-fullscreen", on);
  if (el.chartFullscreenBtn) {
    el.chartFullscreenBtn.textContent = on ? "Exit full screen" : "Full screen";
    el.chartFullscreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
    el.chartFullscreenBtn.title = on ? "Exit full screen chart" : "Full screen chart";
  }
  syncTrackToggleUi();
  // Allow layout to settle before redraw
  requestAnimationFrame(() => {
    requestAnimationFrame(() => renderChart());
  });
}

function toggleChartFullscreen() {
  setChartFullscreen(!document.body.classList.contains("chart-fullscreen"));
}

function showError(msg) {
  if (!el.error) return;
  el.error.textContent = msg || "";
  el.error.hidden = !msg;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (_) {
    /* ignore */
  }
  // East/West chart toggles default ON
  if (state.settings.showEastTracks !== false) state.settings.showEastTracks = true;
  if (state.settings.showWestTracks !== false) state.settings.showWestTracks = true;
  if (state.settings.validOnlyTracks !== false) state.settings.validOnlyTracks = true;
  if (el.magToggle) el.magToggle.checked = state.settings.showMagnetic;
  if (state.settings.showAirspace !== false) state.settings.showAirspace = true;
  if (el.airspaceToggle) el.airspaceToggle.checked = state.settings.showAirspace !== false;
  if (state.settings.showRwyLabels !== false) state.settings.showRwyLabels = true;
  if (el.rwyLabelsToggle) el.rwyLabelsToggle.checked = state.settings.showRwyLabels !== false;
  if (el.showEastTracks) el.showEastTracks.checked = state.settings.showEastTracks;
  if (el.showWestTracks) el.showWestTracks.checked = state.settings.showWestTracks;
  if (el.validOnlyTracks) el.validOnlyTracks.checked = state.settings.validOnlyTracks;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function loadRoute() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) state.route = parsed;
    }
  } catch (_) {
    state.route = [];
  }
}

function snapshotRoutePoints(route) {
  return (route || []).map((w) => ({
    id: w.id || w.name,
    name: w.name,
    lat: w.lat,
    lon: w.lon,
    accuracy: w.accuracy,
    category: w.category,
    notes: w.notes,
    format: w.format,
  }));
}

function computeRouteTotalNm(route) {
  if (!route || route.length < 2) return 0;
  let totalNm = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (
      !Number.isFinite(a?.lat) ||
      !Number.isFinite(a?.lon) ||
      !Number.isFinite(b?.lat) ||
      !Number.isFinite(b?.lon)
    ) {
      continue;
    }
    totalNm += vincentyInverse(a.lat, a.lon, b.lat, b.lon).distanceNm;
  }
  return totalNm;
}

function loadStoredRoute() {
  try {
    const raw = localStorage.getItem(STORED_ROUTE_KEY);
    if (!raw) {
      state.storedRoute = null;
      return;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.route) &&
      Number.isFinite(parsed.waypoints) &&
      Number.isFinite(parsed.totalNm)
    ) {
      state.storedRoute = {
        waypoints: parsed.waypoints,
        totalNm: parsed.totalNm,
        key: parsed.key || routeSequenceKey(parsed.route),
        route: parsed.route,
      };
    } else {
      state.storedRoute = null;
    }
  } catch {
    state.storedRoute = null;
  }
}

function persistStoredRoute(snapshot) {
  state.storedRoute = snapshot;
  try {
    if (snapshot) {
      localStorage.setItem(STORED_ROUTE_KEY, JSON.stringify(snapshot));
    } else {
      localStorage.removeItem(STORED_ROUTE_KEY);
    }
  } catch {
    /* ignore */
  }
  updateRouteStoreButton();
}

/** Snapshot the current working route as the comparison baseline. */
function storeCurrentRouteAsBaseline() {
  const route = snapshotRoutePoints(state.route);
  const key = routeSequenceKey(route);
  const totalNm =
    state.routeTotals.key === key
      ? state.routeTotals.totalNm
      : computeRouteTotalNm(route);
  persistStoredRoute({
    waypoints: route.length,
    totalNm,
    key,
    route,
  });
}

function clearStoredRoute() {
  persistStoredRoute(null);
}

function updateRouteStoreButton() {
  const stored = !!state.storedRoute;
  if (el.routeStoreLabel) {
    el.routeStoreLabel.textContent = stored ? "Stored" : "Save";
  }
  if (el.routeStoreBtn) {
    el.routeStoreBtn.classList.toggle("is-stored", stored);
    el.routeStoreBtn.setAttribute(
      "aria-label",
      stored
        ? "Route stored — tap to update the comparison baseline"
        : "Save route as comparison baseline"
    );
  }
}

function onRouteStoreBtnClick() {
  if (state.storedRoute) {
    if (el.routeStoreConfirm) el.routeStoreConfirm.hidden = false;
    return;
  }
  storeCurrentRouteAsBaseline();
  updateTotalsCompare();
}

function restoreRouteFromStored() {
  if (!state.storedRoute?.route?.length) {
    state.route = [];
  } else {
    state.route = snapshotRoutePoints(state.storedRoute.route).map((p) =>
      enrichPoint({ ...p })
    );
  }
  state.editingIndex = null;
  state.insertAfterIndex = null;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  updateEntryChrome();
  renderAll();
}

function clearWorkingRouteOnly() {
  state.route = [];
  state.editingIndex = null;
  state.insertAfterIndex = null;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  resetChartView();
  updateEntryChrome();
  renderAll();
}

function clearEditsAction() {
  if (el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  if (state.storedRoute?.route?.length) {
    restoreRouteFromStored();
  } else {
    clearWorkingRouteOnly();
  }
}

function clearAllAction() {
  if (el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  clearStoredRoute();
  clearWorkingRouteOnly();
}

function saveRoute() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.route));
}

function loadLearnedWaypoints() {
  try {
    const raw = localStorage.getItem(LEARNED_WP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLearnedWaypoints(list) {
  try {
    localStorage.setItem(LEARNED_WP_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — ignore silently */
  }
}

function mergeLearnedWaypointsIntoDb() {
  const learned = loadLearnedWaypoints();
  if (!learned.length) return;
  const known = new Set(state.db.map((w) => String(w.name || "").toUpperCase()));
  for (const w of learned) {
    const name = String(w?.name || "").toUpperCase();
    if (!name || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) continue;
    if (known.has(name)) continue;
    state.db.push({
      id: w.id || name,
      name,
      lat: w.lat,
      lon: w.lon,
      accuracy: w.accuracy || "approximate",
      category: w.category || "nat-track",
      notes: w.notes || "Learned from NAT tracks message",
    });
    known.add(name);
  }
}

function todayUtcDate() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd}`;
}

function loadStoredAccuracyDate() {
  try {
    return localStorage.getItem(LEARNED_VERIFIED_KEY) || "";
  } catch {
    return "";
  }
}

function setAccuracyVerifiedDate(isoDate) {
  if (!isoDate) return;
  state.accuracyVerifiedOn = isoDate;
  try {
    localStorage.setItem(LEARNED_VERIFIED_KEY, isoDate);
  } catch {
    /* ignore */
  }
  if (el.settingsVerify) {
    el.settingsVerify.textContent = `Waypoint accuracy last verified on ${isoDate}`;
  }
}

function formatMdLatLon(lat, lon) {
  return {
    lat: formatCockpitLat(lat),
    lon: formatCockpitLon(lon),
  };
}

function buildLearnedMarkdownSection(waypoints) {
  if (!waypoints.length) return "";
  const rows = waypoints
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((w) => {
      const { lat, lon } = formatMdLatLon(w.lat, w.lon);
      const note = w.notes || "Learned / manually entered";
      return `| ${w.name} | ${lat} | ${lon} | ${note} |`;
    })
    .join("\n");
  return `${LEARNED_MD_START}
## Learned / manually taught waypoints

Coordinate fixes from NAT track messages or pilot chart entry (approximate; educational only).

| Waypoint | Latitude | Longitude | Notes |
|----------|-------------------|-------------------|---------------------------------------------|
${rows}

${LEARNED_MD_END}
`;
}

function mergeLearnedIntoMarkdown(baseMd, learned) {
  const base = String(baseMd || "").replace(
    new RegExp(
      `${LEARNED_MD_START}[\\s\\S]*?${LEARNED_MD_END}\\n?`,
      "g"
    ),
    ""
  );
  const section = buildLearnedMarkdownSection(learned);
  if (!section) return base.trimEnd() + "\n";
  return `${base.trimEnd()}\n\n${section}`;
}

function refreshMarkdownWithLearned() {
  const learned = loadLearnedWaypoints();
  if (!state.mdText && !state.mdBaseText) return;
  // Keep a clean base once; re-merge learned section each time
  if (!state.mdBaseText) state.mdBaseText = state.mdText;
  state.mdText = mergeLearnedIntoMarkdown(state.mdBaseText, learned);
}

function waypointsMarkdownFilename() {
  return `MyNatTrack-waypoints-${todayUtcDate()}.md`;
}

function currentWaypointsMarkdown() {
  refreshMarkdownWithLearned();
  return state.mdText || "";
}

function openMdShareHelp() {
  if (el.mdShareHelp) el.mdShareHelp.hidden = false;
}

function openMdImportHelp() {
  setMdImportStatus("");
  if (el.mdImportHelp) el.mdImportHelp.hidden = false;
}

function setMdImportStatus(msg, isError = false) {
  if (!el.mdImportStatus) return;
  if (!msg) {
    el.mdImportStatus.hidden = true;
    el.mdImportStatus.textContent = "";
    el.mdImportStatus.classList.remove("is-error");
    return;
  }
  el.mdImportStatus.textContent = msg;
  el.mdImportStatus.classList.toggle("is-error", isError);
  el.mdImportStatus.hidden = false;
}

function downloadWaypointsMarkdown(text, filename) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareWaypointsMarkdown() {
  const text = currentWaypointsMarkdown();
  if (!text.trim()) {
    showError("No waypoints markdown to share yet.");
    return;
  }
  const filename = waypointsMarkdownFilename();
  const file = new File([text], filename, {
    type: "text/markdown",
    lastModified: Date.now(),
  });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "MyNatTrack waypoints",
        text: "NAT HLA waypoints reference (including learned / manual fixes)",
      });
      if (el.mdShareHelp) el.mdShareHelp.hidden = true;
      return;
    }
  } catch (err) {
    // User cancelled share sheet — leave help open; don't fall through to download
    if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
      return;
    }
  }

  downloadWaypointsMarkdown(text, filename);
  if (el.mdShareHelp) el.mdShareHelp.hidden = true;
}

/**
 * Merge imported named fixes into learned localStorage + state.db.
 * Bundled names that already match are left alone (not copied into learned).
 * @returns {{ added: number, updated: number, skipped: number }}
 */
function mergeImportedWaypoints(rows) {
  const learned = loadLearnedWaypoints();
  const byName = new Map(
    learned.map((w) => [String(w?.name || "").toUpperCase(), w])
  );
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const touched = [];

  for (const row of rows) {
    const name = String(row.name || "").toUpperCase();
    if (!name || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) {
      skipped += 1;
      continue;
    }

    const known = state.db.find(
      (w) => String(w.name || "").toUpperCase() === name
    );
    if (
      known &&
      Math.abs(known.lat - row.lat) < 1e-7 &&
      Math.abs(known.lon - row.lon) < 1e-7
    ) {
      skipped += 1;
      continue;
    }

    const entry = {
      id: name,
      name,
      lat: row.lat,
      lon: row.lon,
      accuracy: "approximate",
      category: "manual",
      region: "import",
      notes: row.notes || "Imported from markdown",
      source: "md-import",
    };

    if (known) {
      known.lat = entry.lat;
      known.lon = entry.lon;
      known.accuracy = entry.accuracy;
      known.notes = entry.notes;
      known.category = known.category || "manual";
      updated += 1;
    } else {
      state.db.push({ ...entry });
      added += 1;
    }
    byName.set(name, entry);
    touched.push(entry);
  }

  if (touched.length) {
    saveLearnedWaypoints([...byName.values()]);
    setAccuracyVerifiedDate(todayUtcDate());
    refreshMarkdownWithLearned();
    if (el.mdContent && el.mdPanel && !el.mdPanel.hidden) {
      el.mdContent.innerHTML = simpleMarkdownToHtml(state.mdText);
    }
    persistLearnedWaypointsToServer(touched, state.accuracyVerifiedOn);
  }
  return { added, updated, skipped };
}

async function importWaypointsMarkdownFile(file) {
  try {
    const text = await file.text();
    const rows = parseWaypointsFromMarkdown(text);
    if (!rows.length) {
      setMdImportStatus(
        "No parseable waypoint rows found. Need table columns Waypoint / Latitude / Longitude with exact coords (no ~).",
        true
      );
      return;
    }
    const { added, updated, skipped } = mergeImportedWaypoints(rows);
    const parts = [];
    if (added) parts.push(`${added} added`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} unchanged`);
    setMdImportStatus(
      `Imported ${rows.length} parseable fix(es): ${parts.join(", ") || "done"}.`
    );
  } catch (err) {
    setMdImportStatus(
      err?.message || "Could not read that markdown file.",
      true
    );
  }
}

async function persistLearnedWaypointsToServer(newEntries, verifiedOn) {
  if (!newEntries?.length) return;
  try {
    await fetch("./api/learn-waypoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        waypoints: newEntries,
        accuracyVerifiedOn: verifiedOn,
      }),
    });
  } catch {
    /* GitHub Pages / offline — localStorage + in-app MD still updated */
  }
}

/**
 * Silently add NAT-track fixes (with coordinates) that are missing from the
 * bundled waypoint DB. No UI messages — runs in the background after refresh.
 */
function absorbUnknownTrackWaypoints(tracks) {
  try {
    const learned = loadLearnedWaypoints();
    const known = new Set(state.db.map((w) => String(w.name || "").toUpperCase()));
    for (const w of learned) {
      const n = String(w?.name || "").toUpperCase();
      if (n) known.add(n);
    }
    const newly = [];
    for (const track of tracks || []) {
      for (const p of track.points || []) {
        const name = String(p?.name || "").trim().toUpperCase();
        if (!name || known.has(name)) continue;
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
        const entry = {
          id: name,
          name,
          lat: p.lat,
          lon: p.lon,
          accuracy: "approximate",
          category: "nat-track",
          notes: "Learned from NAT tracks message",
          source: "nat-tracks",
        };
        state.db.push(entry);
        learned.push(entry);
        newly.push(entry);
        known.add(name);
      }
    }
    if (!newly.length) return;
    saveLearnedWaypoints(learned);
    const verifiedOn = todayUtcDate();
    setAccuracyVerifiedDate(verifiedOn);
    refreshMarkdownWithLearned();
    persistLearnedWaypointsToServer(newly, verifiedOn);
  } catch {
    /* never surface to the pilot */
  }
}

function scheduleAbsorbTrackWaypoints(tracks) {
  const run = () => absorbUnknownTrackWaypoints(tracks);
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 0);
  }
}

/** A2903 / 11" iPad class — logical screen 820×1180. */
function syncA2903ViewportClass() {
  try {
    const w = window.screen?.width || 0;
    const h = window.screen?.height || 0;
    const shortSide = Math.min(w, h);
    const longSide = Math.max(w, h);
    const match =
      shortSide >= 800 &&
      shortSide <= 840 &&
      longSide >= 1160 &&
      longSide <= 1200;
    document.body.classList.toggle("viewport-a2903", match);
  } catch {
    /* ignore */
  }
}

function computeLegs() {
  const legs = [];
  let totalNm = 0;
  for (let i = 0; i < state.route.length - 1; i += 1) {
    const a = state.route[i];
    const b = state.route[i + 1];
    const inv = vincentyInverse(a.lat, a.lon, b.lat, b.lon);
    const avgTrue = averageBearing(inv.initialBearing, inv.finalBearing);
    const midLat = (a.lat + b.lat) / 2;
    const midLon = (a.lon + b.lon) / 2;
    const avgMag = trueToMagnetic(avgTrue, midLat, midLon);
    const initMag = trueToMagnetic(inv.initialBearing, a.lat, a.lon);
    totalNm += inv.distanceNm;
    legs.push({
      from: a,
      to: b,
      avgTrue,
      avgMag,
      initTrue: inv.initialBearing,
      initMag,
      distanceNm: inv.distanceNm,
      avgVarLabel: formatVariation(midLat, midLon),
      initVarLabel: formatVariation(a.lat, a.lon),
    });
  }
  return { legs, totalNm };
}

function enrichPoint(p) {
  const dbHit = state.db.find((w) => w.name === p.name || w.id === p.name);
  if (dbHit) {
    p.notes = dbHit.notes;
    p.accuracy = dbHit.accuracy;
    p.category = dbHit.category;
  }
  return p;
}

/** Keep hint beside the Route/Save button if DOM was rearranged. */
function ensureRouteHintPlacement() {
  const hint = el.routeHint || document.getElementById("route-hint");
  const bar = document.querySelector("#route-panel .route-title-bar");
  const btn =
    el.routeStoreBtn || document.getElementById("route-store-btn");
  if (hint) el.routeHint = hint;
  if (btn) {
    el.routeStoreBtn = btn;
    el.routeStoreLabel =
      btn.querySelector("#route-store-label") || el.routeStoreLabel;
  }
  if (hint && bar && hint.parentElement !== bar) {
    bar.appendChild(hint);
  }
  updateRouteStoreButton();
}

function updateEntryChrome() {
  updateRouteStoreButton();
  const editing = state.editingIndex != null;
  const inserting = state.insertAfterIndex != null && !editing;
  if (el.addBtn) {
    el.addBtn.textContent = editing ? "Update" : inserting ? "Insert" : "Add";
  }
  if (el.cancelEditBtn) {
    el.cancelEditBtn.hidden = !editing && !inserting;
  }
  if (el.routeHint) {
    if (editing) {
      el.routeHint.textContent = `Editing waypoint ${state.editingIndex + 1}. Change the value and tap Update, or Cancel.`;
      el.routeHint.hidden = false;
    } else if (inserting) {
      el.routeHint.textContent = `Inserting after waypoint ${state.insertAfterIndex + 1}. Enter one or more waypoints, then Insert.`;
      el.routeHint.hidden = false;
    } else {
      el.routeHint.textContent =
        "Paste a full space-separated route, or add single waypoints. Use Edit / Insert / ↑↓ / × for ATC changes.";
      el.routeHint.hidden = false;
    }
  }
}

function cancelEditMode() {
  state.editingIndex = null;
  state.insertAfterIndex = null;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  updateEntryChrome();
  renderRouteList();
}

function renderRouteList() {
  if (!el.routeList) {
    updateEntryChrome();
    return;
  }
  el.routeList.innerHTML = "";
  updateEntryChrome();
  if (!state.route.length) {
    return;
  }
  state.route.forEach((wp, index) => {
    const li = document.createElement("li");
    li.className = "route-item";
    if (state.editingIndex === index) li.classList.add("editing");
    if (state.insertAfterIndex === index) li.classList.add("insert-after");
    const approx =
      wp.accuracy === "approximate"
        ? `<span class="badge approx" title="${wp.notes || "Approximate"}">approx</span>`
        : "";
    li.innerHTML = `
      <span class="idx">${index + 1}</span>
      <span class="name">${wp.name}${approx}</span>
      <span class="coords">${formatCockpitLatLon(wp.lat, wp.lon)}</span>
      <span class="actions">
        <button type="button" data-edit="${index}" aria-label="Edit waypoint">Edit</button>
        <button type="button" data-insert="${index}" aria-label="Insert after">+↓</button>
        <button type="button" data-up="${index}" ${index === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
        <button type="button" data-down="${index}" ${index === state.route.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
        <button type="button" class="danger" data-del="${index}" aria-label="Delete">×</button>
      </span>
    `;
    el.routeList.appendChild(li);
  });
}

function routeSequenceKey(route) {
  return (route || [])
    .map((w) => `${w.name}@${Number(w.lat).toFixed(4)},${Number(w.lon).toFixed(4)}`)
    .join(">");
}

function resetLegSequencerIfRouteChanged(route) {
  const key = routeSequenceKey(route);
  if (key !== state.routeSeqKey) {
    state.routeSeqKey = key;
    state.activeLegIndex = null;
  }
}

/** Smallest signed turn from course → bearing, degrees in (−180, 180]. */
function bearingDeltaDeg(courseDeg, bearingDeg) {
  return ((bearingDeg - courseDeg + 540) % 360) - 180;
}

/**
 * Along-track (from A toward B) and cross-track for GPS relative to leg A→B.
 * Approximate spherical projection using Vincenty bearings/distances.
 */
function scoreLeg(gps, a, b) {
  const ab = vincentyInverse(a.lat, a.lon, b.lat, b.lon);
  const ag = vincentyInverse(a.lat, a.lon, gps.lat, gps.lon);
  const gb = vincentyInverse(gps.lat, gps.lon, b.lat, b.lon);
  const legNm = ab.distanceNm;
  if (!Number.isFinite(legNm) || legNm < 0.05) return null;
  if (!Number.isFinite(ag.distanceNm) || !Number.isFinite(gb.distanceNm)) {
    return null;
  }
  const turn = bearingDeltaDeg(ab.initialBearing, ag.initialBearing);
  const rad = (turn * Math.PI) / 180;
  return {
    legNm,
    course: ab.initialBearing,
    /** NM along A→B from A (negative = before A) */
    atd: ag.distanceNm * Math.cos(rad),
    xtk: Math.abs(ag.distanceNm * Math.sin(rad)),
    remToB: gb.distanceNm,
  };
}

/**
 * Next waypoint index = TO of the active leg.
 * Uses along-track / cross-track lock + capture sequencing (forward-only hysteresis).
 */
function findNextWaypointIndex(gps, route) {
  resetLegSequencerIfRouteChanged(route);
  if (!gps || !route?.length) return -1;
  if (route.length === 1) return 0;

  const CAPTURE_NM = 8;
  const HOLD_XTK_NM = 90;
  const ACQUIRE_XTK_NM = 120;

  const evaluate = (i) => {
    if (i < 0 || i >= route.length - 1) return null;
    const s = scoreLeg(gps, route[i], route[i + 1]);
    if (!s) return null;
    return { i, ...s };
  };

  const shouldSequence = (s) =>
    s &&
    (s.remToB <= CAPTURE_NM || s.atd >= s.legNm - CAPTURE_NM);

  // Hold current leg; sequence forward when TO is captured
  if (state.activeLegIndex != null) {
    let cur = evaluate(state.activeLegIndex);
    if (cur && cur.xtk <= HOLD_XTK_NM) {
      while (shouldSequence(cur) && state.activeLegIndex < route.length - 2) {
        state.activeLegIndex += 1;
        cur = evaluate(state.activeLegIndex);
      }
      if (cur) return state.activeLegIndex + 1;
    }
    // Lost the route corridor — reacquire below
    state.activeLegIndex = null;
  }

  // Acquire: prefer legs we're geometrically on, lowest XTK, heading alignment if available
  let best = null;
  for (let i = 0; i < route.length - 1; i++) {
    const s = evaluate(i);
    if (!s || s.xtk > ACQUIRE_XTK_NM) continue;
    const onBand = s.atd >= -30 && s.atd <= s.legNm + CAPTURE_NM;
    if (!onBand) continue;
    let headingPenalty = 0;
    if (Number.isFinite(gps.heading)) {
      headingPenalty = Math.abs(bearingDeltaDeg(s.course, gps.heading)) / 180;
    }
    const rank = s.xtk + headingPenalty * 20;
    if (!best || rank < best.rank) best = { ...s, rank };
  }

  if (!best) {
    // Fallback: nearest waypoint, next is the following fix (or itself if last)
    let nearest = 0;
    let bestD = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = vincentyInverse(
        gps.lat,
        gps.lon,
        route[i].lat,
        route[i].lon
      ).distanceNm;
      if (d < bestD) {
        bestD = d;
        nearest = i;
      }
    }
    if (nearest >= route.length - 1) {
      state.activeLegIndex = Math.max(0, route.length - 2);
      return route.length - 1;
    }
    // Nearest fix is not yet the destination — fly toward the next one after it
    const next = nearest + 1;
    state.activeLegIndex = Math.min(next - 1, route.length - 2);
    return Math.min(next, route.length - 1);
  }

  state.activeLegIndex = best.i;
  let cur = best;
  while (shouldSequence(cur) && state.activeLegIndex < route.length - 2) {
    state.activeLegIndex += 1;
    cur = evaluate(state.activeLegIndex);
  }
  return state.activeLegIndex + 1;
}

function msToKnots(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms * (3600 / 1852);
}

function formatEteHours(hours) {
  if (!Number.isFinite(hours) || hours < 0 || hours > 48) return null;
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}+${String(m).padStart(2, "0")}`;
}

function formatEtaZulu(date) {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}${mm}Z`;
}

/** GPS GS → remaining time / ETA Zulu to next waypoint (cheap; no chart work). */
function gpsProgressSuffix() {
  const gps = state.gps;
  const route = state.route;
  if (!gps || !route.length) return "";

  const nextIdx = findNextWaypointIndex(gps, route);
  if (nextIdx < 0 || nextIdx >= route.length) return "";
  const next = route[nextIdx];
  const fromIdx = state.activeLegIndex;
  const from =
    fromIdx != null && fromIdx >= 0 && fromIdx < route.length
      ? route[fromIdx]
      : null;
  const remNm = vincentyInverse(gps.lat, gps.lon, next.lat, next.lon).distanceNm;
  if (!Number.isFinite(remNm)) return "";

  const gsKt = msToKnots(gps.speed);
  const remTxt = `${formatDistanceNm(remNm)} NM`;
  const legLbl = from ? `${from.name}→${next.name}` : next.name;
  // Need a usable ground speed (ignore crawl / null GPS speed)
  if (gsKt == null || gsKt < 30) {
    return ` · Next ${legLbl} ${remTxt} · GS —`;
  }

  const eteH = remNm / gsKt;
  const ete = formatEteHours(eteH);
  if (!ete) {
    return ` · Next ${legLbl} ${remTxt} · GS ${Math.round(gsKt)} kt`;
  }

  const eta = new Date(Date.now() + eteH * 3600 * 1000);
  return (
    ` · Next ${legLbl} ${remTxt}` +
    ` · ETE ${ete}` +
    ` · ETA ${formatEtaZulu(eta)}` +
    ` · GS ${Math.round(gsKt)} kt`
  );
}

function formatNmDelta(deltaNm) {
  const abs = formatDistanceNm(Math.abs(deltaNm));
  if (Math.abs(deltaNm) < 0.05) return { text: `Difference: ${abs} NM`, kind: "same" };
  if (deltaNm < 0) return { text: `Difference: −${abs} NM`, kind: "shorter" };
  return { text: `Difference: +${abs} NM`, kind: "longer" };
}

/** Compact title form: "mod diff 240.0nm" (signed). */
function formatModDiffTitle(deltaNm) {
  const abs = formatDistanceNm(Math.abs(deltaNm));
  if (Math.abs(deltaNm) < 0.05) return `mod diff ${abs}nm`;
  if (deltaNm < 0) return `mod diff −${abs}nm`;
  return `mod diff +${abs}nm`;
}

function clearLegsModDiff() {
  if (!el.legsModDiff) return;
  el.legsModDiff.hidden = true;
  el.legsModDiff.textContent = "";
}

function updateLegsModDiff(deltaNm) {
  if (!el.legsModDiff) return;
  if (deltaNm == null || !Number.isFinite(deltaNm)) {
    clearLegsModDiff();
    return;
  }
  el.legsModDiff.textContent = formatModDiffTitle(deltaNm);
  el.legsModDiff.hidden = false;
}

function updateTotalsCompare(currentNm) {
  const hideAll = () => {
    if (el.totalsCompare) {
      el.totalsCompare.hidden = true;
      el.totalsCompare.textContent = "";
    }
    clearLegsModDiff();
  };
  if (!el.totalsCompare && !el.legsModDiff) return;
  const stored = state.storedRoute;
  if (
    !stored ||
    !Number.isFinite(stored.totalNm) ||
    !Number.isFinite(stored.waypoints)
  ) {
    hideAll();
    return;
  }
  const curKey = routeSequenceKey(state.route);
  // Hide while working route still matches the stored baseline
  if (stored.key && curKey && stored.key === curKey) {
    hideAll();
    return;
  }
  if (!state.route.length) {
    if (el.totalsCompare) {
      el.totalsCompare.innerHTML =
        `Your stored route was ${stored.waypoints} waypoints · ` +
        `${formatDistanceNm(stored.totalNm)} NM total`;
      el.totalsCompare.hidden = false;
    }
    clearLegsModDiff();
    return;
  }
  const nm = currentNm != null ? currentNm : computeLegs().totalNm;
  const delta = nm - stored.totalNm;
  const diff = formatNmDelta(delta);
  const diffClass =
    diff.kind === "shorter"
      ? "diff-shorter"
      : diff.kind === "longer"
        ? "diff-longer"
        : "";
  if (el.totalsCompare) {
    el.totalsCompare.innerHTML =
      `vs stored · ${stored.waypoints} waypoints · ` +
      `${formatDistanceNm(stored.totalNm)} NM total · ` +
      `<span class="${diffClass}">${diff.text}</span>`;
    el.totalsCompare.hidden = false;
  }
  updateLegsModDiff(delta);
}

function updateTotalsLine(legsCount, totalNm) {
  if (!el.totals) return;
  if (!state.route.length) {
    state.routeTotals = { legsCount: 0, totalNm: 0, key: "" };
    el.totals.textContent = "—";
    updateTotalsCompare(0);
    return;
  }
  const key = routeSequenceKey(state.route);
  let nLegs = legsCount;
  let nm = totalNm;
  if (nLegs == null || nm == null) {
    if (state.routeTotals.key === key) {
      nLegs = state.routeTotals.legsCount;
      nm = state.routeTotals.totalNm;
    } else {
      const computed = computeLegs();
      nLegs = computed.legs.length;
      nm = computed.totalNm;
      state.routeTotals = { legsCount: nLegs, totalNm: nm, key };
    }
  } else {
    state.routeTotals = { legsCount: nLegs, totalNm: nm, key };
  }
  el.totals.textContent =
    `${state.route.length} waypoints · ${nLegs} legs · ${formatDistanceNm(nm)} NM total` +
    gpsProgressSuffix();
  updateTotalsCompare(nm);
}

function renderLegs() {
  const { legs, totalNm } = computeLegs();
  if (!el.legsBody) {
    updateTotalsLine(legs.length, totalNm);
    return;
  }
  el.legsBody.innerHTML = "";
  const showMag = state.settings.showMagnetic;

  if (el.thAvgMag) el.thAvgMag.hidden = !showMag;
  if (el.thInitMag) el.thInitMag.hidden = !showMag;

  legs.forEach((leg) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${leg.from.name}</td>
      <td>${leg.to.name}</td>
      <td class="mono">${formatTrack(leg.avgTrue)}°</td>
      <td class="mono" ${showMag ? "" : "hidden"}>${formatTrack(leg.avgMag)}° <span class="muted">(${leg.avgVarLabel})</span></td>
      <td class="mono">${formatTrack(leg.initTrue)}°</td>
      <td class="mono" ${showMag ? "" : "hidden"}>${formatTrack(leg.initMag)}° <span class="muted">(${leg.initVarLabel})</span></td>
      <td class="mono">${formatDistanceNm(leg.distanceNm)}</td>
    `;
    el.legsBody.appendChild(tr);
  });

  updateTotalsLine(legs.length, totalNm);
}

/** Memoized colored/filtered NAT tracks for chart paints. */
let coloredNatCache = { key: "", list: [] };

function coloredNatTracks() {
  const showEast = state.settings.showEastTracks !== false;
  const showWest = state.settings.showWestTracks !== false;
  const validOnly = state.settings.validOnlyTracks !== false;
  const nowMs = Date.now();
  const vKey = validOnly ? natValidityKey(nowMs) : "all";
  const cacheKey = `${showEast}|${showWest}|${validOnly}|${vKey}|${state.nat?.fetchedAt || ""}|${(state.nat?.tracks || []).length}`;
  if (coloredNatCache.key === cacheKey) return coloredNatCache.list;

  const list = (state.nat?.tracks || [])
    .filter((t) => {
      const dir = t.direction || "unknown";
      let dirOk = false;
      if (dir === "east") dirOk = showEast;
      else if (dir === "west") dirOk = showWest;
      else if (dir === "both") dirOk = showEast || showWest;
      else dirOk = showEast || showWest;
      if (!dirOk) return false;
      if (validOnly && !isTrackValidAt(t, nowMs)) return false;
      return true;
    })
    .map((t) => ({
      ...t,
      color: trackColor(t.id, t.direction),
    }));
  coloredNatCache = { key: cacheKey, list };
  return list;
}

function natValidityKey(nowMs = Date.now()) {
  return (state.nat?.tracks || [])
    .filter((t) => isTrackValidAt(t, nowMs))
    .map((t) => t.id)
    .sort()
    .join(",");
}

function paintNatClock(card, model) {
  if (!card || !model) return;
  const title = card.querySelector(".nat-clock-title");
  const windowEl = card.querySelector(".nat-clock-window");
  const count = card.querySelector(".nat-clock-count");
  if (title) title.textContent = model.title;
  if (windowEl) windowEl.textContent = model.windowLabel;
  if (count) count.textContent = model.countdown;
  card.dataset.tone = model.tone;
  card.dataset.phase = model.phase;
}

function updateNatClocks(nowMs = Date.now()) {
  const tracks = state.nat?.tracks || [];
  paintNatClock(el.natClockEast, directionClockModel(tracks, "east", nowMs));
  paintNatClock(el.natClockWest, directionClockModel(tracks, "west", nowMs));
}

function tickNatValidity() {
  const now = new Date();
  const nowMs = now.getTime();
  updateUtcClocks(now);
  if (el.natPanel && !el.natPanel.hidden) {
    updateNatClocks(nowMs);
  }
  if (state.settings.validOnlyTracks !== false && state.nat?.tracks?.length) {
    const key = natValidityKey(nowMs);
    if (key !== state.natValidityKey) {
      state.natValidityKey = key;
      renderChart();
    }
  }
}

function startNatClockTimer() {
  if (natClockTimer) return;
  updateUtcClocks();
  natClockTimer = window.setInterval(tickNatValidity, 1000);
}

function formatNatTmi(nat) {
  const tmi = inferTmi(nat);
  return tmi ? `TMI ${tmi}` : "TMI —";
}

function formatUtcHms(date = new Date()) {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** UTC day-of-year + time: DDD:HH:MM:SS (same day basis as TMI). */
function formatUtcJulianClock(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const ddd = String(day).padStart(3, "0");
  return `${ddd}:${formatUtcHms(date)}`;
}

function updateUtcClocks(now = new Date()) {
  if (el.chartUtcClock) el.chartUtcClock.textContent = formatUtcHms(now);
  if (el.natUtcClock) el.natUtcClock.textContent = formatUtcJulianClock(now);
}

function formatUtcStamp(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "unknown time";
  const yyyy = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss} UTC`;
}

function formatNatStatus(nat, extra = "") {
  if (!nat) return extra || "Not loaded";
  const when = formatUtcStamp(nat.fetchedAt);
  const n = (nat.tracks || []).length;
  const cache = nat.fromCache ? " · cached" : "";
  // Never surface refresh/lookup failures once tracks are shown
  const suffix = `${cache}${extra ? ` · ${extra}` : ""}`;
  return `${n} tracks · Update checked:\n${when}${suffix}`;
}

/** Transient network failures — keep last tracks; no pilot-facing error. */
function isSilentNatFetchFailure(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("abort") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("networkerror") ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("the operation was aborted")
  );
}

function renderNatPanel() {
  if (!el.natMessage) return;
  updateNatClocks();
  if (state.natLoading) {
    if (el.natTmi) el.natTmi.textContent = formatNatTmi(state.nat);
    if (el.natStatus) el.natStatus.textContent = "Loading…";
    return;
  }
  if (!state.nat) {
    if (el.natTmi) el.natTmi.textContent = "TMI —";
    if (el.natStatus) {
      el.natStatus.textContent =
        state.natFetchError && !isSilentNatFetchFailure(state.natFetchError)
          ? "Fetch failed"
          : "Not loaded";
    }
    el.natMessage.textContent =
      state.natFetchError && !isSilentNatFetchFailure(state.natFetchError)
        ? state.natFetchError
        : "No track message loaded yet. Tap Refresh.";
    return;
  }
  if (el.natTmi) el.natTmi.textContent = formatNatTmi(state.nat);
  if (el.natStatus) el.natStatus.textContent = formatNatStatus(state.nat);
  state.natValidityKey = natValidityKey();
  const summary = (state.nat.tracks || [])
    .map((t) => {
      const dir = t.direction !== "unknown" ? ` (${t.direction})` : "";
      const route = (t.points || []).map((p) => p.name).join(" ");
      return `${t.id}${dir}: ${route}`;
    })
    .join("\n");
  // Disclaimer lives in the static NAT panel note — don't duplicate it here
  el.natMessage.textContent =
    (summary ? `Parsed tracks:\n${summary}\n\n────────\n\n` : "") +
    (state.nat.text || "");
}

function paintChart(lite = false) {
  if (!el.chart) return;
  const showAny =
    state.settings.showEastTracks !== false ||
    state.settings.showWestTracks !== false;
  state.lastChartLayout = drawChart(el.chart, {
    route: state.route,
    natTracks: coloredNatTracks(),
    showNatTracks: showAny,
    showRwyLabels: state.settings.showRwyLabels !== false,
    showAirspace: state.settings.showAirspace !== false,
    ownship: state.gps,
    bright: document.documentElement.classList.contains("theme-bright"),
    zoom: state.chartZoom,
    pan: state.chartPan,
    lite,
  });
}

/** Coalesce redraws to one per animation frame; lite skips heavy labels during gestures. */
function scheduleChartRender({ lite = false } = {}) {
  if (lite) chartLitePending = true;
  if (chartRaf) return;
  chartRaf = requestAnimationFrame(() => {
    chartRaf = 0;
    const useLite = chartLitePending;
    chartLitePending = false;
    paintChart(useLite);
  });
}

function renderChart() {
  chartLitePending = false;
  scheduleChartRender({ lite: false });
}

function markChartInteracting() {
  scheduleChartRender({ lite: true });
  clearTimeout(chartIdleTimer);
  chartIdleTimer = window.setTimeout(() => {
    scheduleChartRender({ lite: false });
  }, 140);
}

function applyUiMode(mode, { paint = true } = {}) {
  state.uiMode = mode === "fly" ? "fly" : "edit";
  document.body.classList.toggle("ui-fly", state.uiMode === "fly");
  if (el.modeEditBtn) {
    el.modeEditBtn.setAttribute(
      "aria-pressed",
      state.uiMode === "edit" ? "true" : "false"
    );
  }
  if (el.modeFlyBtn) {
    el.modeFlyBtn.setAttribute(
      "aria-pressed",
      state.uiMode === "fly" ? "true" : "false"
    );
  }
  try {
    localStorage.setItem(UI_MODE_KEY, state.uiMode);
  } catch {
    /* ignore */
  }
  if (!paint) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => renderChart());
  });
}

function loadUiMode() {
  try {
    const m = localStorage.getItem(UI_MODE_KEY);
    if (m === "fly" || m === "edit") return m;
  } catch {
    /* ignore */
  }
  return "edit";
}

function startGpsWatch() {
  if (!navigator.geolocation || state.gpsWatchId != null) return;
  state.gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const c = pos.coords;
      state.gps = {
        lat: c.latitude,
        lon: c.longitude,
        accuracy: c.accuracy,
        heading: Number.isFinite(c.heading) ? c.heading : null,
        speed: Number.isFinite(c.speed) ? c.speed : null,
      };
      // Reuse cached route totals — do not re-run Vincenty on every fix
      const cached = state.routeTotals;
      if (state.route.length && cached.key === routeSequenceKey(state.route)) {
        updateTotalsLine(cached.legsCount, cached.totalNm);
      } else {
        updateTotalsLine();
      }
      const now = performance.now();
      // Throttle chart redraws; lite for ownship, then a quiet full paint for labels
      if (now - state.gpsLastDrawMs < 800 && state.gpsLastDrawMs > 0) return;
      state.gpsLastDrawMs = now;
      markChartInteracting();
    },
    () => {
      /* permission denied / unavailable — clear ownship if it was showing */
      if (state.gps) {
        state.gps = null;
        const cached = state.routeTotals;
        if (state.route.length && cached.key === routeSequenceKey(state.route)) {
          updateTotalsLine(cached.legsCount, cached.totalNm);
        } else {
          updateTotalsLine();
        }
        scheduleChartRender({ lite: false });
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    }
  );
}

function clampChartZoom(z) {
  return Math.max(0.55, Math.min(5, z));
}

function clampPan(pan) {
  return {
    dLat: Math.max(-45, Math.min(45, pan.dLat)),
    dLon: Math.max(-90, Math.min(90, pan.dLon)),
  };
}

function applyChartPanPixels(dx, dy) {
  if (!el.chart) return;
  const layout = state.lastChartLayout;
  const R =
    layout?.radius ||
    Math.min(el.chart.clientWidth || 400, el.chart.clientHeight || 300) * 0.9;
  const lat0 = toRadSafe(layout?.lat0 ?? 50);
  const cosLat = Math.max(0.25, Math.cos(lat0));
  // Drag content with the pointer (map-follows-finger)
  const dLat = (dy / R) * (180 / Math.PI);
  const dLon = (-dx / R / cosLat) * (180 / Math.PI);
  state.chartPan = clampPan({
    dLat: state.chartPan.dLat + dLat,
    dLon: state.chartPan.dLon + dLon,
  });
  markChartInteracting();
}

function toRadSafe(deg) {
  return (deg * Math.PI) / 180;
}

function resetChartView() {
  state.chartZoom = 1.35;
  state.chartPan = { dLat: 0, dLon: 0 };
}

function bindChartGestures() {
  const canvas = el.chart;
  if (!canvas || canvas.dataset.gesturesBound === "1") return;
  canvas.dataset.gesturesBound = "1";

  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let panning = false;
  let lastX = 0;
  let lastY = 0;

  const touchDist = (touches) => {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        panning = false;
        pinchStartDist = touchDist(e.touches);
        pinchStartZoom = state.chartZoom;
      } else if (e.touches.length === 1) {
        panning = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2 && pinchStartDist >= 8) {
        e.preventDefault();
        panning = false;
        const dist = touchDist(e.touches);
        state.chartZoom = clampChartZoom(pinchStartZoom * (dist / pinchStartDist));
        markChartInteracting();
        return;
      }
      if (e.touches.length === 1 && panning) {
        e.preventDefault();
        const t = e.touches[0];
        applyChartPanPixels(t.clientX - lastX, t.clientY - lastY);
        lastX = t.clientX;
        lastY = t.clientY;
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (e.touches.length < 2) pinchStartDist = 0;
      if (e.touches.length === 0) {
        panning = false;
        markChartInteracting();
      }
      if (e.touches.length === 1) {
        panning = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      state.chartZoom = clampChartZoom(state.chartZoom * factor);
      markChartInteracting();
    },
    { passive: false }
  );

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    panning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    applyChartPanPixels(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  });

  const endMousePan = () => {
    if (!panning) return;
    panning = false;
    canvas.style.cursor = "grab";
    markChartInteracting();
  };
  window.addEventListener("mouseup", endMousePan);
}

async function refreshNatTracks({ openPanel = false } = {}) {
  if (state.natLoading) return;
  state.natLoading = true;
  renderNatPanel();
  if (el.natRefreshBtn) el.natRefreshBtn.disabled = true;
  try {
    const result = await fetchNatTracks(state.db);
    if (!result.ok) {
      // Keep last good tracks; only show an error if nothing is loaded yet
      // and the failure is not a silent timeout/abort/network blip
      if (state.nat) {
        state.natFetchError = "";
      } else if (isSilentNatFetchFailure(result.error)) {
        state.natFetchError = "";
      } else {
        state.natFetchError = result.error || "Fetch failed";
      }
    } else {
      // Cache fallback after online miss: keep tracks, never flash a warning
      if (result.warning) delete result.warning;
      state.natFetchError = "";
      state.nat = result;
      scheduleAbsorbTrackWaypoints(result.tracks || []);
    }
    renderChart();
  } catch {
    // Interrupted / timed out refresh — keep current tracks, no error UI
    if (state.nat) state.natFetchError = "";
  } finally {
    state.natLoading = false;
    if (el.natRefreshBtn) el.natRefreshBtn.disabled = false;
    renderNatPanel();
    if (openPanel && el.natPanel) el.natPanel.hidden = false;
  }
}

function renderAll() {
  renderRouteList();
  renderLegs();
  renderChart();
  saveRoute();
}

function showTeachError(msg) {
  if (!el.teachError) return;
  if (!msg) {
    el.teachError.hidden = true;
    el.teachError.textContent = "";
    return;
  }
  el.teachError.textContent = msg;
  el.teachError.hidden = false;
}

function commitTaughtPoints(points) {
  const enriched = points.map((p) => enrichPoint({ ...p }));
  const commit = state.teach?.commit;
  if (!enriched.length) {
    state.teach = null;
    updateEntryChrome();
    return;
  }

  if (commit?.kind === "edit") {
    if (enriched.length !== 1) {
      showError("When editing, enter a single waypoint (or Cancel, then paste a full route).");
      state.teach = null;
      return;
    }
    state.route[commit.editIndex] = enriched[0];
    state.editingIndex = null;
  } else if (commit?.kind === "insert") {
    state.route.splice(commit.insertAt, 0, ...enriched);
    state.insertAfterIndex = null;
  } else if (commit?.kind === "replace") {
    state.route = enriched;
  } else {
    state.route.push(...enriched);
  }

  state.teach = null;
  state.editingIndex = null;
  state.insertAfterIndex = null;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  updateEntryChrome();
  renderAll();
}

function rememberManualWaypoint(name, lat, lon) {
  const entry = {
    id: name,
    name,
    lat,
    lon,
    accuracy: "approximate",
    category: "manual",
    region: "user",
    notes: "Manually entered from chart",
    source: "manual-teach",
  };
  const known = state.db.find(
    (w) => String(w.name || "").toUpperCase() === name
  );
  if (known) {
    known.lat = lat;
    known.lon = lon;
    known.accuracy = "approximate";
    known.notes = entry.notes;
    known.category = known.category || "manual";
  } else {
    state.db.push(entry);
  }
  const learned = loadLearnedWaypoints().filter(
    (w) => String(w?.name || "").toUpperCase() !== name
  );
  learned.push(entry);
  saveLearnedWaypoints(learned);
  setAccuracyVerifiedDate(todayUtcDate());
  refreshMarkdownWithLearned();
  persistLearnedWaypointsToServer([entry], state.accuracyVerifiedOn);
  return enrichPoint({ ...entry });
}

function paintTeachStep() {
  const teach = state.teach;
  if (!teach || !el.teachPanel) return;
  const total = teach.unknowns.length;
  const cur = teach.unknowns[teach.cursor];
  if (!cur) {
    finishTeachQueue();
    return;
  }
  const n = teach.cursor + 1;
  if (el.teachTitle) {
    el.teachTitle.textContent =
      total > 1 ? `Teach waypoint ${n} of ${total}` : "Teach waypoint";
  }
  if (el.teachProgress) {
    el.teachProgress.textContent =
      total > 1
        ? `${n} of ${total} unrecognized — enter chart coordinates, then Save`
        : "Unrecognized name — enter chart coordinates, then Save";
  }
  if (el.teachName) el.teachName.textContent = cur.token;
  if (el.teachCoords) el.teachCoords.value = "";
  if (el.teachSaveBtn) {
    el.teachSaveBtn.textContent = n >= total ? "Save & finish" : "Save";
  }
  showTeachError("");
  el.teachPanel.hidden = false;
  el.teachCoords?.focus();
}

function openTeachQueue(slots, unknowns, commit) {
  state.teach = {
    unknowns: unknowns.map((u) => ({ token: u.token, index: u.index })),
    cursor: 0,
    slots: slots.map((s) =>
      s.type === "point"
        ? { type: "point", index: s.index, point: s.point }
        : { type: "unknown", index: s.index, token: s.token, point: null, skipped: false }
    ),
    commit,
  };
  showError("");
  paintTeachStep();
}

function closeTeachPanel() {
  if (el.teachPanel) el.teachPanel.hidden = true;
  showTeachError("");
}

function cancelTeachQueue() {
  state.teach = null;
  closeTeachPanel();
  updateEntryChrome();
}

function finishTeachQueue() {
  const teach = state.teach;
  if (!teach) return;
  const points = [];
  for (const slot of teach.slots) {
    if (slot.type === "point" && slot.point) points.push(slot.point);
    else if (slot.type === "unknown" && slot.point && !slot.skipped) {
      points.push(slot.point);
    }
  }
  closeTeachPanel();
  commitTaughtPoints(points);
}

function advanceTeachQueue() {
  const teach = state.teach;
  if (!teach) return;
  teach.cursor += 1;
  if (teach.cursor >= teach.unknowns.length) {
    finishTeachQueue();
    return;
  }
  paintTeachStep();
}

function saveTeachCurrent() {
  const teach = state.teach;
  if (!teach) return;
  const cur = teach.unknowns[teach.cursor];
  if (!cur) return;
  const raw = el.teachCoords?.value || "";
  if (!String(raw).trim()) {
    showTeachError("Enter coordinates from the chart.");
    return;
  }
  const parsed = parseWaypointInput(raw, state.db);
  if (!parsed.ok || !parsed.point) {
    showTeachError(
      parsed.error ||
        "Could not read coordinates. Try N50 00.0 W020 00.0 or N5000.0W02000.0"
    );
    return;
  }
  const name = String(cur.token || "").trim().toUpperCase();
  const point = rememberManualWaypoint(name, parsed.point.lat, parsed.point.lon);
  const slot = teach.slots.find((s) => s.index === cur.index);
  if (slot) {
    slot.point = point;
    slot.skipped = false;
  }
  advanceTeachQueue();
}

function skipTeachCurrent() {
  const teach = state.teach;
  if (!teach) return;
  const cur = teach.unknowns[teach.cursor];
  if (!cur) return;
  const slot = teach.slots.find((s) => s.index === cur.index);
  if (slot) {
    slot.point = null;
    slot.skipped = true;
  }
  advanceTeachQueue();
}

function addWaypointFromInput() {
  if (!el.input) return;
  if (state.teach) return; // wizard open
  const raw = el.input.value;
  // Empty Add / Enter is a no-op — the route panel already shows the empty state
  if (!String(raw || "").trim()) {
    showError("");
    return;
  }
  const result = parseRouteString(raw, state.db);

  // Unknown named fixes → teach wizard (keep known tokens in order)
  if (!result.ok && result.unknowns?.length) {
    if (state.editingIndex != null && result.tokens.length !== 1) {
      showError("When editing, enter a single waypoint (or Cancel, then paste a full route).");
      return;
    }
    let commit;
    if (state.editingIndex != null) {
      commit = { kind: "edit", editIndex: state.editingIndex };
    } else if (state.insertAfterIndex != null) {
      commit = { kind: "insert", insertAt: state.insertAfterIndex + 1 };
    } else if (!state.route.length && (result.tokens?.length || 0) > 1) {
      commit = { kind: "replace" };
    } else {
      commit = { kind: "append" };
    }
    openTeachQueue(result.slots || [], result.unknowns, commit);
    return;
  }

  if (!result.ok) {
    showError(result.error);
    return;
  }
  showError("");
  const points = result.points.map((p) => enrichPoint({ ...p }));

  if (state.editingIndex != null) {
    if (points.length !== 1) {
      showError("When editing, enter a single waypoint (or Cancel, then paste a full route).");
      return;
    }
    state.route[state.editingIndex] = points[0];
    state.editingIndex = null;
  } else if (state.insertAfterIndex != null) {
    const at = state.insertAfterIndex + 1;
    state.route.splice(at, 0, ...points);
    state.insertAfterIndex = null;
  } else if (!state.route.length && points.length > 1) {
    // Initial multi-waypoint paste into empty route → load whole string
    state.route = points;
  } else {
    state.route.push(...points);
  }

  el.input.value = "";
  hideSuggestions();
  renderAll();
}

function hideSuggestions() {
  if (!el.suggest) return;
  el.suggest.hidden = true;
  el.suggest.innerHTML = "";
}

function renderSuggestions() {
  if (!el.input || !el.suggest) return;
  const q = el.input.value;
  const items = suggestWaypoints(q, state.db, 8);
  if (!q.trim() || !items.length) {
    hideSuggestions();
    return;
  }
  el.suggest.innerHTML = items
    .map(
      (w) =>
        `<button type="button" class="suggest-item" data-name="${w.name}">
          <strong>${w.name}</strong>
          <span class="suggest-coords mono">${formatCockpitLatLon(w.lat, w.lon)}</span>
          <span class="${w.accuracy === "approximate" ? "approx" : ""}">${w.accuracy}${w.category ? " · " + w.category : ""}</span>
        </button>`
    )
    .join("");
  el.suggest.hidden = false;
}

function simpleMarkdownToHtml(md) {
  // Minimal offline markdown renderer (headings, tables, bold, hr, lists, paragraphs)
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inTable = false;
  let inList = false;

  const flushList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("|") && line.includes("|")) {
      flushList();
      if (/^\|\s*-+/.test(line)) continue;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (!inTable) {
        html += "<table><thead><tr>";
        cells.forEach((c) => {
          html += `<th>${escapeHtml(c)}</th>`;
        });
        html += "</tr></thead><tbody>";
        inTable = true;
      } else {
        html += "<tr>";
        cells.forEach((c) => {
          html += `<td>${inlineMd(c)}</td>`;
        });
        html += "</tr>";
      }
      continue;
    }
    if (inTable) {
      html += "</tbody></table>";
      inTable = false;
    }
    if (/^---+$/.test(line.trim())) {
      flushList();
      html += "<hr/>";
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      html += `<h3>${inlineMd(line.slice(4))}</h3>`;
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      html += `<h2>${inlineMd(line.slice(3))}</h2>`;
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      html += `<h1>${inlineMd(line.slice(2))}</h1>`;
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMd(line.slice(2))}</li>`;
      continue;
    }
    flushList();
    if (!line.trim()) {
      html += "";
      continue;
    }
    html += `<p>${inlineMd(line)}</p>`;
  }
  if (inTable) html += "</tbody></table>";
  flushList();
  return html;
}

function inlineMd(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function init() {
  await ensureUnlocked();

  ensureRouteHintPlacement();
  loadSettings();
  loadRoute();
  loadStoredRoute();
  updateRouteStoreButton();

  const cachedNat = loadCachedNatTracks();
  if (cachedNat) {
    state.nat = { ...cachedNat, fromCache: true };
  }

  const [wpRes, mdRes] = await Promise.all([
    fetch("data/waypoints.json"),
    fetch("docs/NAT_HLA_Waypoints_Reference.md"),
  ]);
  const wpData = await wpRes.json();
  state.db = wpData.waypoints || [];
  mergeLearnedWaypointsIntoDb();
  state.mdBaseText = await mdRes.text();
  state.mdText = state.mdBaseText;
  refreshMarkdownWithLearned();
  if (state.nat?.tracks?.length) {
    scheduleAbsorbTrackWaypoints(state.nat.tracks);
  }

  const bundledDate = wpData.accuracyVerifiedOn || "2026-07-26";
  const learnedDate = loadStoredAccuracyDate();
  const date =
    learnedDate && learnedDate >= bundledDate ? learnedDate : bundledDate;
  setAccuracyVerifiedDate(date);
  if (el.magvarTableDate) {
    el.magvarTableDate.textContent = `(magvar tables ${MAGVAR_TABLE_DATE}; ${MAGVAR_DRIFT_REMARK})`;
  }
  if (el.diversionIcaoList) {
    el.diversionIcaoList.innerHTML = diversionAirportsAlpha()
      .map((ap) => {
        const rwys = runwayLabels(ap);
        const rwyTxt = rwys.length ? rwys.join(" · ") : "—";
        return `<li><code>${escapeHtml(ap.icao)}</code> <span class="muted">${escapeHtml(ap.name)}</span> <span class="div-rwy">${escapeHtml(rwyTxt)}</span></li>`;
      })
      .join("");
  }

  syncA2903ViewportClass();
  window.addEventListener("resize", syncA2903ViewportClass);
  window.addEventListener("orientationchange", () => {
    setTimeout(syncA2903ViewportClass, 250);
  });

  applyTheme(loadThemePref(), { paint: false });
  await loadLandData();
  bindChartGestures();
  applyUiMode(loadUiMode(), { paint: false });
  renderAll();
  renderNatPanel();
  startNatClockTimer();
  startGpsWatch();

  if (el.modeEditBtn) {
    el.modeEditBtn.addEventListener("click", () => applyUiMode("edit"));
  }
  if (el.modeFlyBtn) {
    el.modeFlyBtn.addEventListener("click", () => applyUiMode("fly"));
  }

  if (el.themeBtn) {
    el.themeBtn.addEventListener("click", toggleTheme);
  }
  if (el.chartFullscreenBtn) {
    el.chartFullscreenBtn.addEventListener("click", toggleChartFullscreen);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.teach) {
        e.preventDefault();
        cancelTeachQueue();
        return;
      }
      if (document.body.classList.contains("chart-fullscreen")) {
        setChartFullscreen(false);
      }
    }
  });

  el.addBtn?.addEventListener("click", addWaypointFromInput);
  el.input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWaypointFromInput();
    }
  });
  el.teachSaveBtn?.addEventListener("click", saveTeachCurrent);
  el.teachSkipBtn?.addEventListener("click", skipTeachCurrent);
  el.teachCancelBtn?.addEventListener("click", cancelTeachQueue);
  el.teachCoords?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTeachCurrent();
    }
  });
  el.input?.addEventListener("input", renderSuggestions);
  el.suggest?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-name]");
    if (!btn || !el.input) return;
    el.input.value = btn.dataset.name;
    hideSuggestions();
    addWaypointFromInput();
  });
  el.input?.addEventListener("blur", () => {
    // Allow suggestion button click to fire first
    setTimeout(() => {
      if (!el.suggest?.contains(document.activeElement)) hideSuggestions();
    }, 150);
  });

  el.clearBtn?.addEventListener("click", () => {
    if (state.editingIndex != null || state.insertAfterIndex != null) {
      cancelEditMode();
      return;
    }
    if (!state.route.length && !state.storedRoute) return;
    if (el.routeClearConfirm) el.routeClearConfirm.hidden = false;
  });
  el.routeClearConfirmCancel?.addEventListener("click", () => {
    if (el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  });
  el.routeClearConfirm?.addEventListener("click", (e) => {
    if (e.target === el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  });
  el.routeClearEditsBtn?.addEventListener("click", clearEditsAction);
  el.routeClearAllBtn?.addEventListener("click", clearAllAction);

  el.routeStoreBtn?.addEventListener("click", onRouteStoreBtnClick);
  el.routeStoreConfirmCancel?.addEventListener("click", () => {
    if (el.routeStoreConfirm) el.routeStoreConfirm.hidden = true;
  });
  el.routeStoreConfirm?.addEventListener("click", (e) => {
    if (e.target === el.routeStoreConfirm) el.routeStoreConfirm.hidden = true;
  });
  el.routeStoreConfirmOk?.addEventListener("click", () => {
    if (el.routeStoreConfirm) el.routeStoreConfirm.hidden = true;
    storeCurrentRouteAsBaseline();
    updateTotalsCompare();
  });

  if (el.cancelEditBtn) {
    el.cancelEditBtn.addEventListener("click", cancelEditMode);
  }

  el.routeList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.edit != null) {
      const i = Number(btn.dataset.edit);
      state.editingIndex = i;
      state.insertAfterIndex = null;
      el.input.value = state.route[i].name;
      hideSuggestions();
      showError("");
      updateEntryChrome();
      renderRouteList();
      el.input.focus();
      el.input.select();
    } else if (btn.dataset.insert != null) {
      const i = Number(btn.dataset.insert);
      state.insertAfterIndex = i;
      state.editingIndex = null;
      el.input.value = "";
      hideSuggestions();
      showError("");
      updateEntryChrome();
      renderRouteList();
      el.input.focus();
    } else if (btn.dataset.del != null) {
      const i = Number(btn.dataset.del);
      state.route.splice(i, 1);
      if (state.editingIndex === i) {
        state.editingIndex = null;
        el.input.value = "";
      } else if (state.editingIndex != null && state.editingIndex > i) {
        state.editingIndex -= 1;
      }
      if (state.insertAfterIndex === i) {
        state.insertAfterIndex = null;
      } else if (state.insertAfterIndex != null && state.insertAfterIndex > i) {
        state.insertAfterIndex -= 1;
      }
      renderAll();
    } else if (btn.dataset.up != null) {
      const i = Number(btn.dataset.up);
      if (i > 0) {
        [state.route[i - 1], state.route[i]] = [state.route[i], state.route[i - 1]];
        if (state.editingIndex === i) state.editingIndex = i - 1;
        else if (state.editingIndex === i - 1) state.editingIndex = i;
        if (state.insertAfterIndex === i) state.insertAfterIndex = i - 1;
        else if (state.insertAfterIndex === i - 1) state.insertAfterIndex = i;
        renderAll();
      }
    } else if (btn.dataset.down != null) {
      const i = Number(btn.dataset.down);
      if (i < state.route.length - 1) {
        [state.route[i + 1], state.route[i]] = [state.route[i], state.route[i + 1]];
        if (state.editingIndex === i) state.editingIndex = i + 1;
        else if (state.editingIndex === i + 1) state.editingIndex = i;
        if (state.insertAfterIndex === i) state.insertAfterIndex = i + 1;
        else if (state.insertAfterIndex === i + 1) state.insertAfterIndex = i;
        renderAll();
      }
    }
  });

  el.magToggle?.addEventListener("change", () => {
    state.settings.showMagnetic = el.magToggle.checked;
    saveSettings();
    renderLegs();
  });
  el.airspaceToggle?.addEventListener("change", () => {
    state.settings.showAirspace = el.airspaceToggle.checked;
    saveSettings();
    renderChart();
  });
  el.rwyLabelsToggle?.addEventListener("change", () => {
    state.settings.showRwyLabels = el.rwyLabelsToggle.checked;
    saveSettings();
    renderChart();
  });

  el.settingsBtn?.addEventListener("click", () => {
    if (el.settingsPanel) el.settingsPanel.hidden = false;
  });
  el.settingsClose?.addEventListener("click", () => {
    if (el.settingsPanel) el.settingsPanel.hidden = true;
  });
  el.settingsPanel?.addEventListener("click", (e) => {
    if (e.target === el.settingsPanel) el.settingsPanel.hidden = true;
  });

  if (el.verifyFlowBtn && el.verifyFlowPanel) {
    el.verifyFlowBtn.addEventListener("click", () => {
      el.verifyFlowPanel.hidden = false;
    });
    el.verifyFlowClose?.addEventListener("click", () => {
      el.verifyFlowPanel.hidden = true;
    });
    el.verifyFlowPanel.addEventListener("click", (e) => {
      if (e.target === el.verifyFlowPanel) el.verifyFlowPanel.hidden = true;
    });
  }

  el.openMdBtn?.addEventListener("click", () => {
    if (!el.mdContent || !el.mdPanel) return;
    refreshMarkdownWithLearned();
    el.mdContent.innerHTML = simpleMarkdownToHtml(state.mdText);
    el.mdPanel.hidden = false;
  });
  el.mdClose?.addEventListener("click", () => {
    if (el.mdPanel) el.mdPanel.hidden = true;
  });
  el.mdPanel?.addEventListener("click", (e) => {
    if (e.target === el.mdPanel) el.mdPanel.hidden = true;
  });
  el.mdShareBtn?.addEventListener("click", openMdShareHelp);
  el.mdImportBtn?.addEventListener("click", openMdImportHelp);
  el.mdShareHelpCancel?.addEventListener("click", () => {
    if (el.mdShareHelp) el.mdShareHelp.hidden = true;
  });
  el.mdShareHelp?.addEventListener("click", (e) => {
    if (e.target === el.mdShareHelp) el.mdShareHelp.hidden = true;
  });
  el.mdShareHelpContinue?.addEventListener("click", () => {
    shareWaypointsMarkdown();
  });
  el.mdImportHelpCancel?.addEventListener("click", () => {
    if (el.mdImportHelp) el.mdImportHelp.hidden = true;
  });
  el.mdImportHelp?.addEventListener("click", (e) => {
    if (e.target === el.mdImportHelp) el.mdImportHelp.hidden = true;
  });
  el.mdImportHelpContinue?.addEventListener("click", () => {
    setMdImportStatus("");
    el.mdImportFile?.click();
  });
  el.mdImportFile?.addEventListener("change", () => {
    const file = el.mdImportFile?.files?.[0];
    if (el.mdImportFile) el.mdImportFile.value = "";
    if (file) importWaypointsMarkdownFile(file);
  });

  if (el.natTracksBtn && el.natPanel) {
    el.natTracksBtn.addEventListener("click", () => {
      el.natPanel.hidden = false;
      renderNatPanel();
    });
  }
  el.natClose?.addEventListener("click", () => {
    if (el.natPanel) el.natPanel.hidden = true;
  });
  el.natPanel?.addEventListener("click", (e) => {
    if (e.target === el.natPanel) el.natPanel.hidden = true;
  });
  el.natRefreshBtn?.addEventListener("click", () => refreshNatTracks());

  const syncTrackToggles = () => {
    state.settings.showEastTracks = !!el.showEastTracks?.checked;
    state.settings.showWestTracks = !!el.showWestTracks?.checked;
    state.settings.validOnlyTracks = !!el.validOnlyTracks?.checked;
    saveSettings();
    state.natValidityKey = natValidityKey();
    renderChart();
  };
  el.showEastTracks?.addEventListener("change", syncTrackToggles);
  el.showWestTracks?.addEventListener("change", syncTrackToggles);
  el.validOnlyTracks?.addEventListener("change", syncTrackToggles);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    scheduleChartRender({ lite: true });
    resizeTimer = window.setTimeout(() => renderChart(), 120);
  });

  if ("serviceWorker" in navigator) {
    try {
      // When a new SW takes control, reload once so HTML/CSS/JS stay in sync
      let swRefreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (swRefreshing) return;
        swRefreshing = true;
        window.location.reload();
      });
      const reg = await navigator.serviceWorker.register("./sw.js");
      reg.update?.().catch(() => {});
    } catch (err) {
      console.warn("SW register failed", err);
    }
  }

  // Auto-refresh NAT tracks when the device is online (uses Mac proxy if available)
  if (navigator.onLine) {
    refreshNatTracks().catch(() => {});
  }
}

init().catch((err) => {
  showError(`Failed to load MyNatTrack: ${err.message}`);
  console.error(err);
});
