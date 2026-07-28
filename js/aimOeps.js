/**
 * Transport Canada AIM NAT — Table 1.1 OEPs and associated coordinates.
 * Source: AIM 2024-2 NAT (and prior AIM NAT Table 1.1). Educational — verify current AIM.
 * OpenNav CA often lists these at 052°W with shifted latitudes — do not prefer OpenNav for these names.
 */
export const AIM_OEP_TABLE_11 = {
  CUDDY: { lat: 58.0, lon: -50.0, arinc: "5800N05000W" },
  DORYY: { lat: 58.0, lon: -50.0, arinc: "5800N05000W" },
  ENNSO: { lat: 57.5, lon: -50.0, arinc: "5730N05000W" },
  HOIST: { lat: 57.0, lon: -50.0, arinc: "5700N05000W" },
  IRLOK: { lat: 56.5, lon: -50.0, arinc: "5630N05000W" },
  JANJO: { lat: 56.0, lon: -50.0, arinc: "5600N05000W" },
  KODIK: { lat: 55.5, lon: -50.0, arinc: "5530N05000W" },
  LOMSI: { lat: 55.0, lon: -50.0, arinc: "5500N05000W" },
  MELDI: { lat: 54.5, lon: -50.0, arinc: "5430N05000W" },
  NEEKO: { lat: 54.0, lon: -50.0, arinc: "5400N05000W" },
  PELTU: { lat: 53.5, lon: -50.0, arinc: "5330N05000W" },
  RIKAL: { lat: 53.0, lon: -50.0, arinc: "5300N05000W" },
  SAXAN: { lat: 52.5, lon: -50.0, arinc: "5230N05000W" },
  TUDEP: { lat: 52.0, lon: -50.0, arinc: "5200N05000W" },
  UMESI: { lat: 51.5, lon: -50.0, arinc: "5130N05000W" },
  ALLRY: { lat: 51.0, lon: -50.0, arinc: "5100N05000W" },
  BUDAR: { lat: 50.5, lon: -50.0, arinc: "5030N05000W" },
  ELSIR: { lat: 50.0, lon: -50.0, arinc: "5000N05000W" },
  IBERG: { lat: 49.5, lon: -50.0, arinc: "4930N05000W" },
  JOOPY: { lat: 49.0, lon: -50.0, arinc: "4900N05000W" },
  MUSAK: { lat: 48.5, lon: -50.0, arinc: "4830N05000W" },
  NICSO: { lat: 48.0, lon: -50.0, arinc: "4800N05000W" },
  OMSAT: { lat: 47.5, lon: -50.0, arinc: "4730N05000W" },
  PORTI: { lat: 47.0, lon: -50.0, arinc: "4700N05000W" },
  RELIC: { lat: 46.5, lon: -50.0, arinc: "4630N05000W" },
  SUPRY: { lat: 46.0, lon: -50.0, arinc: "4600N05000W" },
  RAFIN: { lat: 45.0, lon: -50.0, arinc: "4500N05000W" },
};

function aimOepEntry(name) {
  const key = String(name || "")
    .trim()
    .toUpperCase();
  return AIM_OEP_TABLE_11[key] || null;
}

export function isAimOepName(name) {
  return Boolean(aimOepEntry(name));
}
