import {
  vincentyInverse,
  averageBearing,
  formatTrack,
  formatDistanceNm,
  greatCircleSamples,
  estimate747BlockTime,
  formatEteHhMm,
} from "./geodesy.js";
import {
  formatCockpitLat,
  formatCockpitLatLon,
  formatCockpitLon,
  formatFmsLatLon,
  parseRouteString,
  parseWaypointInput,
  parseWaypointsFromMarkdown,
  suggestWaypoints,
} from "./parser.js";
import { airwaysMapFromPayload, isAirwayToken } from "./airways.js";
import { AIM_OEP_TABLE_11, isAimOepName } from "./aimOeps.js";
import {
  trueToMagnetic,
  formatVariation,
  MAGVAR_TABLE_DATE,
  MAGVAR_DRIFT_REMARK,
} from "./magvar.js";
import { drawChart, loadLandData, paintOwnshipOverlay, hitTestChartAirport, hitTestWeather } from "./chart.js";
import { lookupAirport747, airports747List } from "./airports747.js";
import { airportDisplayCode } from "./airportIata.js";
import {
  loadStormSystemsAndSigmets,
  refreshStormSystemsInBackground,
  formatWeatherAge,
  filterActivePolygons,
  dedupePolygons,
  extractVolcanoes,
  isRegionalWeatherView,
  loadLiveRadarDetail,
  clearLiveRadarMemory,
  getLiveRadarMemory,
} from "./weather.js";
import {
  DIVERSION_AIRPORTS,
  diversionAirportsPlottable,
  diversionAirportsAlpha,
  runwayLabels,
  RWY_LABEL_MIN_M,
} from "./diversionAirports.js";
import {
  fetchNatTracks,
  loadCachedNatTracks,
  trackColor,
  isTrackValidAt,
  directionClockModel,
  inferTmi,
} from "./natTracks.js";
import { ensureUnlocked } from "./auth.js";

const STORAGE_KEY = "mynattrack_route_v1";
/** Explicit stored baseline for NM difference (Save route / Route stored). */
const STORED_ROUTE_KEY = "mynattrack_stored_route_v1";
/** Last non-empty working route cleared in this browser (Restore last route). */
const LAST_ROUTE_KEY = "mynattrack_last_route_v1";
const SETTINGS_KEY = "mynattrack_settings_v1";
/** Keep in sync with package.json / sw.js CACHE bump. */
const APP_VERSION = "2.6.3";
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
    /** Fullscreen: NHC + major SIGMETs (12h cache) */
    showStormSystems: false,
    /** Fullscreen: live convective/TS — online memory only */
    showLiveThunderstorms: false,
    /** Fullscreen + multi-leg route: compare filed vs first→last GC */
    showVsGreatCircle: false,
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
  /** Last frozen stationary cockpit coords (null while moving / unknown) */
  gpsStationary: null,
  /** True when last GPS fix time vs system clock exceeded GPS_TIME_WARN_SEC */
  gpsTimeWarn: false,
  /** Last |fix − system| seconds at fix (for tooltip); null when no fix */
  gpsTimeSkewSec: null,
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
  /** Last cleared working route (session + localStorage). */
  lastRoute: null,
  /** Cached from last renderLegs — avoids Vincenty on every GPS fix. */
  routeTotals: { legsCount: 0, totalNm: 0, totalEteMin: 0, key: "" },
  /** 747-8 GC planner (full-screen, empty route only) */
  gcDepIcao: "",
  gcArrIcao: "",
  /** Memoized GC great-circle plan (keyed by dep|arr ICAO). */
  gcPlanCache: null,
  /** Memoized first→last GC compare for a loaded route. */
  vsGcCache: null,
  /** Last GC framing key — reset pan/zoom when dep/arr plan changes. */
  gcViewKey: "",
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
  /** True when last route paste skipped unknown tokens (airways / missing names). */
  skippedUnknowns: false,
  /** Bundled WATRS / NY OAC airway definitions (M201–M204, …). */
  airways: Object.create(null),
  /** Cached storm systems + SIGMETs payload (also mirrored in localStorage). */
  stormSystems: null,
  weatherStatus: "",
};

const el = {
  input: document.getElementById("wp-input"),
  suggest: document.getElementById("suggest"),
  addBtn: document.getElementById("add-btn"),
  clearBtn: document.getElementById("clear-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  teachBtn: document.getElementById("teach-btn"),
  routeHint: document.getElementById("route-hint"),
  routeUnknownRemark: document.getElementById("route-unknown-remark"),
  routeStoreBtn: document.getElementById("route-store-btn"),
  routeStoreLabel: document.getElementById("route-store-label"),
  routeStoreConfirm: document.getElementById("route-store-confirm"),
  routeStoreConfirmCancel: document.getElementById("route-store-confirm-cancel"),
  routeStoreConfirmOk: document.getElementById("route-store-confirm-ok"),
  routeClearConfirm: document.getElementById("route-clear-confirm"),
  routeClearConfirmCancel: document.getElementById("route-clear-confirm-cancel"),
  routeClearEditsBtn: document.getElementById("route-clear-edits-btn"),
  routeClearAllBtn: document.getElementById("route-clear-all-btn"),
  routeRestoreLastBtn: document.getElementById("route-restore-last-btn"),
  routeRestoreHelp: document.getElementById("route-restore-help"),
  routeList: document.getElementById("route-list"),
  legsBody: document.getElementById("legs-body"),
  totals: document.getElementById("totals"),
  totalsCompare: document.getElementById("totals-compare"),
  legsModDiff: document.getElementById("legs-mod-diff"),
  chart: document.getElementById("chart"),
  chartOwnship: document.getElementById("chart-ownship"),
  error: document.getElementById("error"),
  teachPanel: document.getElementById("teach-panel"),
  teachTitle: document.getElementById("teach-title"),
  teachProgress: document.getElementById("teach-progress"),
  teachName: document.getElementById("teach-name"),
  teachCoords: document.getElementById("teach-coords"),
  teachError: document.getElementById("teach-error"),
  teachSaveBtn: document.getElementById("teach-save-btn"),
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
  icloudExportBtn: document.getElementById("icloud-export-btn"),
  icloudImportBtn: document.getElementById("icloud-import-btn"),
  icloudImportFile: document.getElementById("icloud-import-file"),
  icloudSyncStatus: document.getElementById("icloud-sync-status"),
  settingsVerify: document.getElementById("settings-verify"),
  natTracksBtn: document.getElementById("nat-tracks-btn"),
  natPanel: document.getElementById("nat-panel"),
  natClose: document.getElementById("nat-close"),
  natRefreshBtn: document.getElementById("nat-refresh-btn"),
  showEastTracks: document.getElementById("show-east-tracks"),
  showWestTracks: document.getElementById("show-west-tracks"),
  validOnlyTracks: document.getElementById("valid-only-tracks"),
  stormSystemsToggle: document.getElementById("storm-systems-toggle"),
  liveTsToggle: document.getElementById("live-ts-toggle"),
  liveTsLoading: document.getElementById("live-ts-loading"),
  weatherStatusEl: document.getElementById("weather-status"),
  wxDetail: document.getElementById("wx-detail"),
  wxDetailTitle: document.getElementById("wx-detail-title"),
  wxDetailBody: document.getElementById("wx-detail-body"),
  wxDetailClose: document.getElementById("wx-detail-close"),
  natTmi: document.getElementById("nat-tmi"),
  natStatus: document.getElementById("nat-status"),
  natMessage: document.getElementById("nat-message"),
  natClockEast: document.getElementById("nat-clock-east"),
  natClockWest: document.getElementById("nat-clock-west"),
  chartUtcClock: document.getElementById("chart-utc-clock"),
  chartUtcLabel: document.getElementById("chart-utc-label"),
  chartUtcChip: document.getElementById("chart-utc-chip"),
  chartGpsCoords: document.getElementById("chart-gps-coords"),
  chartGpsLat: document.getElementById("chart-gps-lat"),
  chartGpsLon: document.getElementById("chart-gps-lon"),
  gpsIntegrity: document.getElementById("gps-integrity"),
  gpsRefChip: document.getElementById("gps-ref-chip"),
  gpsRefIcao: document.getElementById("gps-ref-icao"),
  gpsRefLat: document.getElementById("gps-ref-lat"),
  gpsRefLon: document.getElementById("gps-ref-lon"),
  gpsRefDelta: document.getElementById("gps-ref-delta"),
  natUtcClock: document.getElementById("nat-utc-clock"),
  natUtcLabel: document.getElementById("nat-utc-label"),
  natUtcChip: document.getElementById("nat-utc-chip"),
  settingsVersion: document.getElementById("settings-version"),
  themeBtn: document.getElementById("theme-btn"),
  chartFullscreenBtn: document.getElementById("chart-fullscreen-btn"),
  chartRouteSummary: document.getElementById("chart-route-summary"),
  chartRouteSummaryText: document.getElementById("chart-route-summary-text"),
  chartRouteSummaryGc: document.getElementById("chart-route-summary-gc"),
  vsGreatCircleToggle: document.getElementById("vs-great-circle-toggle"),
  vsGcToggleLabel: document.getElementById("vs-gc-toggle-label"),
  gcPlanBar: document.getElementById("gc-plan-bar"),
  gcDep: document.getElementById("gc-dep"),
  gcArr: document.getElementById("gc-arr"),
  gcDepCity: document.getElementById("gc-dep-city"),
  gcArrCity: document.getElementById("gc-arr-city"),
  gcPlanLabel: document.getElementById("gc-plan-label"),
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
/** Last automatic NAT fetch (panel open). Manual Refresh always allowed. */
let natLastAutoFetchMs = 0;
const NAT_AUTO_REFRESH_MS = 10 * 60 * 1000;

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
  if (el.stormSystemsToggle) {
    el.stormSystemsToggle.checked = state.settings.showStormSystems === true;
  }
  if (el.liveTsToggle) {
    el.liveTsToggle.checked = state.settings.showLiveThunderstorms === true;
  }
  if (el.vsGreatCircleToggle) {
    el.vsGreatCircleToggle.checked = state.settings.showVsGreatCircle === true;
  }
}

function setChartFullscreen(on) {
  document.body.classList.toggle("chart-fullscreen", on);
  if (el.chartFullscreenBtn) {
    el.chartFullscreenBtn.textContent = on ? "Exit" : "Full screen";
    el.chartFullscreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
    el.chartFullscreenBtn.title = on ? "Exit full screen chart" : "Full screen chart";
  }
  if (!on) {
    clearGcPlan();
    stopLiveTsRefreshTimer();
    clearLiveRadarMemory();
    setLiveTsLoading(false);
    hideWxDetail();
  }
  syncTrackToggleUi();
  syncGcPlanBar();
  syncVsGreatCircleUi();
  // Allow layout to settle before redraw
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      renderChart();
      if (on) void ensureWeatherLayers({ background: true });
    });
  });
}

function toggleChartFullscreen() {
  setChartFullscreen(!document.body.classList.contains("chart-fullscreen"));
}

/** No working route and no saved baseline — GC planner may appear. */
function routeIsIdleForGcPlan() {
  if (state.route?.length) return false;
  if (state.storedRoute?.route?.length) return false;
  return true;
}

function clearGcPlan() {
  state.gcDepIcao = "";
  state.gcArrIcao = "";
  state.gcPlanCache = null;
  state.gcViewKey = "";
  if (el.gcDep) el.gcDep.value = "";
  if (el.gcArr) el.gcArr.value = "";
  if (el.gcDep) el.gcDep.classList.remove("warn-diff");
  if (el.gcArr) el.gcArr.classList.remove("warn-diff");
  updateGcPlanLabel();
}

function normalizeGcIcaoInput(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
}

function resolveGcAirport(icao) {
  if (!icao || icao.length !== 4) return null;
  const from747 = lookupAirport747(icao);
  if (from747) return from747;
  const div = diversionAirportsPlottable(RWY_LABEL_MIN_M).find(
    (a) => a.icao === icao
  );
  return div || null;
}

/**
 * @returns {null | {
 *   dep: {icao:string,lat:number,lon:number},
 *   arr: {icao:string,lat:number,lon:number},
 *   points: {lat:number,lon:number}[],
 *   distanceNm: number,
 *   timeLabel: string,
 *   windKt?: number,
 *   gsKt?: number
 * }}
 */
function buildGcPlan() {
  const dep = resolveGcAirport(state.gcDepIcao);
  const arr = resolveGcAirport(state.gcArrIcao);
  if (!dep || !arr) return null;
  if (dep.icao === arr.icao) return null;
  const key = `${dep.icao}|${arr.icao}`;
  const cached = state.gcPlanCache;
  if (cached && cached.key === key) return cached.plan;
  const inv = vincentyInverse(dep.lat, dep.lon, arr.lat, arr.lon);
  const time = estimate747BlockTime(
    inv.distanceNm,
    dep.lat,
    dep.lon,
    arr.lat,
    arr.lon,
    { initialBearing: inv.initialBearing }
  );
  const plan = {
    dep,
    arr,
    points: greatCircleSamples(dep.lat, dep.lon, arr.lat, arr.lon, 80),
    distanceNm: inv.distanceNm,
    timeLabel: time.label,
    windKt: time.windKt,
    gsKt: time.gsKt,
  };
  state.gcPlanCache = { key, plan };
  return plan;
}

/** Multi-leg filed route (not idle 2-airport GC planner). */
function routeEligibleForVsGreatCircle() {
  return Array.isArray(state.route) && state.route.length >= 3;
}

/**
 * First→last great-circle comparison for a loaded multi-leg route.
 * @returns {null | {
 *   points: {lat:number,lon:number}[],
 *   distanceNm: number,
 *   eteMin: number,
 *   timeLabel: string,
 *   fromName: string,
 *   toName: string
 * }}
 */
function buildVsGreatCircleCompare() {
  if (state.settings.showVsGreatCircle !== true) return null;
  if (!routeEligibleForVsGreatCircle()) return null;
  const a = state.route[0];
  const b = state.route[state.route.length - 1];
  if (
    !a ||
    !b ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lon) ||
    !Number.isFinite(b.lat) ||
    !Number.isFinite(b.lon)
  ) {
    return null;
  }
  if (a.lat === b.lat && a.lon === b.lon) return null;
  const key = `${a.lat.toFixed(5)},${a.lon.toFixed(5)}|${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
  const cached = state.vsGcCache;
  if (cached && cached.key === key) return cached.plan;
  const inv = vincentyInverse(a.lat, a.lon, b.lat, b.lon);
  if (!Number.isFinite(inv.distanceNm) || inv.distanceNm <= 0) return null;
  /*
   * Match Legs ETE padding: each airport end that would touch a leg gets a
   * climb/descent pad. A multi-leg KMIA…EHAM route pads the first leg AND the
   * last leg (~20+20). A single GC call with terminalPad:true only pads once,
   * which made vs-GC look ~20 min “faster” even for a ~27 NM distance delta.
   */
  const cruise = estimate747BlockTime(inv.distanceNm, a.lat, a.lon, b.lat, b.lon, {
    terminalPad: false,
    initialBearing: inv.initialBearing,
  });
  const padEach = inv.distanceNm < 120 ? 10 : 20;
  let padMin = 0;
  if (isAirportWaypoint(a)) padMin += padEach;
  if (isAirportWaypoint(b)) padMin += padEach;
  const eteMin = Math.max(0, Math.round(cruise.minutes + padMin));
  const plan = {
    points: greatCircleSamples(a.lat, a.lon, b.lat, b.lon, 80),
    distanceNm: inv.distanceNm,
    eteMin,
    timeLabel: formatEteHhMm(eteMin),
    fromName: a.name || "START",
    toName: b.name || "END",
  };
  state.vsGcCache = { key, plan };
  return plan;
}

function syncVsGreatCircleUi() {
  const fullscreen = document.body.classList.contains("chart-fullscreen");
  const show = fullscreen && routeEligibleForVsGreatCircle();
  if (el.vsGcToggleLabel) el.vsGcToggleLabel.hidden = !show;
  if (el.vsGreatCircleToggle) {
    el.vsGreatCircleToggle.checked = state.settings.showVsGreatCircle === true;
  }
  if (!show && el.chartRouteSummaryGc) {
    el.chartRouteSummaryGc.hidden = true;
    el.chartRouteSummaryGc.textContent = "";
  }
}

function updateGcCityChip(which, icao) {
  const label = which === "dep" ? el.gcDepCity : el.gcArrCity;
  if (!label) return;
  const ap = resolveGcAirport(icao);
  const short =
    ap?.shortName ||
    (ap?.name && ap.name !== ap.icao ? ap.name : "") ||
    "";
  if (short && icao && icao.length === 4 && ap) {
    label.textContent = short;
    label.hidden = false;
    label.title = `${short} (${icao})`;
  } else {
    label.textContent = "";
    label.hidden = true;
    label.title = "";
  }
}

function updateGcPlanLabel() {
  if (!el.gcPlanLabel) return;
  updateGcCityChip("dep", state.gcDepIcao);
  updateGcCityChip("arr", state.gcArrIcao);
  const plan = buildGcPlan();
  if (plan) {
    el.gcPlanLabel.textContent = `${formatDistanceNm(plan.distanceNm)} NM, ${plan.timeLabel}`;
    el.gcPlanLabel.classList.add("is-ready");
    const windNote =
      plan.windKt === 0
        ? "calm mid-lat wind model"
        : plan.windKt > 0
          ? `~${plan.windKt} kt tailwind (westerlies)`
          : `~${Math.abs(plan.windKt)} kt headwind (westerlies)`;
    el.gcPlanLabel.title = `GC NM + crude 747 block (~${plan.gsKt} kt GS; ${windNote})`;
  } else {
    el.gcPlanLabel.textContent = "PLAN 747-8 Great Circle";
    el.gcPlanLabel.classList.remove("is-ready");
    el.gcPlanLabel.title = "";
  }
}

function syncGcPlanBar() {
  const show =
    document.body.classList.contains("chart-fullscreen") && routeIsIdleForGcPlan();
  if (el.gcPlanBar) el.gcPlanBar.hidden = !show;
  syncVsGreatCircleUi();
  if (!show) return;
  updateGcPlanLabel();
}

function onGcIcaoInput(which, raw) {
  const code = normalizeGcIcaoInput(raw);
  const input = which === "dep" ? el.gcDep : el.gcArr;
  if (input && input.value !== code) input.value = code;
  if (which === "dep") state.gcDepIcao = code;
  else state.gcArrIcao = code;
  state.gcPlanCache = null;
  if (input) {
    const ok = code.length === 0 || (code.length === 4 && !!resolveGcAirport(code));
    input.classList.toggle("warn-diff", code.length > 0 && !ok);
  }
  syncGcChartFit();
  updateGcPlanLabel();
  renderChart();
}

/**
 * When DEP/DEST change, snap pan/zoom so the GC (or single airport) is framed.
 * Avoids leftover NAT exploration offsets hiding the new plan.
 */
function syncGcChartFit() {
  if (!routeIsIdleForGcPlan()) {
    state.gcViewKey = "";
    return;
  }
  const dep = resolveGcAirport(state.gcDepIcao);
  const arr = resolveGcAirport(state.gcArrIcao);
  let key = "";
  if (dep && arr && dep.icao !== arr.icao) key = `gc:${dep.icao}|${arr.icao}`;
  else if (dep) key = `gc1:${dep.icao}`;
  else if (arr) key = `gc1:${arr.icao}`;
  if (key === state.gcViewKey) return;
  state.gcViewKey = key;
  if (key) resetChartView();
}

/** Full-screen GC planner: 1st tap → DEP, 2nd → DEST, further tap restarts with new DEP. */
function selectGcAirportFromTap(ap) {
  if (!ap?.icao) return;
  if (
    !document.body.classList.contains("chart-fullscreen") ||
    !routeIsIdleForGcPlan()
  ) {
    return;
  }
  const code = normalizeGcIcaoInput(ap.icao);
  if (!resolveGcAirport(code) && !(Number.isFinite(ap.lat) && Number.isFinite(ap.lon))) {
    return;
  }
  if (!state.gcDepIcao) {
    onGcIcaoInput("dep", code);
  } else if (!state.gcArrIcao || state.gcArrIcao === state.gcDepIcao) {
    onGcIcaoInput("arr", code);
  } else {
    onGcIcaoInput("dep", code);
    onGcIcaoInput("arr", "");
  }
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
  if (state.settings.showStormSystems !== true) state.settings.showStormSystems = false;
  if (state.settings.showLiveThunderstorms !== true) {
    state.settings.showLiveThunderstorms = false;
  }
  if (state.settings.showVsGreatCircle !== true) {
    state.settings.showVsGreatCircle = false;
  }
  if (el.stormSystemsToggle) {
    el.stormSystemsToggle.checked = state.settings.showStormSystems === true;
  }
  if (el.liveTsToggle) {
    el.liveTsToggle.checked = state.settings.showLiveThunderstorms === true;
  }
  if (el.vsGreatCircleToggle) {
    el.vsGreatCircleToggle.checked = state.settings.showVsGreatCircle === true;
  }
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

function isAirportWaypoint(w) {
  if (!w) return false;
  if (String(w.category || "").toLowerCase() === "airport") return true;
  const icao = String(w.name || w.id || "")
    .trim()
    .toUpperCase();
  if (icao.length !== 4) return false;
  return !!resolveGcAirport(icao);
}

/** Sum crude ETE minutes for a route (same rules as Legs ETE column). */
function computeRouteTotalEteMin(route) {
  if (!route || route.length < 2) return 0;
  let total = 0;
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
    const inv = vincentyInverse(a.lat, a.lon, b.lat, b.lon);
    const pad = isAirportWaypoint(a) || isAirportWaypoint(b);
    total += estimate747BlockTime(inv.distanceNm, a.lat, a.lon, b.lat, b.lon, {
      terminalPad: pad,
      initialBearing: inv.initialBearing,
    }).minutes;
  }
  return total;
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
  const computed =
    state.routeTotals.key === key
      ? state.routeTotals
      : (() => {
          const c = computeLegs();
          return {
            legsCount: c.legs.length,
            totalNm: c.totalNm,
            totalEteMin: c.totalEteMin,
            key,
          };
        })();
  persistStoredRoute({
    waypoints: route.length,
    totalNm: computed.totalNm,
    totalEteMin: computed.totalEteMin,
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
  state.skippedUnknowns = false;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  fitChartAfterRouteChange(0, "restore");
  updateEntryChrome();
  renderAll();
}

function loadLastRouteSnapshot() {
  if (state.lastRoute?.length) return state.lastRoute;
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    state.lastRoute = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function rememberLastRoute(route) {
  if (!route?.length) return;
  const snap = snapshotRoutePoints(route);
  state.lastRoute = snap;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore quota */
  }
}

function hasLastRouteToRestore() {
  return Boolean(loadLastRouteSnapshot()?.length);
}

function updateRouteClearConfirmUi() {
  const empty = !state.route.length;
  const showRestore = empty && hasLastRouteToRestore();
  if (el.routeRestoreLastBtn) el.routeRestoreLastBtn.hidden = !showRestore;
  if (el.routeRestoreHelp) el.routeRestoreHelp.hidden = !showRestore;
}

function openRouteClearConfirm() {
  if (state.editingIndex != null || state.insertAfterIndex != null) {
    cancelEditMode();
    return;
  }
  if (!state.route.length && !state.storedRoute && !hasLastRouteToRestore()) {
    return;
  }
  updateRouteClearConfirmUi();
  if (el.routeClearConfirm) el.routeClearConfirm.hidden = false;
}

function restoreLastRouteAction() {
  if (el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  const snap = loadLastRouteSnapshot();
  if (!snap?.length) return;
  const prevLen = state.route.length;
  state.route = snapshotRoutePoints(snap).map((p) => enrichPoint({ ...p }));
  state.editingIndex = null;
  state.insertAfterIndex = null;
  state.skippedUnknowns = false;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  fitChartAfterRouteChange(prevLen, "restore");
  updateEntryChrome();
  renderAll();
}

function clearWorkingRouteOnly() {
  if (state.route.length) rememberLastRoute(state.route);
  state.route = [];
  state.editingIndex = null;
  state.insertAfterIndex = null;
  state.skippedUnknowns = false;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  resetChartView();
  updateEntryChrome();
  renderAll();
}

function clearEditsAction() {
  if (el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  if (state.route.length) rememberLastRoute(state.route);
  if (state.storedRoute?.route?.length) {
    restoreRouteFromStored();
  } else {
    clearWorkingRouteOnly();
  }
}

function clearAllAction() {
  if (el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  if (state.route.length) {
    rememberLastRoute(state.route);
  } else if (state.storedRoute?.route?.length) {
    rememberLastRoute(state.storedRoute.route);
  }
  clearStoredRoute();
  // Avoid double-remember: clearWorkingRouteOnly also remembers if non-empty
  state.route = [];
  state.editingIndex = null;
  state.insertAfterIndex = null;
  state.skippedUnknowns = false;
  if (el.input) el.input.value = "";
  hideSuggestions();
  showError("");
  resetChartView();
  updateEntryChrome();
  renderAll();
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
  const byName = new Map(
    state.db.map((w) => [String(w.name || "").toUpperCase(), w])
  );
  for (const w of learned) {
    const name = String(w?.name || "").toUpperCase();
    if (!name || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) continue;
    const existing = byName.get(name);
    const isManual =
      w.source === "manual-teach" || w.category === "manual";
    if (existing) {
      // Manual Teach always wins over bundled / online / NAT-learned
      if (isManual) {
        existing.lat = w.lat;
        existing.lon = w.lon;
        existing.accuracy = w.accuracy || "learned";
        existing.category = "manual";
        existing.notes = w.notes || existing.notes;
        existing.source = "manual-teach";
      }
      continue;
    }
    // Do not re-introduce online lookups that conflict was skipped — only add new
    state.db.push({
      id: w.id || name,
      name,
      lat: w.lat,
      lon: w.lon,
      accuracy: w.accuracy || (isManual ? "learned" : "approximate"),
      category: w.category || "nat-track",
      notes: w.notes || "Learned from NAT tracks message",
      source: w.source || "learned",
    });
    byName.set(name, state.db[state.db.length - 1]);
  }
}

/**
 * Chart enroute alternates (diversion airports) are route-selectable by ICAO.
 * Skip names already present in the bundled / learned DB (e.g. TXKF, LPLA).
 */
function mergeDiversionAirportsIntoDb() {
  const known = new Set(
    state.db.flatMap((w) =>
      [w.name, w.id]
        .filter(Boolean)
        .map((s) => String(s).toUpperCase())
    )
  );
  for (const ap of DIVERSION_AIRPORTS) {
    const icao = String(ap?.icao || "").trim().toUpperCase();
    if (!icao || !Number.isFinite(ap.lat) || !Number.isFinite(ap.lon)) continue;
    if (known.has(icao)) continue;
    const longest = (ap.runways || [])[0];
    const rwyNote = longest
      ? `Longest ${longest.rwy} ${longest.rwyM} m`
      : "Enroute alternate";
    state.db.push({
      id: icao,
      name: icao,
      lat: ap.lat,
      lon: ap.lon,
      accuracy: "exact",
      category: "airport",
      region: "diversion",
      notes: `${ap.name || icao}. ${rwyNote}`,
    });
    known.add(icao);
  }
}

/** 747-8 ICAOs available for route entry / suggest everywhere (not chart-clutter). */
function merge747AirportsIntoDb() {
  const known = new Set(
    state.db.flatMap((w) =>
      [w.name, w.id]
        .filter(Boolean)
        .map((s) => String(s).toUpperCase())
    )
  );
  for (const ap of airports747List()) {
    const icao = String(ap?.icao || "").trim().toUpperCase();
    if (!icao || !Number.isFinite(ap.lat) || !Number.isFinite(ap.lon)) continue;
    if (known.has(icao)) continue;
    const longest = (ap.runways || [])[0];
    const rwyNote = longest
      ? `Longest ${longest.rwy} ${longest.rwyM} m`
      : "747-8 airport";
    state.db.push({
      id: icao,
      name: icao,
      lat: ap.lat,
      lon: ap.lon,
      accuracy: "exact",
      category: "airport",
      region: "747-8",
      notes: `${ap.name || icao}. ${rwyNote}`,
    });
    known.add(icao);
  }
}

/** Bundled WATRS / NY OAC airway fixes (M201–M204 educational set). */
function mergeWatrsWaypointsIntoDb(watrs) {
  const known = new Set(
    state.db.flatMap((w) =>
      [w.name, w.id]
        .filter(Boolean)
        .map((s) => String(s).toUpperCase())
    )
  );
  for (const w of watrs?.waypoints || []) {
    const name = String(w?.name || "")
      .trim()
      .toUpperCase();
    if (!name || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) continue;
    if (known.has(name)) continue;
    state.db.push({
      id: name,
      name,
      lat: w.lat,
      lon: w.lon,
      accuracy: w.accuracy || "approximate",
      category: w.category || "watrs",
      region: w.country || "WATRS",
      notes:
        w.notes ||
        "WATRS / New York OAC educational fix — verify NFDC/AIP.",
      source: w.source || "watrs-airways",
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

function setIcloudSyncStatus(msg, isError = false) {
  if (!el.icloudSyncStatus) {
    el.icloudSyncStatus = document.getElementById("icloud-sync-status");
  }
  if (!el.icloudSyncStatus) return;
  if (!msg) {
    el.icloudSyncStatus.hidden = true;
    el.icloudSyncStatus.textContent = "";
    el.icloudSyncStatus.classList.remove("is-error");
    return;
  }
  el.icloudSyncStatus.textContent = msg;
  el.icloudSyncStatus.classList.toggle("is-error", isError);
  el.icloudSyncStatus.hidden = false;
}

function learnedBackupFilename() {
  return "MyNatTrack-learned.json";
}

function buildLearnedBackupPayload() {
  return {
    format: "mynattrack-learned-v1",
    exportedOn: todayUtcDate(),
    accuracyVerifiedOn: state.accuracyVerifiedOn || loadStoredAccuracyDate() || "",
    waypoints: loadLearnedWaypoints(),
  };
}

function downloadJsonFile(obj, filename) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
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

async function exportLearnedToFiles() {
  const payload = buildLearnedBackupPayload();
  const filename = learnedBackupFilename();
  const text = JSON.stringify(payload, null, 2);
  const file = new File([text], filename, {
    type: "application/json",
    lastModified: Date.now(),
  });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "MyNatTrack learned waypoints",
        text: "Save to Files → iCloud Drive (MyNatTrack folder) for use on your other devices.",
      });
      setIcloudSyncStatus(
        `Shared ${payload.waypoints.length} learned fix(es). Choose Save to Files → iCloud Drive.`
      );
      return;
    }
  } catch (err) {
    if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
      setIcloudSyncStatus("Share cancelled.");
      return;
    }
  }
  downloadJsonFile(payload, filename);
  setIcloudSyncStatus(
    `Downloaded ${filename} (${payload.waypoints.length} fix(es)). Move it into iCloud Drive if needed.`
  );
}

/**
 * Merge a learned JSON backup. Priority: manual Teach > existing manual > incoming > older online.
 * AIM Table 1.1 OEPs are never taken from the backup (unless marked manual-teach).
 */
function mergeLearnedBackupPayload(payload) {
  const incoming = Array.isArray(payload?.waypoints) ? payload.waypoints : [];
  if (!incoming.length) {
    return { added: 0, updated: 0, skipped: 0 };
  }
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const learned = loadLearnedWaypoints();
  const learnedBy = new Map(
    learned.map((w) => [String(w?.name || "").toUpperCase(), w])
  );

  for (const raw of incoming) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      continue;
    }
    const name = String(raw.name || "")
      .trim()
      .toUpperCase();
    const lat = Number(raw.lat);
    const lon = Number(raw.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped += 1;
      continue;
    }
    if (isAimOepName(name) && !isManualTaughtEntry(raw)) {
      skipped += 1;
      continue;
    }
    const entry = {
      id: raw.id || name,
      name,
      lat,
      lon,
      accuracy: raw.accuracy || "approximate",
      category: raw.category || (isManualTaughtEntry(raw) ? "manual" : "learned"),
      region: raw.region || "backup",
      notes: raw.notes || "Imported from iCloud / Files backup",
      source: raw.source || (isManualTaughtEntry(raw) ? "manual-teach" : "icloud-import"),
    };

    const existingLearned = learnedBy.get(name);
    if (existingLearned && isManualTaughtEntry(existingLearned) && !isManualTaughtEntry(entry)) {
      skipped += 1;
      continue;
    }

    const dbHit = state.db.find((w) => String(w.name || "").toUpperCase() === name);
    if (dbHit && isManualTaughtEntry(dbHit) && !isManualTaughtEntry(entry)) {
      skipped += 1;
      continue;
    }

    if (dbHit) {
      dbHit.lat = entry.lat;
      dbHit.lon = entry.lon;
      dbHit.accuracy = entry.accuracy;
      dbHit.category = entry.category;
      dbHit.notes = entry.notes;
      dbHit.source = entry.source;
      updated += 1;
    } else {
      state.db.push({ ...entry });
      added += 1;
    }

    learnedBy.set(name, entry);
  }

  const next = [...learnedBy.values()];
  saveLearnedWaypoints(next);
  if (payload.accuracyVerifiedOn) {
    setAccuracyVerifiedDate(String(payload.accuracyVerifiedOn));
  } else {
    setAccuracyVerifiedDate(todayUtcDate());
  }
  refreshMarkdownWithLearned();
  // Refresh route copies of updated names
  const names = new Set(
    incoming.map((w) => String(w?.name || "").toUpperCase()).filter(Boolean)
  );
  state.route = state.route.map((wp) => {
    const n = String(wp.name || "").toUpperCase();
    if (!names.has(n)) return wp;
    const hit = state.db.find((w) => String(w.name || "").toUpperCase() === n);
    return hit ? enrichPoint({ ...hit }) : wp;
  });
  saveRoute();
  return { added, updated, skipped };
}

async function importLearnedFromFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (payload?.format && payload.format !== "mynattrack-learned-v1") {
      setIcloudSyncStatus("Unrecognized backup format.", true);
      return;
    }
    if (!Array.isArray(payload?.waypoints)) {
      setIcloudSyncStatus("File has no waypoints array.", true);
      return;
    }
    const { added, updated, skipped } = mergeLearnedBackupPayload(payload);
    applyAimOepCorrections();
    renderAll();
    setIcloudSyncStatus(
      `Imported: ${added} added, ${updated} updated, ${skipped} skipped.`
    );
  } catch (err) {
    setIcloudSyncStatus(err?.message || "Could not read that JSON file.", true);
  }
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
  let totalEteMin = 0;
  for (let i = 0; i < state.route.length - 1; i += 1) {
    const a = state.route[i];
    const b = state.route[i + 1];
    const inv = vincentyInverse(a.lat, a.lon, b.lat, b.lon);
    const avgTrue = averageBearing(inv.initialBearing, inv.finalBearing);
    const midLat = (a.lat + b.lat) / 2;
    const midLon = (a.lon + b.lon) / 2;
    const avgMag = trueToMagnetic(avgTrue, midLat, midLon);
    const initMag = trueToMagnetic(inv.initialBearing, a.lat, a.lon);
    const terminalPad = isAirportWaypoint(a) || isAirportWaypoint(b);
    const ete = estimate747BlockTime(
      inv.distanceNm,
      a.lat,
      a.lon,
      b.lat,
      b.lon,
      { terminalPad, initialBearing: inv.initialBearing }
    );
    totalNm += inv.distanceNm;
    totalEteMin += ete.minutes;
    legs.push({
      from: a,
      to: b,
      avgTrue,
      avgMag,
      initTrue: inv.initialBearing,
      initMag,
      distanceNm: inv.distanceNm,
      eteMin: ete.minutes,
      eteLabel: ete.label,
      avgVarLabel: formatVariation(midLat, midLon),
      initVarLabel: formatVariation(a.lat, a.lon),
    });
  }
  return { legs, totalNm, totalEteMin };
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

function updateUnknownRemark() {
  if (!el.routeUnknownRemark) {
    el.routeUnknownRemark = document.getElementById("route-unknown-remark");
  }
  if (!el.routeUnknownRemark) return;
  const show = Boolean(state.skippedUnknowns && state.route.length);
  el.routeUnknownRemark.hidden = !show;
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
  if (el.teachBtn) {
    el.teachBtn.hidden = !shouldShowTeachButton();
  }
  if (el.routeHint) {
    if (editing) {
      el.routeHint.textContent = `Editing waypoint ${state.editingIndex + 1}. Teach to correct coordinates, Update to replace, or Cancel.`;
      el.routeHint.hidden = false;
    } else if (inserting) {
      el.routeHint.textContent = `Inserting after waypoint ${state.insertAfterIndex + 1}. Enter one or more waypoints, then Insert.`;
      el.routeHint.hidden = false;
    } else {
      el.routeHint.textContent =
        "Paste a full space-separated route, or add single waypoints. Use Edit / Teach / Insert / ↑↓ / × for ATC changes.";
      el.routeHint.hidden = false;
    }
  }
  updateUnknownRemark();
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

function routeAccuracyBadge(wp) {
  if (!wp) return "";
  if (isManualTaughtEntry(wp) || wp.accuracy === "learned") {
    const title = wp.notes || "Manually taught / learned on this device";
    return `<span class="badge learned" title="${title}">learned</span>`;
  }
  if (wp.accuracy === "approximate") {
    return `<span class="badge approx" title="${wp.notes || "Approximate"}">approx</span>`;
  }
  return "";
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
    const badge = routeAccuracyBadge(wp);
    li.innerHTML = `
      <span class="idx">${index + 1}</span>
      <span class="name">${wp.name}${badge}</span>
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

function formatEteDelta(deltaMin) {
  const abs = formatEteHhMm(Math.abs(deltaMin));
  if (Math.abs(deltaMin) < 0.5) return { text: `ETE ${abs}`, kind: "same" };
  if (deltaMin < 0) return { text: `ETE −${abs}`, kind: "shorter" };
  return { text: `ETE +${abs}`, kind: "longer" };
}

/** Compact title form: "mod diff 240.0nm · −00:32". */
function formatModDiffTitle(deltaNm, deltaEteMin) {
  const abs = formatDistanceNm(Math.abs(deltaNm));
  let nmPart = `mod diff ${abs}nm`;
  if (Math.abs(deltaNm) >= 0.05) {
    nmPart = deltaNm < 0 ? `mod diff −${abs}nm` : `mod diff +${abs}nm`;
  }
  if (deltaEteMin == null || !Number.isFinite(deltaEteMin)) return nmPart;
  const ete = formatEteDelta(deltaEteMin);
  return `${nmPart} · ${ete.text}`;
}

function clearLegsModDiff() {
  if (!el.legsModDiff) return;
  el.legsModDiff.hidden = true;
  el.legsModDiff.textContent = "";
}

function updateLegsModDiff(deltaNm, deltaEteMin) {
  if (!el.legsModDiff) return;
  if (deltaNm == null || !Number.isFinite(deltaNm)) {
    clearLegsModDiff();
    return;
  }
  el.legsModDiff.textContent = formatModDiffTitle(deltaNm, deltaEteMin);
  el.legsModDiff.hidden = false;
}

function storedRouteEteMin(stored) {
  if (!stored) return 0;
  if (Number.isFinite(stored.totalEteMin)) return stored.totalEteMin;
  if (stored.route?.length >= 2) return computeRouteTotalEteMin(stored.route);
  return 0;
}

function updateTotalsCompare(currentNm, currentEteMin) {
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
  if (stored.key && curKey && stored.key === curKey) {
    hideAll();
    return;
  }
  const storedEte = storedRouteEteMin(stored);
  const storedEteTxt = formatEteHhMm(storedEte);
  if (!state.route.length) {
    if (el.totalsCompare) {
      el.totalsCompare.innerHTML =
        `Your stored route was ${stored.waypoints} waypoints · ` +
        `${formatDistanceNm(stored.totalNm)} NM total · ETE ${storedEteTxt}`;
      el.totalsCompare.hidden = false;
    }
    clearLegsModDiff();
    return;
  }
  let nm = currentNm;
  let eteMin = currentEteMin;
  if (nm == null || eteMin == null) {
    const legs = computeLegs();
    if (nm == null) nm = legs.totalNm;
    if (eteMin == null) eteMin = legs.totalEteMin;
  }
  const delta = nm - stored.totalNm;
  const deltaEte = eteMin - storedEte;
  const diff = formatNmDelta(delta);
  const eteDiff = formatEteDelta(deltaEte);
  const diffClass =
    diff.kind === "shorter"
      ? "diff-shorter"
      : diff.kind === "longer"
        ? "diff-longer"
        : "";
  const eteClass =
    eteDiff.kind === "shorter"
      ? "diff-shorter"
      : eteDiff.kind === "longer"
        ? "diff-longer"
        : "";
  if (el.totalsCompare) {
    el.totalsCompare.innerHTML =
      `vs stored · ${stored.waypoints} waypoints · ` +
      `${formatDistanceNm(stored.totalNm)} NM · ETE ${storedEteTxt} · ` +
      `<span class="${diffClass}">${diff.text}</span> · ` +
      `<span class="${eteClass}">${eteDiff.text}</span>`;
    el.totalsCompare.hidden = false;
  }
  updateLegsModDiff(delta, deltaEte);
}

function syncChartRouteSummary(nm, eteMin) {
  if (!el.chartRouteSummary || !el.chartRouteSummaryText) return;
  if (!state.route.length || state.route.length < 2) {
    el.chartRouteSummary.hidden = true;
    el.chartRouteSummaryText.textContent = "";
    if (el.chartRouteSummaryGc) {
      el.chartRouteSummaryGc.hidden = true;
      el.chartRouteSummaryGc.textContent = "";
    }
    syncVsGreatCircleUi();
    return;
  }
  const n = Number.isFinite(nm) ? nm : state.routeTotals.totalNm;
  const e = Number.isFinite(eteMin) ? eteMin : state.routeTotals.totalEteMin;
  el.chartRouteSummaryText.textContent = `${formatDistanceNm(n)} NM · ETE ${formatEteHhMm(e)}`;
  el.chartRouteSummary.hidden = false;

  const vs =
    document.body.classList.contains("chart-fullscreen") &&
    state.settings.showVsGreatCircle === true
      ? buildVsGreatCircleCompare()
      : null;
  if (el.chartRouteSummaryGc) {
    if (vs) {
      el.chartRouteSummaryGc.textContent = `GC ${formatDistanceNm(vs.distanceNm)} NM · ETE ${vs.timeLabel}`;
      el.chartRouteSummaryGc.hidden = false;
      el.chartRouteSummaryGc.title = `Great circle ${vs.fromName} → ${vs.toName}`;
    } else {
      el.chartRouteSummaryGc.textContent = "";
      el.chartRouteSummaryGc.hidden = true;
      el.chartRouteSummaryGc.title = "";
    }
  }
  syncVsGreatCircleUi();
}

function updateTotalsLine(legsCount, totalNm, totalEteMin) {
  if (!el.totals) return;
  if (!state.route.length) {
    state.routeTotals = { legsCount: 0, totalNm: 0, totalEteMin: 0, key: "" };
    el.totals.textContent = "—";
    syncChartRouteSummary(0, 0);
    updateTotalsCompare(0, 0);
    return;
  }
  const key = routeSequenceKey(state.route);
  let nLegs = legsCount;
  let nm = totalNm;
  let ete = totalEteMin;
  if (nLegs == null || nm == null || ete == null) {
    if (state.routeTotals.key === key) {
      nLegs = state.routeTotals.legsCount;
      nm = state.routeTotals.totalNm;
      ete = state.routeTotals.totalEteMin;
    } else {
      const computed = computeLegs();
      nLegs = computed.legs.length;
      nm = computed.totalNm;
      ete = computed.totalEteMin;
      state.routeTotals = {
        legsCount: nLegs,
        totalNm: nm,
        totalEteMin: ete,
        key,
      };
    }
  } else {
    state.routeTotals = {
      legsCount: nLegs,
      totalNm: nm,
      totalEteMin: ete,
      key,
    };
  }
  el.totals.textContent =
    `${state.route.length} waypoints · ${nLegs} legs · ${formatDistanceNm(nm)} NM total · ETE ${formatEteHhMm(ete)}` +
    gpsProgressSuffix();
  syncChartRouteSummary(nm, ete);
  updateTotalsCompare(nm, ete);
}

function renderLegs() {
  const { legs, totalNm, totalEteMin } = computeLegs();
  if (!el.legsBody) {
    updateTotalsLine(legs.length, totalNm, totalEteMin);
    return;
  }
  el.legsBody.innerHTML = "";
  const showMag = state.settings.showMagnetic;

  if (el.thAvgMag) el.thAvgMag.hidden = !showMag;
  if (el.thInitMag) el.thInitMag.hidden = !showMag;

  legs.forEach((leg) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="leg-from">${leg.from.name}</td>
      <td class="leg-to">${leg.to.name}</td>
      <td class="mono leg-avg-true">${formatTrack(leg.avgTrue)}°</td>
      <td class="mono leg-avg-mag" ${showMag ? "" : "hidden"}>${formatTrack(leg.avgMag)}° <span class="muted">(${leg.avgVarLabel})</span></td>
      <td class="mono leg-init-true">${formatTrack(leg.initTrue)}°</td>
      <td class="mono leg-init-mag" ${showMag ? "" : "hidden"}>${formatTrack(leg.initMag)}° <span class="muted">(${leg.initVarLabel})</span></td>
      <td class="mono leg-dist">${formatDistanceNm(leg.distanceNm)}</td>
      <td class="mono leg-ete" title="Crude ETE (westerlies; climb/descent pad only if either end is an airport)">${leg.eteLabel}</td>
    `;
    el.legsBody.appendChild(tr);
  });

  updateTotalsLine(legs.length, totalNm, totalEteMin);
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
    m.includes("the operation was aborted") ||
    m.includes("offline") ||
    m.includes("network request failed")
  );
}

function openNatTracksPanel() {
  if (!el.natPanel) return;
  el.natPanel.hidden = false;
  renderNatPanel();
  maybeAutoRefreshNatOnOpen();
}

/** Auto-fetch when panel opens (online only); at most once per 10 minutes. */
function maybeAutoRefreshNatOnOpen() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const now = Date.now();
  if (natLastAutoFetchMs > 0 && now - natLastAutoFetchMs < NAT_AUTO_REFRESH_MS) {
    return;
  }
  natLastAutoFetchMs = now;
  refreshNatTracks().catch(() => {});
}

async function refreshNatTracks({ openPanel = false } = {}) {
  if (state.natLoading) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    /* Offline: keep cached tracks; no error message */
    if (openPanel && el.natPanel) el.natPanel.hidden = false;
    renderNatPanel();
    return;
  }
  state.natLoading = true;
  renderNatPanel();
  if (el.natRefreshBtn) el.natRefreshBtn.disabled = true;
  try {
    const result = await fetchNatTracks(state.db);
    if (!result.ok) {
      // Keep last good tracks; never surface offline/network blips
      if (state.nat || isSilentNatFetchFailure(result.error)) {
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

let liveTsRefreshTimer = 0;
let radarReloadTimer = 0;
let radarLoading = false;

function stopLiveTsRefreshTimer() {
  if (liveTsRefreshTimer) {
    clearInterval(liveTsRefreshTimer);
    liveTsRefreshTimer = 0;
  }
}

function setLiveTsLoading(on) {
  radarLoading = on === true;
  if (el.liveTsLoading) el.liveTsLoading.hidden = !radarLoading;
}

function pruneStormSystemsForPaint(payload) {
  if (!payload) return null;
  const sigmets = dedupePolygons(filterActivePolygons(payload.sigmets || []));
  return {
    ...payload,
    storms: payload.storms || [],
    sigmets,
    volcanoes: extractVolcanoes(sigmets),
  };
}

function updateWeatherStatusLine() {
  if (!el.weatherStatusEl) return;
  const fullscreen = document.body.classList.contains("chart-fullscreen");
  const parts = [];
  if (fullscreen && state.settings.showStormSystems && state.stormSystems) {
    const n =
      (state.stormSystems.storms?.length || 0) +
      (filterActivePolygons(state.stormSystems.sigmets || []).length || 0);
    const vols = extractVolcanoes(
      filterActivePolygons(state.stormSystems.sigmets || [])
    ).length;
    const age = formatWeatherAge(state.stormSystems.fetchedAt);
    parts.push(
      `Storms+SIGMET · ${n}${vols ? ` · ${vols} VA` : ""} · ${
        state.stormSystems.fromCache ? "cached " : ""
      }${age}`
    );
  }
  if (fullscreen && state.settings.showLiveThunderstorms) {
    const radar = getLiveRadarMemory();
    if (radarLoading) {
      parts.push("Live TS · loading…");
    } else if (radar?.tiles?.length) {
      parts.push(`Live TS radar · ${formatWeatherAge(radar.fetchedAt)}`);
    } else if (state.weatherStatus) {
      parts.push(state.weatherStatus);
    } else {
      parts.push("Live TS · zoom in for radar");
    }
  }
  if (!parts.length) {
    el.weatherStatusEl.hidden = true;
    el.weatherStatusEl.textContent = "";
    return;
  }
  el.weatherStatusEl.hidden = false;
  el.weatherStatusEl.textContent = parts.join(" · ");
}

function visibleWeatherSpan(layout) {
  if (!layout) return 40;
  const half = Math.min(layout.width || 800, layout.height || 600) * 0.5;
  const ang =
    (Math.asin(Math.min(0.999, half / Math.max(layout.radius, 1))) * 180) /
    Math.PI;
  return Math.max(8, ang * 2.2);
}

/** Regional RainViewer tiles — only when Live TS on and zoomed to basin-sized disc.
 * @returns {Promise<boolean>} true if chart should repaint
 */
async function ensureLiveRadarDetail({ force = false } = {}) {
  const fullscreen = document.body.classList.contains("chart-fullscreen");
  if (!fullscreen || !state.settings.showLiveThunderstorms) {
    const had = !!getLiveRadarMemory();
    clearLiveRadarMemory();
    setLiveTsLoading(false);
    return had;
  }
  const layout = state.lastChartLayout;
  if (
    !layout ||
    !isRegionalWeatherView(layout, layout.width, layout.height)
  ) {
    const had = !!getLiveRadarMemory();
    clearLiveRadarMemory();
    return had;
  }
  if (navigator.onLine === false) {
    state.weatherStatus = "Live TS radar needs online";
    return false;
  }

  const span = visibleWeatherSpan(layout);
  const prevKey = getLiveRadarMemory()?.key || "";
  setLiveTsLoading(true);
  updateWeatherStatusLine();
  try {
    const data = await loadLiveRadarDetail({
      lat0: layout.lat0,
      lon0: layout.lon0,
      spanLat: span,
      spanLon: span,
      force,
    });
    state.weatherStatus = "";
    return !data?.fromMemory || data.key !== prevKey;
  } catch {
    state.weatherStatus = "Radar detail unavailable";
    return false;
  } finally {
    setLiveTsLoading(false);
    updateWeatherStatusLine();
  }
}

function scheduleRadarReload() {
  clearTimeout(radarReloadTimer);
  radarReloadTimer = window.setTimeout(() => {
    if (!state.settings.showLiveThunderstorms) return;
    if (!document.body.classList.contains("chart-fullscreen")) return;
    void ensureLiveRadarDetail().then((changed) => {
      if (changed && document.body.classList.contains("chart-fullscreen")) {
        renderChart();
      }
    });
  }, 280);
}

function hideWxDetail() {
  if (el.wxDetail) el.wxDetail.hidden = true;
}

function showWxDetail(poly) {
  if (!el.wxDetail || !poly) return;
  const title = String(poly.name || poly.label || poly.hazard || "SIGMET").trim();
  if (el.wxDetailTitle) el.wxDetailTitle.textContent = title;
  const bits = [];
  bits.push(`${title}${poly.hazard ? ` · ${poly.hazard}` : ""}`);
  if (poly.validFrom || poly.validTo) {
    bits.push(`Valid ${poly.validFrom || "?"} → ${poly.validTo || "?"}`);
  }
  if (
    (poly.altitudeLo != null && poly.altitudeLo !== "") ||
    (poly.altitudeHi != null && poly.altitudeHi !== "")
  ) {
    bits.push(`Alt ${poly.altitudeLo || "?"}–${poly.altitudeHi || "?"} (as published)`);
  }
  if (poly.severity) bits.push(`Severity ${poly.severity}`);
  bits.push("");
  bits.push(poly.raw || "(No narrative text from source)");
  if (el.wxDetailBody) el.wxDetailBody.textContent = bits.join("\n");
  el.wxDetail.hidden = false;
}

async function ensureWeatherLayers(opts = {}) {
  const fullscreen = document.body.classList.contains("chart-fullscreen");
  if (!fullscreen) {
    updateWeatherStatusLine();
    return;
  }

  const wantStorms = state.settings.showStormSystems === true;
  const wantLive = state.settings.showLiveThunderstorms === true;

  if (wantStorms) {
    try {
      const data = await loadStormSystemsAndSigmets({
        force: opts.forceStorms === true,
      });
      state.stormSystems = data;
      if (data.fromCache && navigator.onLine !== false) {
        void refreshStormSystemsInBackground().then((fresh) => {
          if (!fresh || !state.settings.showStormSystems) return;
          state.stormSystems = fresh;
          updateWeatherStatusLine();
          if (document.body.classList.contains("chart-fullscreen")) {
            renderChart();
          }
        });
      }
    } catch (e) {
      if (!state.stormSystems) {
        state.weatherStatus = `Storms+SIGMET unavailable`;
      }
    }
  }

  if (wantLive) {
    setLiveTsLoading(true);
    updateWeatherStatusLine();
    try {
      state.weatherStatus = "";
      if (!liveTsRefreshTimer) {
        liveTsRefreshTimer = setInterval(() => {
          if (
            !document.body.classList.contains("chart-fullscreen") ||
            !state.settings.showLiveThunderstorms ||
            navigator.onLine === false
          ) {
            return;
          }
          void ensureLiveRadarDetail({ force: true })
            .then((changed) => {
              updateWeatherStatusLine();
              if (changed) renderChart();
            })
            .catch(() => {});
        }, 10 * 60 * 1000);
      }
      await ensureLiveRadarDetail({ force: opts.forceLive === true });
    } catch {
      clearLiveRadarMemory();
      state.weatherStatus = "Live TS radar unavailable (online only)";
      stopLiveTsRefreshTimer();
    } finally {
      setLiveTsLoading(false);
    }
  } else {
    clearLiveRadarMemory();
    stopLiveTsRefreshTimer();
    setLiveTsLoading(false);
  }

  updateWeatherStatusLine();
  if (!opts.skipPaint) renderChart();
}

function paintChart(lite = false) {
  if (!el.chart) return;
  const showAny =
    state.settings.showEastTracks !== false ||
    state.settings.showWestTracks !== false;
  const fullscreen = document.body.classList.contains("chart-fullscreen");
  const gcIdle = fullscreen && routeIsIdleForGcPlan();
  const stormSystems =
    fullscreen && state.settings.showStormSystems === true
      ? pruneStormSystemsForPaint(state.stormSystems)
      : null;
  const liveRadar =
    fullscreen && state.settings.showLiveThunderstorms === true
      ? getLiveRadarMemory()
      : null;
  const gcPlan = gcIdle ? buildGcPlan() : null;
  const gcCompare =
    fullscreen && !gcIdle && state.settings.showVsGreatCircle === true
      ? buildVsGreatCircleCompare()
      : null;
  /** Provisional focus while picking GC airports (1 or 2 ends). */
  const gcFocusAirports = [];
  if (gcIdle) {
    const depAp = resolveGcAirport(state.gcDepIcao);
    const arrAp = resolveGcAirport(state.gcArrIcao);
    if (depAp) gcFocusAirports.push(depAp);
    if (arrAp && arrAp.icao !== depAp?.icao) gcFocusAirports.push(arrAp);
  }
  state.lastChartLayout = drawChart(el.chart, {
    route: state.route,
    natTracks: coloredNatTracks(),
    showNatTracks: showAny,
    showRwyLabels: state.settings.showRwyLabels !== false,
    showAirspace: state.settings.showAirspace !== false,
    bright: document.documentElement.classList.contains("theme-bright"),
    zoom: state.chartZoom,
    pan: state.chartPan,
    lite,
    gcPlan,
    gcCompare,
    gcFocusAirports,
    show747Airports: gcIdle,
    stormSystems,
    liveRadar,
  });
  // After layout settles, load/refresh radar for the new regional window
  if (
    fullscreen &&
    state.settings.showLiveThunderstorms &&
    !lite &&
    isRegionalWeatherView(
      state.lastChartLayout,
      state.lastChartLayout.width,
      state.lastChartLayout.height
    )
  ) {
    scheduleRadarReload();
  } else if (
    getLiveRadarMemory() &&
    (!fullscreen ||
      !state.settings.showLiveThunderstorms ||
      !isRegionalWeatherView(
        state.lastChartLayout,
        state.lastChartLayout.width,
        state.lastChartLayout.height
      ))
  ) {
    clearLiveRadarMemory();
  }
  paintOwnshipOnly();
}

/** Move / clear the GPS arrow without touching the base globe canvas. */
function paintOwnshipOnly() {
  if (!el.chartOwnship || !state.lastChartLayout) return;
  const bright = document.documentElement.classList.contains("theme-bright");
  paintOwnshipOverlay(el.chartOwnship, state.lastChartLayout, state.gps, bright);
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
  // Slightly longer settle so rapid pans don't thrash full redraws
  chartIdleTimer = window.setTimeout(() => {
    scheduleChartRender({ lite: false });
  }, 180);
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
  if (state.uiMode === "fly") {
    startGpsWatch();
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

/**
 * Coarse location is enough for Atlantic chart ownship (≈1 NM / cell-WiFi class).
 * enableHighAccuracy:true maps to iOS “Precise Location” and re-prompts more often.
 * maximumAge kept well under GPS_TIME_WARN_SEC so a cached fix does not look like clock skew.
 */
const GPS_WATCH_OPTS = {
  enableHighAccuracy: false,
  maximumAge: 5000,
  timeout: 20000,
};

/** ~3 kt — show/update coords only while essentially stopped */
const GPS_STATIONARY_MAX_MS = 1.5;
/** ~5 kt — hysteresis so the chip does not flicker */
const GPS_MOVING_MIN_MS = 2.5;
/** GPS vs ARP mismatch → amber present-position chip */
const GPS_INTEGRITY_WARN_NM = 4;
/**
 * Only treat ARP mismatch as a jam/spoof cue when the nearest field is
 * close enough that you could plausibly be on the airport (ramp / taxi).
 * Mid-ocean “nearest airport 420 NM” must not amber the GPS chip.
 */
const GPS_INTEGRITY_NEAR_FIELD_NM = 25;
/** GPS fix timestamp vs iPad clock → amber UTC letters (works while moving) */
const GPS_TIME_WARN_SEC = 10;

let gpsWasStationary = true;
let gpsCoordsCopiedTimer = 0;
/** @type {null | {icao:string,lat:number,lon:number}[]} */
let gpsIntegrityAirportsCache = null;

function integrityAirportList() {
  if (gpsIntegrityAirportsCache) return gpsIntegrityAirportsCache;
  const byIcao = new Map();
  for (const ap of diversionAirportsPlottable(RWY_LABEL_MIN_M)) {
    if (!ap?.icao || !Number.isFinite(ap.lat) || !Number.isFinite(ap.lon)) continue;
    byIcao.set(ap.icao, { icao: ap.icao, lat: ap.lat, lon: ap.lon });
  }
  for (const ap of airports747List()) {
    if (!ap?.icao || !Number.isFinite(ap.lat) || !Number.isFinite(ap.lon)) continue;
    if (!byIcao.has(ap.icao)) {
      byIcao.set(ap.icao, { icao: ap.icao, lat: ap.lat, lon: ap.lon });
    }
  }
  gpsIntegrityAirportsCache = [...byIcao.values()];
  return gpsIntegrityAirportsCache;
}

/** @returns {null | {icao:string,lat:number,lon:number,distanceNm:number}} */
function findNearestIntegrityAirport(lat, lon) {
  let best = null;
  let bestNm = Infinity;
  for (const ap of integrityAirportList()) {
    const nm = vincentyInverse(lat, lon, ap.lat, ap.lon).distanceNm;
    if (!Number.isFinite(nm)) continue;
    if (nm < bestNm) {
      bestNm = nm;
      best = { icao: ap.icao, lat: ap.lat, lon: ap.lon, distanceNm: nm };
    }
  }
  return best;
}

function isGpsStationary(gps) {
  if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lon)) return false;
  if (Number.isFinite(gps.speed)) {
    if (gps.speed <= GPS_STATIONARY_MAX_MS) {
      gpsWasStationary = true;
      return true;
    }
    if (gps.speed >= GPS_MOVING_MIN_MS) {
      gpsWasStationary = false;
      return false;
    }
    return gpsWasStationary;
  }
  // Wi‑Fi / cell fixes often omit speed — treat as stationary for the chip
  gpsWasStationary = true;
  return true;
}

function hideGpsCoordsChip() {
  state.gpsStationary = null;
  if (el.gpsIntegrity) el.gpsIntegrity.hidden = true;
  if (el.chartGpsCoords) {
    el.chartGpsCoords.hidden = true;
    el.chartGpsCoords.classList.remove("is-gps-warn", "is-copied");
  }
  if (el.gpsRefChip) {
    el.gpsRefChip.hidden = true;
    el.gpsRefChip.classList.remove("is-warn", "is-far");
  }
}

const UTC_CHIP_TITLE_OK = "Coordinated Universal Time";

function clearUtcTimeIntegrityWarn() {
  state.gpsTimeWarn = false;
  state.gpsTimeSkewSec = null;
  for (const label of [el.chartUtcLabel, el.natUtcLabel]) {
    if (!label) continue;
    label.classList.remove("is-utc-warn");
  }
  for (const chip of [el.chartUtcChip, el.natUtcChip]) {
    if (chip) chip.title = UTC_CHIP_TITLE_OK;
  }
}

/**
 * Compare GeolocationPosition.timestamp with the iPad clock.
 * Evaluated at fix receipt only (not on the 1 Hz clock tick) so age does not drift into a false warn.
 * Works while moving — only the UTC letters go amber.
 */
function updateUtcTimeIntegrityUi(fixTimestampMs, systemNowMs = Date.now()) {
  if (!Number.isFinite(fixTimestampMs)) {
    clearUtcTimeIntegrityWarn();
    return;
  }
  const skewSec = Math.abs(fixTimestampMs - systemNowMs) / 1000;
  state.gpsTimeSkewSec = skewSec;
  const warn = skewSec > GPS_TIME_WARN_SEC;
  state.gpsTimeWarn = warn;
  const tip = warn
    ? `GPS fix time differs from iPad clock by ${skewSec.toFixed(0)} s (threshold ${GPS_TIME_WARN_SEC} s) — check for jam/spoof or wrong system time`
    : UTC_CHIP_TITLE_OK;
  for (const label of [el.chartUtcLabel, el.natUtcLabel]) {
    if (!label) continue;
    label.classList.toggle("is-utc-warn", warn);
  }
  for (const chip of [el.chartUtcChip, el.natUtcChip]) {
    if (chip) chip.title = tip;
  }
}

function setGpsRefCodeLetters(icao) {
  if (!el.gpsRefIcao) return;
  const code = airportDisplayCode(icao).slice(0, 4);
  el.gpsRefIcao.innerHTML = code
    ? [...code].map((ch) => `<span class="icao-ch">${ch}</span>`).join("")
    : "";
}

function updateGpsIntegrityUi(gpsLat, gpsLon) {
  const nearest = findNearestIntegrityAirport(gpsLat, gpsLon);
  if (!nearest || !el.gpsRefChip) {
    if (el.gpsRefChip) el.gpsRefChip.hidden = true;
    el.chartGpsCoords?.classList.remove("is-gps-warn");
    return null;
  }

  const nearField = nearest.distanceNm <= GPS_INTEGRITY_NEAR_FIELD_NM;
  const mismatch =
    nearField && nearest.distanceNm > GPS_INTEGRITY_WARN_NM;
  const displayCode = airportDisplayCode(nearest.icao);

  setGpsRefCodeLetters(nearest.icao);
  if (el.gpsRefLat) el.gpsRefLat.textContent = formatCockpitLat(nearest.lat);
  if (el.gpsRefLon) el.gpsRefLon.textContent = formatCockpitLon(nearest.lon);
  if (el.gpsRefDelta) {
    el.gpsRefDelta.textContent =
      nearest.distanceNm < 10
        ? `${nearest.distanceNm.toFixed(1)} NM`
        : `${Math.round(nearest.distanceNm)} NM`;
  }

  el.gpsRefChip.hidden = false;
  el.gpsRefChip.classList.toggle("is-warn", mismatch);
  el.gpsRefChip.classList.toggle("is-far", !nearField);
  el.chartGpsCoords?.classList.toggle("is-gps-warn", mismatch);

  const short =
    lookupAirport747(nearest.icao)?.shortName ||
    DIVERSION_AIRPORTS.find((a) => a.icao === nearest.icao)?.name ||
    nearest.icao;
  const idLabel =
    displayCode !== nearest.icao
      ? `${displayCode}/${nearest.icao}`
      : nearest.icao;
  const tip = mismatch
    ? `GPS ${nearest.distanceNm.toFixed(1)} NM from ${idLabel} ARP (${short}) — check for jam/spoof`
    : nearField
      ? `${idLabel} ARP (${short}) · ${nearest.distanceNm.toFixed(1)} NM — GPS integrity OK`
      : `Nearest ${idLabel} (${short}) · ${Math.round(nearest.distanceNm)} NM — integrity warn only within ${GPS_INTEGRITY_NEAR_FIELD_NM} NM of a field`;
  el.gpsRefChip.title = tip;
  el.gpsRefChip.setAttribute(
    "aria-label",
    `${idLabel} airport reference, ${nearest.distanceNm.toFixed(1)} nautical miles`
  );
  if (el.chartGpsCoords) {
    el.chartGpsCoords.title = mismatch
      ? tip
      : "Present position (stationary). Tap to copy FMS coords for route paste and centre chart.";
  }

  return { ...nearest, nearField, mismatch, short, displayCode };
}

function updateGpsCoordsChip() {
  const gps = state.gps;
  if (!gps || !isGpsStationary(gps)) {
    hideGpsCoordsChip();
    return;
  }
  // Display: cockpit long-hand. Clipboard: glued FMS so route paste is one token.
  const latTxt = formatCockpitLat(gps.lat);
  const lonTxt = formatCockpitLon(gps.lon);
  const integrity = updateGpsIntegrityUi(gps.lat, gps.lon);
  state.gpsStationary = {
    lat: gps.lat,
    lon: gps.lon,
    latTxt,
    lonTxt,
    paste: formatFmsLatLon(gps.lat, gps.lon),
    integrity,
  };
  if (el.chartGpsLat) el.chartGpsLat.textContent = latTxt;
  if (el.chartGpsLon) el.chartGpsLon.textContent = lonTxt;
  if (el.chartGpsCoords) el.chartGpsCoords.hidden = false;
  if (el.gpsIntegrity) el.gpsIntegrity.hidden = false;
}

function centerChartOnLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const layout = state.lastChartLayout;
  let fitLat = layout?.fitLat0;
  let fitLon = layout?.fitLon0;
  if (!Number.isFinite(fitLat) || !Number.isFinite(fitLon)) {
    fitLat = 50;
    fitLon = -35;
  }
  let dLon = lon - fitLon;
  while (dLon > 180) dLon -= 360;
  while (dLon < -180) dLon += 360;
  state.chartPan = clampPan({
    dLat: lat - fitLat,
    dLon,
  });
  renderChart();
}

async function onGpsCoordsChipActivate() {
  const frozen = state.gpsStationary;
  if (!frozen) return;
  centerChartOnLatLon(frozen.lat, frozen.lon);
  try {
    await navigator.clipboard.writeText(frozen.paste);
    if (el.chartGpsCoords) {
      el.chartGpsCoords.classList.add("is-copied");
      if (!el.chartGpsCoords.classList.contains("is-gps-warn")) {
        el.chartGpsCoords.title = "Copied FMS string — paste into route entry";
      }
      clearTimeout(gpsCoordsCopiedTimer);
      gpsCoordsCopiedTimer = window.setTimeout(() => {
        el.chartGpsCoords?.classList.remove("is-copied");
        if (el.chartGpsCoords && state.gpsStationary?.integrity) {
          updateGpsIntegrityUi(state.gpsStationary.lat, state.gpsStationary.lon);
        } else if (el.chartGpsCoords) {
          el.chartGpsCoords.title =
            "Present position (stationary). Tap to copy FMS coords for route paste and centre chart.";
        }
      }, 1600);
    }
  } catch {
    /* clipboard may be blocked — chart still recentred */
  }
}

function onGpsRefChipActivate() {
  const ref = state.gpsStationary?.integrity;
  if (!ref || !Number.isFinite(ref.lat) || !Number.isFinite(ref.lon)) return;
  centerChartOnLatLon(ref.lat, ref.lon);
}

function refreshTotalsFromGps() {
  const cached = state.routeTotals;
  if (state.route.length && cached.key === routeSequenceKey(state.route)) {
    updateTotalsLine(cached.legsCount, cached.totalNm, cached.totalEteMin);
  } else {
    updateTotalsLine();
  }
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
        timestamp: pos.timestamp,
      };
      updateUtcTimeIntegrityUi(pos.timestamp);
      refreshTotalsFromGps();
      paintOwnshipOnly();
      updateGpsCoordsChip();
    },
    () => {
      /* permission denied / unavailable — clear ownship if it was showing */
      if (state.gps) {
        state.gps = null;
        refreshTotalsFromGps();
        paintOwnshipOnly();
      }
      hideGpsCoordsChip();
      clearUtcTimeIntegrityWarn();
    },
    GPS_WATCH_OPTS
  );
}

/** Start watch only if the browser already granted location (no new prompt). */
function startGpsWatchIfAlreadyGranted() {
  if (!navigator.geolocation || state.gpsWatchId != null) return;
  if (!navigator.permissions?.query) return;
  navigator.permissions
    .query({ name: "geolocation" })
    .then((result) => {
      if (result.state === "granted") startGpsWatch();
    })
    .catch(() => {
      /* Safari may reject query — wait for Fly mode */
    });
}

function clampChartZoom(z) {
  return Math.max(0.55, Math.min(5, z));
}

/** Allow panning the fit window over the whole globe (BA / JNB / Asia, etc.). */
function clampPan(pan) {
  let dLon = Number(pan.dLon) || 0;
  // Keep lon offset in a tidy range; layout still wraps absolute lon
  while (dLon > 180) dLon -= 360;
  while (dLon < -180) dLon += 360;
  return {
    dLat: Math.max(-140, Math.min(140, Number(pan.dLat) || 0)),
    dLon,
  };
}

function applyChartPanPixels(dx, dy) {
  if (!el.chart) return;
  const layout = state.lastChartLayout;
  const R = Math.max(
    48,
    layout?.radius ||
      Math.min(el.chart.clientWidth || 400, el.chart.clientHeight || 300) * 0.9
  );
  // Orthographic: vertical drag ≈ latitude; horizontal ≈ longitude / cos(lat)
  // Use view centre lat so east-west scale stays sensible in the south
  const lat0 = toRadSafe(layout?.lat0 ?? 50);
  const cosLat = Math.max(0.2, Math.abs(Math.cos(lat0)));
  const degPerPx = 180 / Math.PI / R;
  const dLat = dy * degPerPx;
  const dLon = -dx * degPerPx / cosLat;
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

/**
 * Snap chart to auto-fit after a route is loaded/replaced (not mid-route edits).
 * @param {number} prevLen
 * @param {"replace"|"restore"|"append"|"insert"|"edit"|string} mode
 */
function fitChartAfterRouteChange(prevLen, mode) {
  if (
    mode === "replace" ||
    mode === "restore" ||
    (prevLen === 0 && state.route.length > 0 && mode !== "edit")
  ) {
    resetChartView();
    state.gcViewKey = "";
  }
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
  let tapStartX = 0;
  let tapStartY = 0;
  let tapStartT = 0;
  let tapMoved = false;
  let mousePanMoved = false;
  let velX = 0;
  let velY = 0;
  let lastMoveT = 0;
  let momentumRaf = 0;

  const stopMomentum = () => {
    if (momentumRaf) {
      cancelAnimationFrame(momentumRaf);
      momentumRaf = 0;
    }
    velX = 0;
    velY = 0;
  };

  const notePanDelta = (dx, dy) => {
    const now = performance.now();
    const dt = Math.max(8, now - (lastMoveT || now));
    lastMoveT = now;
    // EMA velocity in px/frame-ish units
    const ax = dx * (16 / dt);
    const ay = dy * (16 / dt);
    velX = velX * 0.65 + ax * 0.35;
    velY = velY * 0.65 + ay * 0.35;
  };

  const startMomentum = () => {
    stopMomentum();
    if (Math.hypot(velX, velY) < 0.8) {
      velX = 0;
      velY = 0;
      return;
    }
    const tick = () => {
      velX *= 0.92;
      velY *= 0.92;
      if (Math.hypot(velX, velY) < 0.35) {
        momentumRaf = 0;
        velX = 0;
        velY = 0;
        scheduleChartRender({ lite: false });
        return;
      }
      applyChartPanPixels(velX, velY);
      momentumRaf = requestAnimationFrame(tick);
    };
    momentumRaf = requestAnimationFrame(tick);
  };

  const touchDist = (touches) => {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const tryAirportTap = (clientX, clientY) => {
    if (
      !document.body.classList.contains("chart-fullscreen") ||
      !routeIsIdleForGcPlan()
    ) {
      return;
    }
    const layout = state.lastChartLayout;
    if (!layout) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const ap = hitTestChartAirport(
      layout,
      x,
      y,
      layout.width || rect.width,
      layout.height || rect.height,
      30,
      true
    );
    if (ap) selectGcAirportFromTap(ap);
  };

  const tryWeatherTap = (clientX, clientY) => {
    if (!document.body.classList.contains("chart-fullscreen")) return false;
    if (
      !state.settings.showStormSystems &&
      !state.settings.showLiveThunderstorms
    ) {
      return false;
    }
    const layout = state.lastChartLayout;
    if (!layout) return false;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const poly = hitTestWeather(
      layout,
      x,
      y,
      state.settings.showStormSystems
        ? pruneStormSystemsForPaint(state.stormSystems)
        : null
    );
    if (!poly) {
      hideWxDetail();
      return false;
    }
    showWxDetail(poly);
    return true;
  };

  const tryChartTap = (clientX, clientY) => {
    if (tryWeatherTap(clientX, clientY)) return;
    tryAirportTap(clientX, clientY);
  };

  canvas.addEventListener(
    "touchstart",
    (e) => {
      stopMomentum();
      if (e.touches.length === 2) {
        panning = false;
        tapMoved = true;
        pinchStartDist = touchDist(e.touches);
        pinchStartZoom = state.chartZoom;
      } else if (e.touches.length === 1) {
        panning = true;
        tapMoved = false;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        lastMoveT = performance.now();
        velX = 0;
        velY = 0;
        tapStartX = lastX;
        tapStartY = lastY;
        tapStartT = lastMoveT;
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
        tapMoved = true;
        stopMomentum();
        const dist = touchDist(e.touches);
        state.chartZoom = clampChartZoom(pinchStartZoom * (dist / pinchStartDist));
        markChartInteracting();
        return;
      }
      if (e.touches.length === 1 && panning) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;
        if (Math.hypot(t.clientX - tapStartX, t.clientY - tapStartY) > 12) {
          tapMoved = true;
        }
        notePanDelta(dx, dy);
        applyChartPanPixels(dx, dy);
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
        const wasTap =
          !tapMoved &&
          performance.now() - tapStartT < 450 &&
          Math.hypot(lastX - tapStartX, lastY - tapStartY) <= 12;
        panning = false;
        if (wasTap) {
          stopMomentum();
          markChartInteracting();
          tryChartTap(tapStartX, tapStartY);
        } else if (tapMoved) {
          startMomentum();
        } else {
          markChartInteracting();
        }
      }
      if (e.touches.length === 1) {
        panning = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        lastMoveT = performance.now();
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stopMomentum();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      state.chartZoom = clampChartZoom(state.chartZoom * factor);
      markChartInteracting();
    },
    { passive: false }
  );

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    stopMomentum();
    panning = true;
    mousePanMoved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    lastMoveT = performance.now();
    velX = 0;
    velY = 0;
    tapStartX = lastX;
    tapStartY = lastY;
    tapStartT = lastMoveT;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    if (Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY) > 8) {
      mousePanMoved = true;
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    notePanDelta(dx, dy);
    applyChartPanPixels(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  });

  const endMousePan = (e) => {
    if (!panning) return;
    panning = false;
    canvas.style.cursor = "grab";
    const wasTap =
      !mousePanMoved &&
      performance.now() - tapStartT < 450 &&
      Math.hypot((e?.clientX ?? lastX) - tapStartX, (e?.clientY ?? lastY) - tapStartY) <= 8;
    if (wasTap) {
      stopMomentum();
      markChartInteracting();
      tryChartTap(tapStartX, tapStartY);
    } else if (mousePanMoved) {
      startMomentum();
    } else {
      markChartInteracting();
    }
  };
  window.addEventListener("mouseup", endMousePan);
}

function renderAll() {
  renderRouteList();
  renderLegs();
  syncGcPlanBar();
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
  const hadUnresolved = Boolean(
    state.teach?.slots?.some(
      (s) => s.type === "unknown" && (s.skipped || !s.point)
    )
  );
  if (!enriched.length) {
    state.teach = null;
    state.skippedUnknowns = hadUnresolved || state.skippedUnknowns;
    updateEntryChrome();
    return;
  }

  const prevLen = state.route.length;
  let fitMode = "append";

  if (commit?.kind === "edit") {
    if (enriched.length !== 1) {
      showError("When editing, enter a single waypoint (or Cancel, then paste a full route).");
      state.teach = null;
      return;
    }
    state.route[commit.editIndex] = enriched[0];
    state.editingIndex = null;
    fitMode = "edit";
  } else if (commit?.kind === "insert") {
    state.route.splice(commit.insertAt, 0, ...enriched);
    state.insertAfterIndex = null;
    fitMode = "insert";
  } else if (commit?.kind === "replace") {
    state.route = enriched;
    fitMode = "replace";
  } else if (commit?.kind === "teach-only") {
    // DB already updated via rememberManualWaypoint — refresh any route copies
    const p = enriched[0];
    const n = String(p.name || "").toUpperCase();
    state.route = state.route.map((wp) =>
      String(wp.name || "").toUpperCase() === n ? enrichPoint({ ...p }) : wp
    );
    fitMode = "edit";
  } else {
    state.route.push(...enriched);
    fitMode = "append";
  }

  fitChartAfterRouteChange(prevLen, fitMode);

  state.teach = null;
  state.editingIndex = null;
  state.insertAfterIndex = null;
  state.skippedUnknowns = hadUnresolved;
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
    accuracy: "learned",
    category: "manual",
    region: "user",
    notes: "Manually taught — overrides online lookup",
    source: "manual-teach",
  };
  const known = state.db.find(
    (w) => String(w.name || "").toUpperCase() === name
  );
  if (known) {
    known.lat = lat;
    known.lon = lon;
    known.accuracy = "learned";
    known.notes = entry.notes;
    known.category = "manual";
    known.source = "manual-teach";
    known.region = "user";
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

function isManualTaughtEntry(w) {
  if (!w) return false;
  return w.source === "manual-teach" || w.category === "manual";
}

/**
 * Force Transport Canada AIM Table 1.1 OEP coordinates into DB / learned / route.
 * Skips manual Teach entries. Removes bad OpenNav-learned OEP overrides (often 052°W).
 */
function applyAimOepCorrections() {
  let dbChanged = false;
  const byName = new Map(
    state.db.map((w) => [String(w.name || "").toUpperCase(), w])
  );
  for (const [name, aim] of Object.entries(AIM_OEP_TABLE_11)) {
    const notes = `Transport Canada AIM NAT Table 1.1 — ${aim.arinc}. Locked against OpenNav (often wrong 052°W). Educational — verify current AIM.`;
    const existing = byName.get(name);
    if (existing && isManualTaughtEntry(existing)) continue;
    if (!existing) {
      const entry = {
        id: name,
        name,
        lat: aim.lat,
        lon: aim.lon,
        accuracy: "exact",
        category: "oceanic_oep",
        region: "west",
        source: "tc-aim-nat-table-1.1",
        notes,
      };
      state.db.push(entry);
      byName.set(name, entry);
      dbChanged = true;
      continue;
    }
    if (
      existing.lat !== aim.lat ||
      existing.lon !== aim.lon ||
      existing.source !== "tc-aim-nat-table-1.1"
    ) {
      existing.lat = aim.lat;
      existing.lon = aim.lon;
      existing.accuracy = "exact";
      existing.category = "oceanic_oep";
      existing.region = "west";
      existing.source = "tc-aim-nat-table-1.1";
      existing.notes = notes;
      dbChanged = true;
    }
  }

  const learned = loadLearnedWaypoints();
  const nextLearned = [];
  let learnedChanged = false;
  for (const w of learned) {
    const name = String(w?.name || "").toUpperCase();
    if (isAimOepName(name) && !isManualTaughtEntry(w)) {
      // Drop OpenNav / online / stale learned OEPs — bundled AIM wins
      learnedChanged = true;
      continue;
    }
    nextLearned.push(w);
  }
  if (learnedChanged) saveLearnedWaypoints(nextLearned);

  let routeChanged = false;
  state.route = state.route.map((wp) => {
    const name = String(wp?.name || "").toUpperCase();
    const aim = AIM_OEP_TABLE_11[name];
    if (!aim) return wp;
    if (isManualTaughtEntry(wp)) return wp;
    if (wp.lat === aim.lat && wp.lon === aim.lon) return wp;
    routeChanged = true;
    return enrichPoint({
      ...wp,
      lat: aim.lat,
      lon: aim.lon,
      accuracy: "exact",
      source: "tc-aim-nat-table-1.1",
      notes: `Transport Canada AIM NAT Table 1.1 — ${aim.arinc}`,
    });
  });

  if (dbChanged || learnedChanged) refreshMarkdownWithLearned();
  if (routeChanged) saveRoute();
  return dbChanged || learnedChanged || routeChanged;
}

/** Current single name in the entry field (editing route WP or typing one token). */
function currentTeachCandidateName() {
  if (state.editingIndex != null && state.route[state.editingIndex]) {
    const fromRoute = String(state.route[state.editingIndex].name || "")
      .trim()
      .toUpperCase();
    const typed = String(el.input?.value || "")
      .trim()
      .toUpperCase();
    // Prefer typed name if user changed it to another single token
    if (typed && !/\s/.test(typed) && /^[A-Z0-9]{2,6}$/.test(typed)) return typed;
    if (fromRoute && /^[A-Z0-9]{2,6}$/.test(fromRoute)) return fromRoute;
  }
  const raw = String(el.input?.value || "").trim();
  if (!raw || /\s/.test(raw)) return "";
  const tok = raw.toUpperCase();
  if (/^[A-Z]{2,6}$/.test(tok) || /^[A-Z0-9]{2,6}$/.test(tok)) return tok;
  return "";
}

function shouldShowTeachButton() {
  if (state.teach) return false;
  if (state.editingIndex != null) return true;
  const name = currentTeachCandidateName();
  return Boolean(name);
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
  const correcting = Boolean(teach.correcting);
  if (el.teachTitle) {
    el.teachTitle.textContent = correcting
      ? "Teach / correct waypoint"
      : total > 1
        ? `Teach waypoint ${n} of ${total}`
        : "Teach waypoint";
  }
  if (el.teachProgress) {
    el.teachProgress.textContent = correcting
      ? "Enter chart coordinates to save or correct this fix (manual Teach overrides online lookup)"
      : total > 1
        ? `${n} of ${total} unrecognized — enter chart coordinates, then Save`
        : "Unrecognized name — enter chart coordinates, then Save";
  }
  if (el.teachName) el.teachName.textContent = cur.token;
  if (el.teachCoords) {
    el.teachCoords.value = cur.prefill || "";
  }
  if (el.teachSaveBtn) {
    el.teachSaveBtn.textContent =
      correcting || n >= total ? "Save & finish" : "Save";
  }
  showTeachError("");
  el.teachPanel.hidden = false;
  el.teachCoords?.focus();
}

/** Opt-in Teach / correct for one named fix (never auto-opened on paste). */
function openTeachForName(name, commit, prefill = "") {
  const token = String(name || "")
    .trim()
    .toUpperCase();
  if (!token) return;
  state.teach = {
    unknowns: [{ token, index: 0 }],
    cursor: 0,
    correcting: true,
    slots: [
      {
        type: "unknown",
        index: 0,
        token,
        point: null,
        skipped: false,
        prefill: prefill || "",
      },
    ],
    commit: commit || { kind: "append" },
  };
  // Stash prefill on unknown too for paintTeachStep
  state.teach.unknowns[0].prefill = prefill || "";
  showError("");
  paintTeachStep();
}

function startTeachFromButton() {
  if (state.teach) return;
  const name = currentTeachCandidateName();
  if (!name) {
    showError("Type or Edit a single named waypoint, then Teach.");
    return;
  }
  let prefill = "";
  let commit = { kind: "append" };
  if (state.editingIndex != null && state.route[state.editingIndex]) {
    const wp = state.route[state.editingIndex];
    prefill = formatCockpitLatLon(wp.lat, wp.lon);
    commit = { kind: "edit", editIndex: state.editingIndex };
  } else if (state.insertAfterIndex != null) {
    commit = { kind: "insert", insertAt: state.insertAfterIndex + 1 };
  } else {
    const existing = state.db.find(
      (w) => String(w.name || "").toUpperCase() === name
    );
    if (existing && Number.isFinite(existing.lat) && Number.isFinite(existing.lon)) {
      prefill = formatCockpitLatLon(existing.lat, existing.lon);
      // Correct existing DB fix; refresh any copies already on the route
      commit = { kind: "teach-only" };
    } else {
      // Brand-new name → after Save, add it to the route
      commit = { kind: "append" };
    }
  }
  openTeachForName(name, commit, prefill);
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
        "Could not read coordinates. Try N53 28.8 W005 30.0, N5328.8W00530.0, or ARINC 5215N / H5250."
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

function addWaypointFromInput() {
  void addWaypointFromInputAsync();
}

function teachableUnknowns(unknowns) {
  return (unknowns || []).filter((u) => {
    const tok = String(u?.token || "")
      .trim()
      .toUpperCase();
    if (!tok || u.airway || isAirwayToken(tok)) return false;
    return /^[A-Z0-9]{2,6}$/.test(tok);
  });
}

async function lookupWaypointOnline(name) {
  const q = String(name || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(q)) return null;
  try {
    const res = await fetch(
      `./api/lookup-waypoint?name=${encodeURIComponent(q)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Persist an OpenNav (or similar) online fix into learned DB + state.db. */
function absorbOnlineWaypoint(data) {
  const name = String(data?.name || "")
    .trim()
    .toUpperCase();
  if (!name || !Number.isFinite(data.lat) || !Number.isFinite(data.lon)) {
    return null;
  }
  const known = state.db.find(
    (w) => String(w.name || "").toUpperCase() === name
  );
  // AIM Table 1.1 OEPs / manual Teach: never accept OpenNav (often wrong 052°W)
  if (isAimOepName(name)) {
    if (known) return enrichPoint({ ...known });
    return null;
  }
  if (known) {
    if (isManualTaughtEntry(known)) return enrichPoint({ ...known });
    if (known.source !== "opennav-lookup" && known.source !== "online-lookup") {
      return enrichPoint({ ...known });
    }
  }
  const learnedExisting = loadLearnedWaypoints().find(
    (w) => String(w?.name || "").toUpperCase() === name
  );
  if (isManualTaughtEntry(learnedExisting)) {
    return enrichPoint({ ...learnedExisting });
  }

  const entry = {
    id: name,
    name,
    lat: data.lat,
    lon: data.lon,
    accuracy: data.accuracy || "approximate",
    category: "online-lookup",
    region: data.country || "lookup",
    notes:
      data.notes ||
      `Online lookup (${data.source || "OpenNav"}). Educational — verify AIP/NFDC.`,
    source: "opennav-lookup",
  };
  if (known) {
    known.lat = entry.lat;
    known.lon = entry.lon;
    known.accuracy = entry.accuracy;
    known.notes = entry.notes;
    known.category = entry.category;
    known.source = entry.source;
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

async function resolveUnknownsOnline(unknowns) {
  const list = teachableUnknowns(unknowns);
  const found = [];
  for (const u of list) {
    const hit = await lookupWaypointOnline(u.token);
    if (!hit) continue;
    const p = absorbOnlineWaypoint(hit);
    if (p) found.push(p);
  }
  return found;
}

function commitRoutePoints(points, { mode, skipped }) {
  const prevLen = state.route.length;
  const enriched = points.map((p) => enrichPoint({ ...p }));
  if (mode === "edit") {
    if (enriched.length !== 1) return false;
    state.route[state.editingIndex] = enriched[0];
    state.editingIndex = null;
  } else if (mode === "insert") {
    const at = state.insertAfterIndex + 1;
    state.route.splice(at, 0, ...enriched);
    state.insertAfterIndex = null;
  } else if (mode === "replace") {
    state.route = enriched;
  } else {
    state.route.push(...enriched);
  }
  state.skippedUnknowns = Boolean(skipped);
  fitChartAfterRouteChange(prevLen, mode);
  return true;
}

async function addWaypointFromInputAsync() {
  if (!el.input) return;
  if (state.teach) return; // wizard open
  const raw = el.input.value;
  // Empty Add / Enter is a no-op — the route panel already shows the empty state
  if (!String(raw || "").trim()) {
    showError("");
    return;
  }

  let result = parseRouteString(raw, state.db, state.airways);
  const tokenCount = result.tokens?.length || 0;
  const hasUnknowns = Boolean(result.unknowns?.length);
  const knownCount = result.points?.length || 0;

  // Multi-token paste (e.g. MPilot): load knowns now; quiet online lookup; no teach modal.
  if (!result.ok && hasUnknowns) {
    if (state.editingIndex != null && tokenCount !== 1) {
      showError(
        "When editing, enter a single waypoint (or Cancel, then paste a full route)."
      );
      return;
    }
    if (tokenCount > 1) {
      if (!knownCount && !teachableUnknowns(result.unknowns).length) {
        showError(
          "No known waypoints could be loaded from that paste (airways / unknown names skipped)."
        );
        return;
      }
      showError("");
      const wasEmpty = !state.route.length;
      const mode =
        state.insertAfterIndex != null
          ? "insert"
          : wasEmpty
            ? "replace"
            : "append";
      if (knownCount) {
        commitRoutePoints(result.points, { mode, skipped: true });
      } else {
        state.skippedUnknowns = true;
      }
      el.input.value = "";
      hideSuggestions();
      renderAll();

      // Grow DB quietly when online — never opens Teach; never overwrites manual Teach
      await resolveUnknownsOnline(result.unknowns);
      result = parseRouteString(raw, state.db, state.airways);
      if (result.points?.length) {
        commitRoutePoints(result.points, {
          mode: wasEmpty || mode === "replace" ? "replace" : mode,
          skipped: Boolean(
            !result.ok ||
              result.airwaySkipped?.length ||
              result.unknowns?.length
          ),
        });
      }
      renderAll();
      return;
    }
    // Single unknown: quiet online try; otherwise prompt to use Teach (no auto-wizard)
    const unk = result.unknowns[0]?.token;
    const hit = await lookupWaypointOnline(unk);
    if (hit) {
      const p = absorbOnlineWaypoint(hit);
      // Only use online result if it was newly accepted (or already known)
      if (p && String(p.name || "").toUpperCase() === String(unk || "").toUpperCase()) {
        // If absorb refused overwrite and returned bundled with different intent — check parse again
        const again = parseRouteString(unk, state.db, state.airways);
        if (again.ok && again.points[0]) {
          showError("");
          const pt = enrichPoint({ ...again.points[0] });
          const prevLen = state.route.length;
          if (state.editingIndex != null) {
            state.route[state.editingIndex] = pt;
            state.editingIndex = null;
          } else if (state.insertAfterIndex != null) {
            state.route.splice(state.insertAfterIndex + 1, 0, pt);
            state.insertAfterIndex = null;
          } else {
            state.route.push(pt);
            fitChartAfterRouteChange(prevLen, "append");
          }
          el.input.value = "";
          hideSuggestions();
          renderAll();
          return;
        }
      }
    }
    showError(
      `${unk || "Waypoint"} is not in the local database. Tap Teach to enter chart coordinates.`
    );
    updateEntryChrome();
    return;
  }

  if (!result.ok) {
    showError(result.error);
    return;
  }
  showError("");
  const points = result.points.map((p) => enrichPoint({ ...p }));
  const prevLen = state.route.length;

  if (state.editingIndex != null) {
    if (points.length !== 1) {
      showError(
        "When editing, enter a single waypoint (or Cancel, then paste a full route)."
      );
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
    state.skippedUnknowns = false;
    fitChartAfterRouteChange(prevLen, "replace");
  } else {
    state.route.push(...points);
    fitChartAfterRouteChange(prevLen, "append");
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

  if (el.settingsVersion) el.settingsVersion.textContent = `v${APP_VERSION}`;

  ensureRouteHintPlacement();
  loadSettings();
  loadRoute();
  loadStoredRoute();
  loadLastRouteSnapshot();
  updateRouteStoreButton();

  const cachedNat = loadCachedNatTracks();
  if (cachedNat) {
    state.nat = { ...cachedNat, fromCache: true };
  }

  const [wpRes, mdRes, watrsRes] = await Promise.all([
    fetch("data/waypoints.json"),
    fetch("docs/NAT_HLA_Waypoints_Reference.md"),
    fetch("data/watrs-airways.json").catch(() => null),
  ]);
  const wpData = await wpRes.json();
  state.db = wpData.waypoints || [];
  mergeDiversionAirportsIntoDb();
  merge747AirportsIntoDb();
  try {
    if (watrsRes && watrsRes.ok) {
      const watrs = await watrsRes.json();
      state.airways = airwaysMapFromPayload(watrs);
      mergeWatrsWaypointsIntoDb(watrs);
    }
  } catch {
    state.airways = Object.create(null);
  }
  mergeLearnedWaypointsIntoDb();
  applyAimOepCorrections();
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
  /* Avoid location prompt on every launch — only watch if already allowed, or on Fly */
  startGpsWatchIfAlreadyGranted();

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
  el.chartGpsCoords?.addEventListener("click", () => {
    void onGpsCoordsChipActivate();
  });
  el.gpsRefChip?.addEventListener("click", () => {
    onGpsRefChipActivate();
  });
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
  el.teachCancelBtn?.addEventListener("click", cancelTeachQueue);
  el.teachCoords?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTeachCurrent();
    }
  });
  el.input?.addEventListener("input", () => {
    renderSuggestions();
    updateEntryChrome();
  });
  el.teachBtn?.addEventListener("click", startTeachFromButton);
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

  el.clearBtn?.addEventListener("click", openRouteClearConfirm);
  el.routeClearConfirmCancel?.addEventListener("click", () => {
    if (el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  });
  el.routeClearConfirm?.addEventListener("click", (e) => {
    if (e.target === el.routeClearConfirm) el.routeClearConfirm.hidden = true;
  });
  el.routeClearEditsBtn?.addEventListener("click", clearEditsAction);
  el.routeClearAllBtn?.addEventListener("click", clearAllAction);
  el.routeRestoreLastBtn?.addEventListener("click", restoreLastRouteAction);

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

  el.icloudExportBtn?.addEventListener("click", () => {
    void exportLearnedToFiles();
  });
  el.icloudImportBtn?.addEventListener("click", () => {
    setIcloudSyncStatus("");
    el.icloudImportFile?.click();
  });
  el.icloudImportFile?.addEventListener("change", () => {
    const file = el.icloudImportFile?.files?.[0];
    if (el.icloudImportFile) el.icloudImportFile.value = "";
    if (file) void importLearnedFromFile(file);
  });

  if (el.natTracksBtn && el.natPanel) {
    el.natTracksBtn.addEventListener("click", () => openNatTracksPanel());
  }
  el.natClose?.addEventListener("click", () => {
    if (el.natPanel) el.natPanel.hidden = true;
  });
  el.natPanel?.addEventListener("click", (e) => {
    if (e.target === el.natPanel) el.natPanel.hidden = true;
  });
  el.natRefreshBtn?.addEventListener("click", () => {
    natLastAutoFetchMs = Date.now();
    refreshNatTracks();
  });

  const bindGcIcao = (input, which) => {
    if (!input) return;
    input.addEventListener("input", () => onGcIcaoInput(which, input.value));
    input.addEventListener("change", () => onGcIcaoInput(which, input.value));
    input.addEventListener("blur", () => onGcIcaoInput(which, input.value));
  };
  bindGcIcao(el.gcDep, "dep");
  bindGcIcao(el.gcArr, "arr");
  syncGcPlanBar();

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

  el.vsGreatCircleToggle?.addEventListener("change", () => {
    state.settings.showVsGreatCircle = !!el.vsGreatCircleToggle.checked;
    saveSettings();
    state.vsGcCache = null;
    syncChartRouteSummary();
    renderChart();
  });

  el.stormSystemsToggle?.addEventListener("change", () => {
    state.settings.showStormSystems = !!el.stormSystemsToggle.checked;
    saveSettings();
    if (!state.settings.showStormSystems) {
      hideWxDetail();
      updateWeatherStatusLine();
      renderChart();
      return;
    }
    void ensureWeatherLayers({ forceStorms: true });
  });
  el.liveTsToggle?.addEventListener("change", () => {
    state.settings.showLiveThunderstorms = !!el.liveTsToggle.checked;
    saveSettings();
    if (!state.settings.showLiveThunderstorms) {
      clearLiveRadarMemory();
      stopLiveTsRefreshTimer();
      setLiveTsLoading(false);
      hideWxDetail();
      updateWeatherStatusLine();
      renderChart();
      return;
    }
    void ensureWeatherLayers({ forceLive: true });
  });
  el.wxDetailClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    hideWxDetail();
  });
  el.wxDetail?.addEventListener("click", (e) => e.stopPropagation());
  window.addEventListener("online", () => {
    if (!document.body.classList.contains("chart-fullscreen")) return;
    void ensureWeatherLayers({ background: true });
  });

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
    natLastAutoFetchMs = Date.now();
    refreshNatTracks().catch(() => {});
  }
}

init().catch((err) => {
  showError(`Failed to load MyNatTrack: ${err.message}`);
  console.error(err);
});
