/**
 * Common NAT / North Atlantic diversion airports suitable for heavy jets.
 * `runways` = all published runways ≥ 2500 m (longest first).
 * Educational reference only — not a dispatch suitability list.
 */

/** @typedef {{ rwy: string, rwyFt: number, rwyM: number }} DiversionRunway */
/** @typedef {{ icao: string, name: string, lat: number, lon: number, runways: DiversionRunway[] }} DiversionAirport */

/** @type {DiversionAirport[]} */
export const DIVERSION_AIRPORTS = [
  { icao: "CYYR", name: "Goose Bay", lat: 53.3192, lon: -60.4258, runways: [{ rwy: "08/26", rwyFt: 11046, rwyM: 3367 }, { rwy: "15/33", rwyFt: 9580, rwyM: 2920 }] },
  { icao: "CYQX", name: "Gander", lat: 48.9369, lon: -54.5681, runways: [{ rwy: "03/21", rwyFt: 10200, rwyM: 3109 }, { rwy: "13/31", rwyFt: 8900, rwyM: 2713 }] },
  { icao: "CYJT", name: "Stephenville", lat: 48.5442, lon: -58.55, runways: [{ rwy: "09/27", rwyFt: 10000, rwyM: 3048 }] },
  { icao: "CYYT", name: "St. John's", lat: 47.6186, lon: -52.7519, runways: [{ rwy: "10/28", rwyFt: 8502, rwyM: 2591 }] },
  { icao: "CYHZ", name: "Halifax", lat: 44.8808, lon: -63.5086, runways: [{ rwy: "05/23", rwyFt: 10500, rwyM: 3200 }] },
  { icao: "CYQM", name: "Moncton", lat: 46.1122, lon: -64.6786, runways: [{ rwy: "06/24", rwyFt: 10001, rwyM: 3048 }] },
  { icao: "CYFB", name: "Iqaluit", lat: 63.7564, lon: -68.5558, runways: [{ rwy: "16/34", rwyFt: 8605, rwyM: 2623 }] },
  { icao: "CYUL", name: "Montreal Trudeau", lat: 45.4706, lon: -73.7408, runways: [{ rwy: "06L/24R", rwyFt: 11000, rwyM: 3353 }, { rwy: "06R/24L", rwyFt: 9600, rwyM: 2926 }] },
  { icao: "KBGR", name: "Bangor", lat: 44.8074, lon: -68.8281, runways: [{ rwy: "15/33", rwyFt: 11440, rwyM: 3487 }] },
  { icao: "KBOS", name: "Boston Logan", lat: 42.3656, lon: -71.0096, runways: [{ rwy: "15R/33L", rwyFt: 10083, rwyM: 3073 }, { rwy: "04R/22L", rwyFt: 10006, rwyM: 3050 }] },
  { icao: "KJFK", name: "New York JFK", lat: 40.6399, lon: -73.7787, runways: [{ rwy: "13R/31L", rwyFt: 14511, rwyM: 4423 }, { rwy: "04L/22R", rwyFt: 12079, rwyM: 3682 }, { rwy: "13L/31R", rwyFt: 10000, rwyM: 3048 }, { rwy: "04R/22L", rwyFt: 8400, rwyM: 2560 }] },
  { icao: "KEWR", name: "Newark", lat: 40.6925, lon: -74.1687, runways: [{ rwy: "04L/22R", rwyFt: 11000, rwyM: 3353 }, { rwy: "04R/22L", rwyFt: 9999, rwyM: 3048 }] },
  { icao: "KIAD", name: "Washington Dulles", lat: 38.9445, lon: -77.4558, runways: [{ rwy: "01C/19C", rwyFt: 11500, rwyM: 3505 }, { rwy: "01R/19L", rwyFt: 11500, rwyM: 3505 }, { rwy: "12/30", rwyFt: 10501, rwyM: 3201 }, { rwy: "01L/19R", rwyFt: 9400, rwyM: 2865 }] },
  { icao: "BGSF", name: "Kangerlussuaq", lat: 67.0122, lon: -50.7116, runways: [{ rwy: "09/27", rwyFt: 9219, rwyM: 2810 }] },
  { icao: "BIKF", name: "Keflavik", lat: 63.985, lon: -22.6056, runways: [{ rwy: "10/28", rwyFt: 10056, rwyM: 3065 }, { rwy: "01/19", rwyFt: 10020, rwyM: 3054 }] },
  { icao: "LPLA", name: "Lajes", lat: 38.7618, lon: -27.0908, runways: [{ rwy: "15/33", rwyFt: 10870, rwyM: 3313 }] },
  { icao: "LPAZ", name: "Santa Maria", lat: 36.9714, lon: -25.1706, runways: [{ rwy: "18/36", rwyFt: 10000, rwyM: 3048 }] },
  { icao: "TXKF", name: "Bermuda", lat: 32.364, lon: -64.6787, runways: [{ rwy: "12/30", rwyFt: 9705, rwyM: 2958 }] },
  { icao: "EINN", name: "Shannon", lat: 52.702, lon: -8.9248, runways: [{ rwy: "06/24", rwyFt: 10495, rwyM: 3199 }] },
  { icao: "EIDW", name: "Dublin", lat: 53.4213, lon: -6.2701, runways: [{ rwy: "10L/28R", rwyFt: 10203, rwyM: 3110 }, { rwy: "10R/28L", rwyFt: 8652, rwyM: 2637 }] },
  { icao: "EGAA", name: "Belfast Aldergrove", lat: 54.6575, lon: -6.2158, runways: [{ rwy: "07/25", rwyFt: 9121, rwyM: 2780 }] },
  { icao: "EGPK", name: "Prestwick", lat: 55.5094, lon: -4.5867, runways: [{ rwy: "12/30", rwyFt: 9800, rwyM: 2987 }] },
  { icao: "EGPF", name: "Glasgow", lat: 55.8719, lon: -4.4331, runways: [{ rwy: "05/23", rwyFt: 8730, rwyM: 2661 }] },
  { icao: "EGPH", name: "Edinburgh", lat: 55.95, lon: -3.3725, runways: [{ rwy: "06/24", rwyFt: 8392, rwyM: 2558 }] },
  { icao: "EGCC", name: "Manchester", lat: 53.3537, lon: -2.275, runways: [{ rwy: "05R/23L", rwyFt: 10007, rwyM: 3050 }, { rwy: "05L/23R", rwyFt: 10000, rwyM: 3048 }] },
  { icao: "EGLL", name: "London Heathrow", lat: 51.47, lon: -0.4543, runways: [{ rwy: "09L/27R", rwyFt: 12799, rwyM: 3901 }, { rwy: "09R/27L", rwyFt: 12001, rwyM: 3658 }] },
  { icao: "LEST", name: "Santiago", lat: 42.8963, lon: -8.4151, runways: [{ rwy: "17/35", rwyFt: 10499, rwyM: 3200 }] },
  { icao: "LPPT", name: "Lisbon", lat: 38.7742, lon: -9.1342, runways: [{ rwy: "02/20", rwyFt: 12500, rwyM: 3810 }] },
  { icao: "LPPR", name: "Porto", lat: 41.2481, lon: -8.6814, runways: [{ rwy: "17/35", rwyFt: 11417, rwyM: 3480 }] },
  { icao: "EHAM", name: "Amsterdam", lat: 52.3086, lon: 4.7639, runways: [{ rwy: "18R/36L", rwyFt: 12467, rwyM: 3800 }, { rwy: "09/27", rwyFt: 11329, rwyM: 3453 }, { rwy: "06/24", rwyFt: 11283, rwyM: 3439 }, { rwy: "18L/36R", rwyFt: 11155, rwyM: 3400 }, { rwy: "18C/36C", rwyFt: 10826, rwyM: 3300 }] },
  { icao: "LFPG", name: "Paris CDG", lat: 49.0097, lon: 2.5479, runways: [{ rwy: "08L/26R", rwyFt: 13829, rwyM: 4215 }, { rwy: "09R/27L", rwyFt: 13780, rwyM: 4200 }, { rwy: "08R/26L", rwyFt: 8858, rwyM: 2700 }, { rwy: "09L/27R", rwyFt: 8858, rwyM: 2700 }] },
  { icao: "EKCH", name: "Copenhagen", lat: 55.618, lon: 12.656, runways: [{ rwy: "04L/22R", rwyFt: 11811, rwyM: 3600 }, { rwy: "04R/22L", rwyFt: 10827, rwyM: 3300 }, { rwy: "12/30", rwyFt: 9186, rwyM: 2800 }] },
];

/** Minimum runway length (m) for chart plot / SETREF listing. */
export const RWY_LABEL_MIN_M = 2500;

function hasRunwayAtLeast(ap, minM = RWY_LABEL_MIN_M) {
  return (ap.runways || []).some((r) => (r.rwyM || 0) >= minM);
}

/** Airports with at least one runway ≥ minM (chart + SETREF). */
export function diversionAirportsPlottable(minM = RWY_LABEL_MIN_M) {
  return DIVERSION_AIRPORTS.filter((ap) => hasRunwayAtLeast(ap, minM));
}

/** Airports with at least one runway ≥ minM, sorted A–Z by ICAO. */
export function diversionAirportsAlpha(minM = RWY_LABEL_MIN_M) {
  return diversionAirportsPlottable(minM).sort((a, b) =>
    a.icao.localeCompare(b.icao)
  );
}

/** Runway designations ≥ minM, longest first. */
export function runwayLabels(ap, minM = RWY_LABEL_MIN_M) {
  return (ap.runways || [])
    .filter((r) => (r.rwyM || 0) >= minM)
    .map((r) => r.rwy);
}
