import {
  vincentyInverse,
  averageBearing,
  formatTrack,
  formatDistanceNm,
} from "./geodesy.js";
import { parseRouteString, suggestWaypoints } from "./parser.js";
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
} from "./natTracks.js";
import { ensureUnlocked } from "./auth.js";
import {
  diversionAirportsAlpha,
  runwayLabels,
} from "./diversionAirports.js";

const STORAGE_KEY = "mynattrack_route_v1";
const SETTINGS_KEY = "mynattrack_settings_v1";

const state = {
  db: [],
  meta: {},
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
  },
  mdText: "",
  nat: null,
  natLoading: false,
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
};

const el = {
  input: document.getElementById("wp-input"),
  suggest: document.getElementById("suggest"),
  addBtn: document.getElementById("add-btn"),
  clearBtn: document.getElementById("clear-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  routeHint: document.getElementById("route-hint"),
  routeList: document.getElementById("route-list"),
  legsBody: document.getElementById("legs-body"),
  totals: document.getElementById("totals"),
  chart: document.getElementById("chart"),
  banner: document.getElementById("verify-banner"),
  error: document.getElementById("error"),
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
  mdContent: document.getElementById("md-content"),
  settingsVerify: document.getElementById("settings-verify"),
  natTracksBtn: document.getElementById("nat-tracks-btn"),
  natPanel: document.getElementById("nat-panel"),
  natClose: document.getElementById("nat-close"),
  natRefreshBtn: document.getElementById("nat-refresh-btn"),
  showEastTracks: document.getElementById("show-east-tracks"),
  showWestTracks: document.getElementById("show-west-tracks"),
  natStatus: document.getElementById("nat-status"),
  natMessage: document.getElementById("nat-message"),
  themeBtn: document.getElementById("theme-btn"),
  chartFullscreenBtn: document.getElementById("chart-fullscreen-btn"),
  chartPanel: document.getElementById("chart-panel"),
};

const THEME_KEY = "mynattrack_theme_v1";

function loadThemePref() {
  try {
    return localStorage.getItem(THEME_KEY) === "bright" ? "bright" : "dim";
  } catch {
    return "dim";
  }
}

function applyTheme(mode) {
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
  renderChart();
}

function toggleTheme() {
  applyTheme(
    document.documentElement.classList.contains("theme-bright") ? "dim" : "bright"
  );
}

function setChartFullscreen(on) {
  document.body.classList.toggle("chart-fullscreen", on);
  if (el.chartFullscreenBtn) {
    el.chartFullscreenBtn.textContent = on ? "Exit full screen" : "Full screen";
    el.chartFullscreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
    el.chartFullscreenBtn.title = on ? "Exit full screen chart" : "Full screen chart";
  }
  // Allow layout to settle before redraw
  requestAnimationFrame(() => {
    requestAnimationFrame(() => renderChart());
  });
}

function toggleChartFullscreen() {
  setChartFullscreen(!document.body.classList.contains("chart-fullscreen"));
}

function showError(msg) {
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
  if (el.magToggle) el.magToggle.checked = state.settings.showMagnetic;
  if (state.settings.showAirspace !== false) state.settings.showAirspace = true;
  if (el.airspaceToggle) el.airspaceToggle.checked = state.settings.showAirspace !== false;
  if (state.settings.showRwyLabels !== false) state.settings.showRwyLabels = true;
  if (el.rwyLabelsToggle) el.rwyLabelsToggle.checked = state.settings.showRwyLabels !== false;
  if (el.showEastTracks) el.showEastTracks.checked = state.settings.showEastTracks;
  if (el.showWestTracks) el.showWestTracks.checked = state.settings.showWestTracks;
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

function saveRoute() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.route));
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

function updateEntryChrome() {
  const editing = state.editingIndex != null;
  const inserting = state.insertAfterIndex != null && !editing;
  el.addBtn.textContent = editing ? "Update" : inserting ? "Insert" : "Add";
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
  el.input.value = "";
  hideSuggestions();
  showError("");
  updateEntryChrome();
  renderRouteList();
}

function renderRouteList() {
  el.routeList.innerHTML = "";
  updateEntryChrome();
  if (!state.route.length) {
    el.routeList.innerHTML = `<li class="empty">No waypoints yet. Paste route example: SOMAX 5020N 4930N 4740N 43N050W SOORY — then tap Add.</li>`;
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
      <span class="coords">${fmtLatLon(wp.lat, wp.lon)}</span>
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

function fmtLatLon(lat, lon) {
  const latH = lat >= 0 ? "N" : "S";
  const lonH = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${latH} ${Math.abs(lon).toFixed(3)}°${lonH}`;
}

function renderLegs() {
  const { legs, totalNm } = computeLegs();
  el.legsBody.innerHTML = "";
  const showMag = state.settings.showMagnetic;

  document.getElementById("th-avg-mag").hidden = !showMag;
  document.getElementById("th-init-mag").hidden = !showMag;

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

  el.totals.textContent = state.route.length
    ? `${state.route.length} waypoints · ${legs.length} legs · ${formatDistanceNm(totalNm)} NM total`
    : "—";
}

function coloredNatTracks() {
  const showEast = state.settings.showEastTracks !== false;
  const showWest = state.settings.showWestTracks !== false;
  const tracks = state.nat?.tracks || [];
  return tracks
    .filter((t) => {
      const dir = t.direction || "unknown";
      if (dir === "east") return showEast;
      if (dir === "west") return showWest;
      if (dir === "both") return showEast || showWest;
      // Unknown direction: show if either toggle is on
      return showEast || showWest;
    })
    .map((t) => ({
      ...t,
      color: trackColor(t.id, t.direction),
    }));
}

function formatNatStatus(nat, extra = "") {
  if (!nat) return extra || "Not loaded";
  const when = nat.fetchedAt ? new Date(nat.fetchedAt).toLocaleString() : "unknown time";
  const src =
    nat.tmi
      ? `TMI ${nat.tmi}`
      : /vatsim/i.test(nat.source || "")
        ? "VATSIM"
        : "TMI —";
  const n = (nat.tracks || []).length;
  const cache = nat.fromCache ? " · cached" : "";
  const warn = nat.warning ? ` · ${nat.warning}` : "";
  return `${src} · ${n} tracks · ${when}${cache}${warn}${extra ? ` · ${extra}` : ""}`;
}

function renderNatPanel() {
  if (!el.natStatus || !el.natMessage) return;
  if (state.natLoading) {
    el.natStatus.textContent = "Loading…";
    return;
  }
  if (!state.nat) {
    el.natStatus.textContent = "Not loaded";
    el.natMessage.textContent = "No track message loaded yet. Tap Refresh.";
    return;
  }
  el.natStatus.textContent = formatNatStatus(state.nat);
  const summary = (state.nat.tracks || [])
    .map((t) => {
      const dir = t.direction !== "unknown" ? ` (${t.direction})` : "";
      const route = (t.points || []).map((p) => p.name).join(" ");
      return `${t.id}${dir}: ${route}`;
    })
    .join("\n");
  const body =
    (summary ? `Parsed tracks:\n${summary}\n\n────────\n\n` : "") +
    (state.nat.text || "");
  el.natMessage.textContent =
    "DISCLAIMER: This information may not be accurate. Educational / simulator use only — not certified for navigation.\n\n" +
    body;
}

function renderChart() {
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
  });
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
      const now = performance.now();
      // Throttle redraws; always allow first fix
      if (now - state.gpsLastDrawMs < 800 && state.gpsLastDrawMs > 0) return;
      state.gpsLastDrawMs = now;
      renderChart();
    },
    () => {
      /* permission denied / unavailable — keep chart without ownship */
      state.gps = null;
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
  renderChart();
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
        renderChart();
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
      if (e.touches.length === 0) panning = false;
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
      renderChart();
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
  };
  window.addEventListener("mouseup", endMousePan);
  canvas.addEventListener("mouseleave", () => {
    /* keep pan if button still down; mouseup on window clears */
  });
}

async function refreshNatTracks({ openPanel = false } = {}) {
  if (state.natLoading) return;
  state.natLoading = true;
  renderNatPanel();
  if (el.natRefreshBtn) el.natRefreshBtn.disabled = true;
  try {
    const result = await fetchNatTracks(state.db);
    if (!result.ok) {
      const cached = loadCachedNatTracks();
      if (cached) {
        state.nat = { ...cached, fromCache: true, warning: result.error };
      } else {
        state.nat = null;
        if (el.natMessage) el.natMessage.textContent = result.error;
        if (el.natStatus) el.natStatus.textContent = "Fetch failed";
      }
    } else {
      state.nat = result;
    }
    renderNatPanel();
    renderChart();
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

function addWaypointFromInput() {
  const raw = el.input.value;
  const result = parseRouteString(raw, state.db);
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
  el.suggest.hidden = true;
  el.suggest.innerHTML = "";
}

function renderSuggestions() {
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

  loadSettings();
  loadRoute();

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
  state.meta = wpData;
  state.mdText = await mdRes.text();

  const date = wpData.accuracyVerifiedOn || "2026-07-26";
  el.banner.textContent = `Waypoint accuracy last verified on ${date}`;
  el.settingsVerify.textContent = `Waypoint accuracy last verified on ${date}`;
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

  applyTheme(loadThemePref());

  // Load detailed Natural Earth land before first paint of globe
  await loadLandData();
  bindChartGestures();
  renderAll();
  renderNatPanel();
  startGpsWatch();

  if (el.themeBtn) {
    el.themeBtn.addEventListener("click", toggleTheme);
  }
  if (el.chartFullscreenBtn) {
    el.chartFullscreenBtn.addEventListener("click", toggleChartFullscreen);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("chart-fullscreen")) {
      setChartFullscreen(false);
    }
  });

  el.addBtn.addEventListener("click", addWaypointFromInput);
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWaypointFromInput();
    }
  });
  el.input.addEventListener("input", renderSuggestions);
  el.suggest.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-name]");
    if (!btn) return;
    el.input.value = btn.dataset.name;
    hideSuggestions();
    addWaypointFromInput();
  });
  el.input.addEventListener("blur", () => {
    // Allow suggestion button click to fire first
    setTimeout(() => {
      if (!el.suggest.contains(document.activeElement)) hideSuggestions();
    }, 150);
  });

  el.clearBtn.addEventListener("click", () => {
    if (state.editingIndex != null || state.insertAfterIndex != null) {
      cancelEditMode();
      return;
    }
    if (state.route.length && !confirm("Clear entire route?")) return;
    state.route = [];
    resetChartView();
    renderAll();
  });

  if (el.cancelEditBtn) {
    el.cancelEditBtn.addEventListener("click", cancelEditMode);
  }

  el.routeList.addEventListener("click", (e) => {
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

  el.magToggle.addEventListener("change", () => {
    state.settings.showMagnetic = el.magToggle.checked;
    saveSettings();
    renderLegs();
  });
  if (el.airspaceToggle) {
    el.airspaceToggle.addEventListener("change", () => {
      state.settings.showAirspace = el.airspaceToggle.checked;
      saveSettings();
      renderChart();
    });
  }
  if (el.rwyLabelsToggle) {
    el.rwyLabelsToggle.addEventListener("change", () => {
      state.settings.showRwyLabels = el.rwyLabelsToggle.checked;
      saveSettings();
      renderChart();
    });
  }

  el.settingsBtn.addEventListener("click", () => {
    el.settingsPanel.hidden = false;
  });
  el.settingsClose.addEventListener("click", () => {
    el.settingsPanel.hidden = true;
  });
  el.settingsPanel.addEventListener("click", (e) => {
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

  el.openMdBtn.addEventListener("click", () => {
    el.mdContent.innerHTML = simpleMarkdownToHtml(state.mdText);
    el.mdPanel.hidden = false;
  });
  el.mdClose.addEventListener("click", () => {
    el.mdPanel.hidden = true;
  });
  el.mdPanel.addEventListener("click", (e) => {
    if (e.target === el.mdPanel) el.mdPanel.hidden = true;
  });

  if (el.natTracksBtn) {
    el.natTracksBtn.addEventListener("click", () => {
      el.natPanel.hidden = false;
      renderNatPanel();
    });
  }
  if (el.natClose) {
    el.natClose.addEventListener("click", () => {
      el.natPanel.hidden = true;
    });
  }
  if (el.natPanel) {
    el.natPanel.addEventListener("click", (e) => {
      if (e.target === el.natPanel) el.natPanel.hidden = true;
    });
  }
  if (el.natRefreshBtn) {
    el.natRefreshBtn.addEventListener("click", () => refreshNatTracks());
  }
  const syncEastWestFromHeader = () => {
    state.settings.showEastTracks = !!el.showEastTracks?.checked;
    state.settings.showWestTracks = !!el.showWestTracks?.checked;
    saveSettings();
    renderChart();
  };

  if (el.showEastTracks) {
    el.showEastTracks.addEventListener("change", syncEastWestFromHeader);
  }
  if (el.showWestTracks) {
    el.showWestTracks.addEventListener("change", syncEastWestFromHeader);
  }

  window.addEventListener("resize", () => renderChart());

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
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
