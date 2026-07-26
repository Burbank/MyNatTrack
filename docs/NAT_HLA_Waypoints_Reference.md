# NAT HLA Named Oceanic Waypoints, Mid-Atlantic Airports/Navaids & Selected Land-Based Points

**Version: 2026-07-26-1158Z (Iteration 5)**  
**Reference compilation only – NOT for navigation**  

Cross-checked from OpenNav.com, national AIP ENR sections (UK NATS / Irish AirNav extracts), SkyVector, airport databases, and NAT track message examples (ICAO NAT Doc 007 / OPSGROUP references).  
**Always verify with current official AIPs, NOTAMs, and certified FMS/nav database before flight.**

---

## 1. Named Oceanic Entry/Exit Points (OEPs) & Significant Oceanic Waypoints

These are the fixed named points commonly used as Oceanic Entry Points (OEPs), Exit Points, or landfall fixes on the Organised Track System (OTS) and random routes in NAT HLA.

### Eastern side (primarily Shanwick OCA / Shannon / Irish / UK boundary area, often on or near 015°W)

| Waypoint | Latitude          | Longitude         | Notes / Source Consistency                  |
|----------|-------------------|-------------------|---------------------------------------------|
| SOMAX    | 50°00'00" N      | 015°00'00" W     | Confirmed OpenNav (IE). Common eastbound exit / landfall. |
| MALOT    | 53°00'00" N      | 015°00'00" W     | Confirmed OpenNav (IE). Frequent OTS point. |
| DOGAL    | 54°00'00" N      | 015°00'00" W     | Confirmed OpenNav (UK). Frequent OTS point. |
| LIMRI    | 52°00'00" N      | 015°00'00" W     | Confirmed OpenNav (IE). Common landfall / OEP-related. |
| RESNO    | ~56°00' N        | ~015°00' W       | Frequently appears in westbound track messages (exact minutes vary by cycle; verify AIP). |
| PIKIL    | ~57°00' N        | ~015–020° W      | Common OEP in track messages.               |
| SUNOT    | ~58°00' N        | ~015–020° W      | Common OEP.                                 |
| ATSUR    | 50°00' N         | 014°00' W        | SOTA-related landfall (UK AIP examples).    |
| BEDRA    | ~49°00' N        | ~015°00' W       | Appears in southern tracks.                 |
| NASBA    | ~49°00' N        | ~013°00' W       | Landfall-related.                           |

### Western side (primarily Gander OCA / New York OCA boundary area)

| Waypoint | Latitude          | Longitude         | Notes / Source Consistency                  |
|----------|-------------------|-------------------|---------------------------------------------|
| SOORY    | 38°30'00" N      | 060°16'03.3" W   | Confirmed OpenNav (US). Used on southern tracks / random routes. |
| JOOPY    | ~48–49° N        | ~050–052° W      | Frequent eastbound exit / landfall in track messages. |
| HOIST    | Variable (examples ~39° N range in some older data) | Western | Appears as exit point; exact position cycle-dependent – verify. |
| ALLRY, TUDEP, SAXAN, NEEKO, etc. | Various whole/half-degree | Western boundary | Common NAR / landfall fixes – consult current Canadian/US AIP or track message. |

**Note on coordinate-defined points**: Most points *on* the tracks themselves (e.g. 57N020W, 54/30) are pure latitude/longitude and are not named five-letter waypoints. They are defined simply as “57N 020W” etc.

---

## 2. Mid-Atlantic Airports (key diversion / ETOPS / technical stop candidates)

| ICAO  | Name / Location                  | Approximate Coordinates          | Elevation | Notes |
|-------|----------------------------------|----------------------------------|-----------|-------|
| LPAZ  | Santa Maria (Azores, Portugal)  | 36°58' N  025°10' W             | 308 ft   | Important technical / diversion airport. |
| LPLA  | Lajes / Terceira (Azores)       | 38°45.7' N  027°05.4' W         | 180 ft   | Joint civil-military; long runway (~10,860 ft). |
| TXKF  | L.F. Wade Intl (Bermuda)        | 32°21'51" N  064°40'43" W       | ~12 ft   | Primary Bermuda airport. |
| BIKF  | Keflavik (Iceland)              | ~63°59' N  022°36' W            | ~171 ft  | Northern diversion / technical. |
| CYYT  | St. John's (Newfoundland)       | ~47°37' N  052°45' W            | ~461 ft  | Eastern Canada diversion. |
| CYQX  | Gander (Newfoundland)           | ~48°56' N  054°34' W            | ~496 ft  | Historic / diversion. |
| EINN  | Shannon (Ireland)               | ~52°42' N  008°55' W            | ~46 ft   | Common eastbound technical / diversion. |

*(Coordinates rounded from SkyVector / airport database consensus; always check current AIP for exact ARP.)*

---

## 3. Selected Navigation Beacons / Navaids in the Region

- **Lajes area (LPLA)**: LM (Lajes VOR), TRM (TACAN), GP (NDB) – frequencies and exact positions in Portuguese AIP / SkyVector.
- **Santa Maria (LPAZ)**: Local VORs/NDBs published in Portuguese AIP.
- **Bermuda (TXKF)**: Local navaids (check Bermuda AIP / US sources).
- **Iceland / Greenland / Newfoundland**: Multiple VORs and NDBs supporting Blue Spruce routes and northern random routes (e.g., around Keflavik, Narsarsuaq, Goose Bay). Exact data in respective national AIPs or certified databases.
- Many oceanic routes rely primarily on GNSS / IRS with HF / CPDLC rather than ground-based navaids once clear of land.

---

## 4. Selected Land-Based Waypoints (feeding into / exiting oceanic airspace)

These are domestic or FIR-boundary points commonly used in flight plans before/after the oceanic segment.  
**Note**: These points are generally within ATC radar coverage, so positional risk is lower than pure oceanic fixes. Coordinates sourced from OpenNav and UK/Irish AIP ENR 4.4 extracts.

### European / Irish / UK side (examples)

| Waypoint | Latitude          | Longitude         | Notes / Source                          |
|----------|-------------------|-------------------|-----------------------------------------|
| EVRIN    | 51°46'56" N      | 006°33'48" W     | Confirmed OpenNav + UK AIP ENR 4.4 + Irish AIP (FRA / Shannon FIR related). |
| LIMRI    | 52°00'00" N      | 015°00'00" W     | Confirmed OpenNav (IE). Common landfall. |
| ELSOX    | 51°00'00" N      | 014°00'00" W     | Confirmed OpenNav (IE) + UK AIP (SOTA landfall point). |
| DINIM    | 51°00'00" N      | 015°00'00" W     | Confirmed OpenNav (UK). Common OEP/landfall. |
| GISTI    | 53°00'00" N      | 014°00'00" W     | Confirmed OpenNav (IE). Common in eastbound track messages. |
| NETKI    | 55°00'00" N      | 014°00'00" W     | Confirmed OpenNav (UK). Common landfall. |
| KESIX    | 56°57'00" N      | 014°00'00" W     | Confirmed OpenNav (UK). Common landfall. |
| OSBOX    | 56°48'23" N      | 012°48'06" W     | Confirmed Irish AIP ENR 4.4 (Oceanic Landfall Point). |
| BEGID    | 56°30'00" N      | 014°00'00" W     | Confirmed OpenNav + Irish AIP (Oceanic Landfall Point). |
| SOVED    | 56°00'00" N      | 014°00'00" W     | Confirmed OpenNav + Irish AIP (Oceanic Landfall Point). |

Additional whole-degree or half-degree points near the Shannon / Shanwick boundary appear in the official ENR 4.4 tables.

### North American side examples

- NAR (North American Route) fixes linking to JOOPY, HOIST, ALLRY, etc.
- Domestic points in Gander, Moncton, Boston, New York FIR (published in FAA NASR / Fixes tool and Nav Canada data).

**Full authoritative lists**:  
- UK AIP ENR 4.4 (NATS eAIP)  
- Irish AIP ENR 4.4 (AirNav Ireland)  
- Canadian AIP / Nav Canada  
- FAA Fixes/Waypoints search tool & NASR subscription data

---

## Sources & Cross-Check Notes

1. **OpenNav.com** – Individual waypoint pages for SOMAX, MALOT, DOGAL, SOORY, EVRIN, LIMRI, ELSOX, DINIM, GISTI, NETKI, KESIX, BEGID, SOVED (exact DMS matches).
2. **UK AIP ENR 4.4** (aurora.nats.co.uk extracts) and **Irish AIP ENR 4.4** – EVRIN, ELSOX, OSBOX, BEGID, SOVED and many landfall points.
3. **SkyVector / airport reference sites** – LPLA, LPAZ, TXKF coordinates.
4. **NAT track message examples** (ICAO NAT Doc 007 editions and public displays) – confirm usage of the named OEPs and landfalls.
5. **FAA / Nav Canada public tools** – Western-side and NAR points.

**Recommendations for operational use**:
- Download current AIPs from official AIS sites (NATS UK, AirNav Ireland, Nav Canada, Portugal AIP, FAA).
- Use a certified navigation database (ARINC 424) in the aircraft.
- Cross-check daily NAT Track Message (TMI) for the specific OEPs in use that day.
- For random routes, plan waypoints at least every 10° longitude (and typically 5° latitude).

---

*File generated as a public-source reference compilation. Accuracy prioritised via multi-source cross-check of the primary named points. Update against latest AIRAC cycle before any operational reliance. Next iterations will carry dated/timed version numbers.*

---

## 5. ARINC 424 Waypoint Coding & Formatting (Summary)

ARINC 424 is the industry standard specification for navigation system databases used by Flight Management Systems (FMS). It defines how waypoints, fixes, navaids, airways, and procedures are coded and stored.

### Named 5-letter Waypoints
- Conventional named waypoints (e.g. **SOMAX**, **EVRIN**, **MALOT**, **GISTI**) are stored and entered exactly as the five-letter identifier.
- These are published in national AIPs (ENR 4.4) and loaded into the certified navigation database.

### Oceanic / Coordinate-Based Waypoints (ARINC 424 §7.2.5 shorthand)
For undesignated latitude/longitude points commonly used on oceanic tracks, a compact 5-character identifier is generated according to fixed rules:

- Latitude (always 2 digits) comes first.
- Only the last two digits of longitude are used.
- A single letter (N / E / S / W) indicates the hemisphere/quadrant **and** the position of that letter indicates whether longitude is ≥ 100°.

| Letter | Latitude | Longitude |
|--------|----------|-----------|
| N      | North    | West      |
| E      | North    | East      |
| S      | South    | East      |
| W      | South    | West      |

**Placement of the letter**:
- Letter in the **last** position → longitude < 100°
- Letter in the **third** position → longitude ≥ 100°

**Examples (whole-degree)**:
- 50°00'N 050°00'W → **5050N**
- 50°00'N 150°00'W → **50N50**
- 52°00'N 015°00'W → **5215N**
- 40°00'S 020°00'E → **4020S**

### Quick lookup (MyNatTrack entry formats)

| Entry | Meaning |
|-------|---------|
| `5215N` | 52°N 015°W (letter last → lon &lt; 100°) |
| `5050N` | 50°N 050°W |
| `50N50` | 50°N 150°W (letter 3rd → lon ≥ 100°) |
| `4020S` | 40°S 020°E |
| `H5250` | 52°30′N 050°W (NAT half-degree) |
| `N5050` | 50°30′N 050°W (classic N-prefix; prefer H when possible) |
| `N5000.0W05000.0` | Full FMS lat/lon |

### Half-Degree Waypoints in the NAT (important operational note)
The classic ARINC 424 §7.2.5 “N-prefix” format for half-degree points (e.g. **N5050** = 50°30'N 050°W) created frequent confusion with whole-degree points (**5050N**).  

Following ICAO NAT OPS Bulletins and national AICs (Canada, UK, Iceland), the recommended coding for half-degree grid points in the NAT is:

- **Hxxyy** where xx = degrees + 30' of North latitude, yy = degrees of West longitude  
  Example: **H5250** = 52°30'N 050°00'W

Many operators and database vendors now avoid the ambiguous N-prefix form for half-degree points.

### Full Latitude/Longitude Entry (recommended when in doubt)
Most FMS accept a 13-character (or similar) full coordinate entry with no spaces, e.g.:
- `N5000.0W05000.0` or `N50 00.0 W050 00.0` (format varies slightly by manufacturer)

Always cross-check the resulting track/distance against the Master Document / filed flight plan.

### Key References
- ARINC Specification 424 – *Navigation System Database* (proprietary; available from SAE/ARINC)
- ICAO NAT Doc 007 – *North Atlantic Operations and Airspace Manual* (the document you linked): https://skybrary.aero/sites/default/files/bookshelf/33863.pdf
- ICAO NAT OPS Bulletin on half-degree waypoints and database coding
- Public practical summary: https://code7700.com/arinc_424_shorthand.htm
- FAA / industry presentations on Skybrary regarding ARINC 424 oceanic waypoint ambiguity

**Operational recommendation for NAT HLA**: Prefer full lat/long entry or confirmed 5-letter named points over ambiguous shorthand whenever possible. Always verify the next waypoint, track, and distance independently.

<!-- LEARNED-NAT-START -->
## Learned from NAT track messages

Coordinate fixes absorbed from downloaded OTS track routings (approximate; educational only).

| Waypoint | Latitude | Longitude | Notes |
|----------|-------------------|-------------------|---------------------------------------------|
| 42/60 | 42.0000° N | 60.0000° W | Learned from NAT tracks message |
| 44/50 | 44.0000° N | 50.0000° W | Learned from NAT tracks message |
| 45/40 | 45.0000° N | 40.0000° W | Learned from NAT tracks message |
| 46/50 | 46.0000° N | 50.0000° W | Learned from NAT tracks message |
| 47/50 | 47.0000° N | 50.0000° W | Learned from NAT tracks message |
| 48/30 | 48.0000° N | 30.0000° W | Learned from NAT tracks message |
| 48/50 | 48.0000° N | 50.0000° W | Learned from NAT tracks message |
| 49/20 | 49.0000° N | 20.0000° W | Learned from NAT tracks message |
| 49/40 | 49.0000° N | 40.0000° W | Learned from NAT tracks message |
| 49/50 | 49.0000° N | 50.0000° W | Learned from NAT tracks message |
| 50/40 | 50.0000° N | 40.0000° W | Learned from NAT tracks message |
| 50/50 | 50.0000° N | 50.0000° W | Learned from NAT tracks message |
| 51/20 | 51.0000° N | 20.0000° W | Learned from NAT tracks message |
| 51/30 | 51.0000° N | 30.0000° W | Learned from NAT tracks message |
| 51/40 | 51.0000° N | 40.0000° W | Learned from NAT tracks message |
| 51/50 | 51.0000° N | 50.0000° W | Learned from NAT tracks message |
| 5130/50 | 51.5000° N | 50.0000° W | Learned from NAT tracks message |
| 52/20 | 52.0000° N | 20.0000° W | Learned from NAT tracks message |
| 52/30 | 52.0000° N | 30.0000° W | Learned from NAT tracks message |
| 52/40 | 52.0000° N | 40.0000° W | Learned from NAT tracks message |
| 52/50 | 52.0000° N | 50.0000° W | Learned from NAT tracks message |
| 5230/20 | 52.5000° N | 20.0000° W | Learned from NAT tracks message |
| 53/20 | 53.0000° N | 20.0000° W | Learned from NAT tracks message |
| 53/30 | 53.0000° N | 30.0000° W | Learned from NAT tracks message |
| 53/40 | 53.0000° N | 40.0000° W | Learned from NAT tracks message |
| 53/50 | 53.0000° N | 50.0000° W | Learned from NAT tracks message |
| 5330/30 | 53.5000° N | 30.0000° W | Learned from NAT tracks message |
| 5330/40 | 53.5000° N | 40.0000° W | Learned from NAT tracks message |
| 54/20 | 54.0000° N | 20.0000° W | Learned from NAT tracks message |
| 54/30 | 54.0000° N | 30.0000° W | Learned from NAT tracks message |
| 54/40 | 54.0000° N | 40.0000° W | Learned from NAT tracks message |
| 54/50 | 54.0000° N | 50.0000° W | Learned from NAT tracks message |
| 5430/50 | 54.5000° N | 50.0000° W | Learned from NAT tracks message |
| 55/20 | 55.0000° N | 20.0000° W | Learned from NAT tracks message |
| 55/30 | 55.0000° N | 30.0000° W | Learned from NAT tracks message |
| 55/40 | 55.0000° N | 40.0000° W | Learned from NAT tracks message |
| 55/50 | 55.0000° N | 50.0000° W | Learned from NAT tracks message |
| 56/20 | 56.0000° N | 20.0000° W | Learned from NAT tracks message |
| 56/30 | 56.0000° N | 30.0000° W | Learned from NAT tracks message |
| 56/40 | 56.0000° N | 40.0000° W | Learned from NAT tracks message |
| 56/50 | 56.0000° N | 50.0000° W | Learned from NAT tracks message |
| 5630/20 | 56.5000° N | 20.0000° W | Learned from NAT tracks message |
| 5630/40 | 56.5000° N | 40.0000° W | Learned from NAT tracks message |
| 57/20 | 57.0000° N | 20.0000° W | Learned from NAT tracks message |
| 57/30 | 57.0000° N | 30.0000° W | Learned from NAT tracks message |
| 57/40 | 57.0000° N | 40.0000° W | Learned from NAT tracks message |
| 57/50 | 57.0000° N | 50.0000° W | Learned from NAT tracks message |
| 5730/30 | 57.5000° N | 30.0000° W | Learned from NAT tracks message |
| 58/30 | 58.0000° N | 30.0000° W | Learned from NAT tracks message |

<!-- LEARNED-NAT-END -->
