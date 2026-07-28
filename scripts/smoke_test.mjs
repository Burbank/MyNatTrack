/**
 * Node smoke test for geodesy + ARINC/parser (no browser).
 * Run: node scripts/smoke_test.mjs
 */
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { vincentyInverse, averageBearing, formatTrack } = await import(
  pathToFileURL(join(root, "js/geodesy.js")).href
);
const {
  parseWaypointInput,
  parseRouteString,
  parseWaypointsFromMarkdown,
  parseMdLatCell,
  parseMdLonCell,
  toArinc424,
  formatCockpitLatLon,
} = await import(pathToFileURL(join(root, "js/parser.js")).href);

const wp = JSON.parse(readFileSync(join(root, "data/waypoints.json"), "utf8"));
const db = wp.waypoints;

const somax = db.find((w) => w.name === "SOMAX");
const malot = db.find((w) => w.name === "MALOT");
const inv = vincentyInverse(somax.lat, somax.lon, malot.lat, malot.lon);
const avg = averageBearing(inv.initialBearing, inv.finalBearing);

console.log("SOMAX→MALOT", {
  nm: inv.distanceNm.toFixed(2),
  initTrue: formatTrack(inv.initialBearing),
  avgTrue: formatTrack(avg),
});

if (inv.distanceNm < 175 || inv.distanceNm > 185) {
  throw new Error(`Unexpected SOMAX→MALOT distance: ${inv.distanceNm}`);
}

function expect(label, raw, lat, lon) {
  const r = parseWaypointInput(raw, db);
  if (!r.ok) throw new Error(`${label}: parse failed — ${r.error}`);
  if (Math.abs(r.point.lat - lat) > 1e-6 || Math.abs(r.point.lon - lon) > 1e-6) {
    throw new Error(
      `${label}: got ${r.point.lat},${r.point.lon} expected ${lat},${lon}`
    );
  }
  console.log("OK", label, r.point.name, r.point.lat, r.point.lon);
}

// ARINC examples from reference MD
expect("5050N", "5050N", 50, -50);
expect("50N50", "50N50", 50, -150);
expect("5215N", "5215N", 52, -15);
expect("4020S", "4020S", -40, 20);
expect("H5250", "H5250", 52.5, -50);
expect("N5050", "N5050", 50.5, -50);

// Full FMS + named
expect("N5000.0W05000.0", "N5000.0W05000.0", 50, -50);
expect("SOMAX", "SOMAX", 50, -15);
expect("57N020W", "57N020W", 57, -20);

if (toArinc424(50, -50) !== "5050N") throw new Error("toArinc424 5050N");
if (toArinc424(50, -150) !== "50N50") throw new Error("toArinc424 50N50");
if (toArinc424(52.5, -50) !== "H5250") throw new Error("toArinc424 H5250");

const route = parseRouteString(
  "SOMAX 5020N 4930N 4740N 43N050W SOORY",
  db
);
if (!route.ok) throw new Error("route paste parse failed: " + route.error);
const expectRoute = [
  [50, -15],
  [50, -20],
  [49, -30],
  [47, -40],
  [43, -50],
  [38.5, -60.267583333],
];
if (route.points.length !== expectRoute.length) {
  throw new Error("route paste length mismatch");
}
route.points.forEach((p, i) => {
  const [lat, lon] = expectRoute[i];
  if (Math.abs(p.lat - lat) > 1e-6 || Math.abs(p.lon - lon) > 1e-6) {
    throw new Error(`route paste point ${i} ${p.name}: ${p.lat},${p.lon}`);
  }
});
console.log(
  "OK route paste",
  route.points.map((p) => p.name).join(" ")
);

if (wp.accuracyVerifiedOn !== "2026-07-28") {
  throw new Error("accuracyVerifiedOn mismatch");
}

const cockpit = formatCockpitLatLon(50, -15);
if (cockpit !== "N50 00.0 W015 00.0") {
  throw new Error(`cockpit format mismatch: ${cockpit}`);
}
const half = formatCockpitLatLon(52.5, -50);
if (half !== "N52 30.0 W050 00.0") {
  throw new Error(`cockpit half-degree mismatch: ${half}`);
}
const southCockpit = formatCockpitLatLon(-85, -20);
if (southCockpit !== "S85 00.0 W020 00.0") {
  throw new Error(`cockpit south mismatch: ${southCockpit}`);
}
expect("S8500.0W02000.0", "S8500.0W02000.0", -85, -20);
console.log("OK cockpit", cockpit, half, southCockpit);

const { project, globeLayout } = await import(
  pathToFileURL(join(root, "js/chart.js")).href
);
const southRoute = [
  { lat: 50, lon: -15 },
  { lat: -85, lon: -20 },
];
const layout = globeLayout(400, 300, southRoute, 1, { dLat: 0, dLon: 0 });
if (layout.lat0 >= 5) {
  throw new Error(
    `globeLayout lat0 stuck northern (${layout.lat0}); southern routes must re-centre`
  );
}
const southProj = project(-85, -20, 400, 300, layout);
if (!southProj.visible) {
  throw new Error("85S not visible after southern layout fit");
}
const northProj = project(50, -15, 400, 300, layout);
if (!northProj.visible) {
  throw new Error("50N not visible on mixed N/S layout");
}
console.log("OK southern plot", {
  lat0: layout.lat0.toFixed(1),
  lon0: layout.lon0.toFixed(1),
});

if (Math.abs(parseMdLatCell('N50 00.0') - 50) > 1e-9) {
  throw new Error("parseMdLatCell cockpit");
}
if (Math.abs(parseMdLonCell('W015 00.0') - -15) > 1e-9) {
  throw new Error("parseMdLonCell cockpit");
}
if (Math.abs(parseMdLatCell('50°00\'00" N') - 50) > 1e-9) {
  throw new Error("parseMdLatCell DMS");
}
if (Math.abs(parseMdLonCell('015°00\'00" W') - -15) > 1e-9) {
  throw new Error("parseMdLonCell DMS");
}
if (parseMdLatCell("~56°00' N") != null) {
  throw new Error("parseMdLatCell should reject ~");
}
const mdSample = `
| Waypoint | Latitude | Longitude | Notes |
|----------|----------|-----------|-------|
| SOMAX | 50°00'00" N | 015°00'00" W | bundled |
| ZZNEW | N40 00.0 | W030 00.0 | taught |
| SKIPME | ~48° N | ~050° W | approx |
`;
const imported = parseWaypointsFromMarkdown(mdSample);
if (imported.length !== 2) {
  throw new Error(`md import count ${imported.length}`);
}
if (imported[1].name !== "ZZNEW" || imported[1].lat !== 40 || imported[1].lon !== -30) {
  throw new Error("md import ZZNEW mismatch");
}
console.log("OK md import parse", imported.map((w) => w.name).join(" "));

console.log("smoke_test OK");
