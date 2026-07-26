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

if (wp.accuracyVerifiedOn !== "2026-07-26") {
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
console.log("OK cockpit", cockpit, half);

console.log("smoke_test OK");
