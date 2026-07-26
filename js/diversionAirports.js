/**
 * Common NAT / North Atlantic diversion airports suitable for heavy jets.
 * Curated from typical ETOPS/en-route alternate plotting sets (OPSGROUP NAT notes,
 * classic NAT plotting charts). Filtered to airports with longest runway ≈ ≥ 8,000 ft
 * and routine widebody / heavy diversion use. Educational reference only — not a
 * dispatch suitability list (weather, NOTAM, RFFS, and hours must still be checked).
 *
 * `rwy` = designation of the longest runway (OurAirports / published AIP).
 * Chart shows the designation under the ICAO label when length ≥ 2500 m.
 *
 * Coordinates: approximate ARP / published airport reference points.
 */

/** @type {{ icao: string, name: string, lat: number, lon: number, rwyFt: number, rwyM: number, rwy: string }[]} */
export const DIVERSION_AIRPORTS = [
  // Eastern Canada / Labrador / Newfoundland
  { icao: "CYYR", name: "Goose Bay", lat: 53.3192, lon: -60.4258, rwyFt: 11046, rwyM: 3367, rwy: "08/26" },
  { icao: "CYQX", name: "Gander", lat: 48.9369, lon: -54.5681, rwyFt: 10200, rwyM: 3109, rwy: "03/21" },
  { icao: "CYJT", name: "Stephenville", lat: 48.5442, lon: -58.55, rwyFt: 10000, rwyM: 3048, rwy: "09/27" },
  { icao: "CYYT", name: "St. John's", lat: 47.6186, lon: -52.7519, rwyFt: 8502, rwyM: 2591, rwy: "10/28" },
  { icao: "CYDF", name: "Deer Lake", lat: 49.2108, lon: -57.3914, rwyFt: 8005, rwyM: 2440, rwy: "07/25" },
  { icao: "CYHZ", name: "Halifax", lat: 44.8808, lon: -63.5086, rwyFt: 10500, rwyM: 3200, rwy: "05/23" },
  { icao: "CYQM", name: "Moncton", lat: 46.1122, lon: -64.6786, rwyFt: 10001, rwyM: 3048, rwy: "06/24" },
  { icao: "CYFB", name: "Iqaluit", lat: 63.7564, lon: -68.5558, rwyFt: 8605, rwyM: 2623, rwy: "16/34" },
  { icao: "CYUL", name: "Montreal Trudeau", lat: 45.4706, lon: -73.7408, rwyFt: 11000, rwyM: 3353, rwy: "06L/24R" },

  // US Northeast (common NAT / ETOPS inland & coastal)
  { icao: "KBGR", name: "Bangor", lat: 44.8074, lon: -68.8281, rwyFt: 11440, rwyM: 3487, rwy: "15/33" },
  { icao: "KBOS", name: "Boston Logan", lat: 42.3656, lon: -71.0096, rwyFt: 10083, rwyM: 3073, rwy: "15R/33L" },
  { icao: "KJFK", name: "New York JFK", lat: 40.6399, lon: -73.7787, rwyFt: 14511, rwyM: 4423, rwy: "13R/31L" },
  { icao: "KEWR", name: "Newark", lat: 40.6925, lon: -74.1687, rwyFt: 11000, rwyM: 3353, rwy: "04L/22R" },
  { icao: "KIAD", name: "Washington Dulles", lat: 38.9445, lon: -77.4558, rwyFt: 11500, rwyM: 3505, rwy: "01C/19C" },

  // Greenland / Iceland corridor
  { icao: "BGSF", name: "Kangerlussuaq", lat: 67.0122, lon: -50.7116, rwyFt: 9219, rwyM: 2810, rwy: "09/27" },
  { icao: "BIKF", name: "Keflavik", lat: 63.985, lon: -22.6056, rwyFt: 10056, rwyM: 3065, rwy: "10/28" },

  // Mid-Atlantic islands
  { icao: "LPLA", name: "Lajes", lat: 38.7618, lon: -27.0908, rwyFt: 10870, rwyM: 3313, rwy: "15/33" },
  { icao: "LPAZ", name: "Santa Maria", lat: 36.9714, lon: -25.1706, rwyFt: 10000, rwyM: 3048, rwy: "18/36" },
  { icao: "LPPD", name: "Ponta Delgada", lat: 37.7412, lon: -25.6979, rwyFt: 8192, rwyM: 2497, rwy: "12/30" },
  { icao: "TXKF", name: "Bermuda", lat: 32.364, lon: -64.6787, rwyFt: 9705, rwyM: 2958, rwy: "12/30" },

  // Ireland / UK west coast
  { icao: "EINN", name: "Shannon", lat: 52.702, lon: -8.9248, rwyFt: 10495, rwyM: 3199, rwy: "06/24" },
  { icao: "EIDW", name: "Dublin", lat: 53.4213, lon: -6.2701, rwyFt: 10203, rwyM: 3110, rwy: "10L/28R" },
  { icao: "EGAA", name: "Belfast Aldergrove", lat: 54.6575, lon: -6.2158, rwyFt: 9121, rwyM: 2780, rwy: "07/25" },
  { icao: "EGPK", name: "Prestwick", lat: 55.5094, lon: -4.5867, rwyFt: 9800, rwyM: 2987, rwy: "12/30" },
  { icao: "EGPF", name: "Glasgow", lat: 55.8719, lon: -4.4331, rwyFt: 8730, rwyM: 2661, rwy: "05/23" },
  { icao: "EGPH", name: "Edinburgh", lat: 55.95, lon: -3.3725, rwyFt: 8392, rwyM: 2558, rwy: "06/24" },
  { icao: "EGCC", name: "Manchester", lat: 53.3537, lon: -2.275, rwyFt: 10007, rwyM: 3050, rwy: "05R/23L" },
  { icao: "EGLL", name: "London Heathrow", lat: 51.47, lon: -0.4543, rwyFt: 12799, rwyM: 3901, rwy: "09L/27R" },

  // Iberia / Europe inland fall-backs used on NAT when coastal below mins
  { icao: "LEST", name: "Santiago", lat: 42.8963, lon: -8.4151, rwyFt: 10499, rwyM: 3200, rwy: "17/35" },
  { icao: "LPPT", name: "Lisbon", lat: 38.7742, lon: -9.1342, rwyFt: 12500, rwyM: 3810, rwy: "02/20" },
  { icao: "LPPR", name: "Porto", lat: 41.2481, lon: -8.6814, rwyFt: 11417, rwyM: 3480, rwy: "17/35" },
  { icao: "EHAM", name: "Amsterdam", lat: 52.3086, lon: 4.7639, rwyFt: 12467, rwyM: 3800, rwy: "18R/36L" },
  { icao: "LFPG", name: "Paris CDG", lat: 49.0097, lon: 2.5479, rwyFt: 13829, rwyM: 4215, rwy: "08L/26R" },
  { icao: "EKCH", name: "Copenhagen", lat: 55.618, lon: 12.656, rwyFt: 11811, rwyM: 3600, rwy: "04L/22R" },
];

/** Minimum longest-runway length (m) to show the direction under the ICAO label. */
export const RWY_LABEL_MIN_M = 2500;
