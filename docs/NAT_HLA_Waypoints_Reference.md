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


<!-- NAMED-SAMPLE-START -->
## Named waypoints added from sample list (2026-07-26)

Coordinates looked up from **OpenNav** (WATRS / US / UK) and **Transport Canada AIM NAT** OEP tables (050°W associations).  
**Educational / simulator only — verify current AIP / NFDC / AIM before any operational use.**

| Waypoint | Latitude | Longitude | Notes |
|----------|----------|-----------|-------|
| ALLRY | N51 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5100… / 050W family). Educ |
| ANVER | N35 15.1 | W065 41.3 | OpenNav BM ANVER (hemisphere corrected E→W for WATRS). Verify NFDC/AIP. |
| ATUGI | N35 38.3 | W071 31.6 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| BEXUM | N33 18.1 | W069 48.7 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| BOBTU | N44 07.0 | W052 49.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| BOKTO | N51 14.2 | W058 39.9 | OpenNav/CA lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| BOREX | N28 51.1 | W070 58.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| BOVIC | N34 52.4 | W066 40.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| BRKZZ | N27 19.2 | W064 57.7 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| BUDAR | N50 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5030… / 050W family). Educ |
| BUTUX | N18 00.0 | W045 22.8 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| CHEDR | N22 02.8 | W066 00.6 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| CITRS | N18 00.0 | W059 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| CRUPE | N22 02.6 | W066 03.7 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| CUDDY | N58 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5800… / 050W family). Educ |
| DABAK | N18 00.0 | W051 19.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| DARUX | N36 09.6 | W069 27.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| DASER | N34 08.3 | W067 34.7 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| DAWIN | N20 32.3 | W062 27.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| DORYY | N58 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5800… / 050W family). Educ |
| DOVEY | N41 07.0 | W067 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| DRYED | N38 37.9 | W066 40.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| DUPOX | N27 56.5 | W068 32.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| ELSIR | N50 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5000… / 050W family). Educ |
| EMAKO | N31 23.8 | W068 14.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| ENAPI | N33 12.4 | W068 06.4 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| ENNSO | N57 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5730… / 050W family). Educ |
| ETIKI | N48 00.0 | W008 45.0 | OpenNav/UK lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| FIVZE | N25 00.0 | W060 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| GALVN | N30 09.5 | W072 26.9 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| GECAL | N29 25.5 | W065 25.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| GRAMN | N30 22.1 | W070 15.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| HANCY | N22 02.2 | W066 10.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| HOIST | N57 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5700… / 050W family). Educ |
| IBERG | N49 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4930… / 050W family). Educ |
| ILIDO | N28 14.7 | W074 07.4 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| IRLOK | N56 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5630… / 050W family). Educ |
| JAINS | N31 21.3 | W077 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| JANJO | N56 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5600… / 050W family). Educ |
| JEBBY | N43 04.3 | W057 52.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| JOBOC | N40 07.0 | W067 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| JOOPY | N49 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4900… / 050W family). Educ |
| KAYYT | N38 52.6 | W067 34.4 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| KEEKA | N22 05.8 | W065 08.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| KINCH | N21 37.3 | W067 11.9 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| KINER | N36 34.5 | W068 17.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| KODIK | N55 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5530… / 050W family). Educ |
| LAMER | N25 00.0 | W070 03.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| LETON | N25 00.0 | W071 59.6 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| LIBOR | N61 01.0 | W062 41.0 | Transport Canada AIM NAT Table 1.1 / OEP association (6101… / 050W family). Educ |
| LNHOM | N25 00.0 | W071 00.6 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| LOMSI | N55 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5500… / 050W family). Educ |
| LUCTI | N25 00.0 | W069 05.6 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| LUNKR | N35 20.2 | W066 23.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| MACOR | N22 13.8 | W067 19.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| MARIG | N38 19.7 | W070 03.6 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| MELDI | N54 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5430… / 050W family). Educ |
| MUNEY | N38 30.0 | W064 57.9 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| MUSAK | N48 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4830… / 050W family). Educ |
| NEEKO | N54 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5400… / 050W family). Educ |
| NETSS | N34 11.6 | W073 06.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| NICSO | N48 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4800… / 050W family). Educ |
| NIFTY | N60 58.0 | W058 00.0 | OpenNav CA (605800N/0580000W). Northern Gander-related OEP — verify AIM/AIP. |
| NOVOK | N42 22.9 | W061 12.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| NUBUS | N23 30.0 | W065 32.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| OKONU | N37 18.4 | W071 57.9 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| OMSAT | N47 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4730… / 050W family). Educ |
| ONGOT | N33 58.9 | W072 18.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| OOONN | N33 38.6 | W074 35.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| OPAUL | N21 51.4 | W063 50.8 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| PELTU | N53 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5330… / 050W family). Educ |
| PERDO | N33 41.2 | W071 02.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| PIREX | N29 22.5 | W064 19.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| PORTI | N47 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4700… / 050W family). Educ |
| PRCHA | N22 55.5 | W066 21.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| RABAL | N26 43.5 | W069 27.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| RAFIN | N45 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4500… / 050W family). Educ |
| RELIC | N46 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4630… / 050W family). Educ |
| RIKAL | N53 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5300… / 050W family). Educ |
| RKDIA | N21 00.0 | W060 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SAUCR | N34 43.5 | W072 22.9 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SAXAN | N52 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5230… / 050W family). Educ |
| SEAVR | N29 41.9 | W063 04.4 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SELIM | N38 30.0 | W062 40.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SEPAL | N47 00.0 | W008 45.0 | OpenNav/UK lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SHEIL | N29 54.6 | W066 42.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SKPPR | N35 45.5 | W070 26.9 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SLATN | N39 07.0 | W067 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SNAGY | N29 36.4 | W076 51.9 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| STERN | N34 58.1 | W072 20.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SUMRS | N28 42.7 | W076 33.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| SUPRY | N46 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (4600… / 050W family). Educ |
| TARMO | N23 30.0 | W063 03.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| TASNI | N30 54.0 | W069 13.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| TUBBS | N31 42.9 | W076 59.1 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| TUDEP | N52 00.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5200… / 050W family). Educ |
| UKOKA | N30 38.9 | W077 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| UMESI | N51 30.0 | W050 00.0 | Transport Canada AIM NAT Table 1.1 / OEP association (5130… / 050W family). Educ |
| VEGAA | N35 19.4 | W072 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| VESRA | N25 28.5 | W068 00.0 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| VINSO | N27 05.0 | W067 14.5 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| VIRST | N35 02.7 | W072 32.6 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| WHOOS | N31 56.0 | W076 59.3 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |
| ZZTOP | N33 50.0 | W073 35.2 | OpenNav/US lookup from NAT HLA named-waypoint sample list. Educational — verify  |

Still missing reliable public coordinates from the sample list (not added): BUNAV, ETILO, LUSEN, ORTAV, RADUN, ROBB, SAVIK, TOXIT, UMLER, VESMI.

<!-- NAMED-SAMPLE-END -->

<!-- LEARNED-NAT-START -->
## Learned from NAT track messages

Coordinate fixes absorbed from downloaded OTS track routings (approximate; educational only).

| Waypoint | Latitude | Longitude | Notes |
|----------|-------------------|-------------------|---------------------------------------------|
| 42/60 | N42 00.0 | W060 00.0 | Learned from NAT tracks message |
| 44/50 | N44 00.0 | W050 00.0 | Learned from NAT tracks message |
| 45/40 | N45 00.0 | W040 00.0 | Learned from NAT tracks message |
| 45/50 | N45 00.0 | W050 00.0 | Learned from NAT tracks message |
| 46/50 | N46 00.0 | W050 00.0 | Learned from NAT tracks message |
| 47/40 | N47 00.0 | W040 00.0 | Learned from NAT tracks message |
| 47/50 | N47 00.0 | W050 00.0 | Learned from NAT tracks message |
| 48/30 | N48 00.0 | W030 00.0 | Learned from NAT tracks message |
| 48/40 | N48 00.0 | W040 00.0 | Learned from NAT tracks message |
| 48/50 | N48 00.0 | W050 00.0 | Learned from NAT tracks message |
| 49/20 | N49 00.0 | W020 00.0 | Learned from NAT tracks message |
| 49/30 | N49 00.0 | W030 00.0 | Learned from NAT tracks message |
| 49/40 | N49 00.0 | W040 00.0 | Learned from NAT tracks message |
| 49/50 | N49 00.0 | W050 00.0 | Learned from NAT tracks message |
| 50/20 | N50 00.0 | W020 00.0 | Learned from NAT tracks message |
| 50/30 | N50 00.0 | W030 00.0 | Learned from NAT tracks message |
| 50/40 | N50 00.0 | W040 00.0 | Learned from NAT tracks message |
| 50/50 | N50 00.0 | W050 00.0 | Learned from NAT tracks message |
| 51/20 | N51 00.0 | W020 00.0 | Learned from NAT tracks message |
| 51/30 | N51 00.0 | W030 00.0 | Learned from NAT tracks message |
| 51/40 | N51 00.0 | W040 00.0 | Learned from NAT tracks message |
| 51/50 | N51 00.0 | W050 00.0 | Learned from NAT tracks message |
| 5130/50 | N51 30.0 | W050 00.0 | Learned from NAT tracks message |
| 52/20 | N52 00.0 | W020 00.0 | Learned from NAT tracks message |
| 52/30 | N52 00.0 | W030 00.0 | Learned from NAT tracks message |
| 52/40 | N52 00.0 | W040 00.0 | Learned from NAT tracks message |
| 52/50 | N52 00.0 | W050 00.0 | Learned from NAT tracks message |
| 5230/20 | N52 30.0 | W020 00.0 | Learned from NAT tracks message |
| 53/20 | N53 00.0 | W020 00.0 | Learned from NAT tracks message |
| 53/30 | N53 00.0 | W030 00.0 | Learned from NAT tracks message |
| 53/40 | N53 00.0 | W040 00.0 | Learned from NAT tracks message |
| 53/50 | N53 00.0 | W050 00.0 | Learned from NAT tracks message |
| 5330/30 | N53 30.0 | W030 00.0 | Learned from NAT tracks message |
| 5330/40 | N53 30.0 | W040 00.0 | Learned from NAT tracks message |
| 54/20 | N54 00.0 | W020 00.0 | Learned from NAT tracks message |
| 54/30 | N54 00.0 | W030 00.0 | Learned from NAT tracks message |
| 54/40 | N54 00.0 | W040 00.0 | Learned from NAT tracks message |
| 54/50 | N54 00.0 | W050 00.0 | Learned from NAT tracks message |
| 5430/50 | N54 30.0 | W050 00.0 | Learned from NAT tracks message |
| 55/20 | N55 00.0 | W020 00.0 | Learned from NAT tracks message |
| 55/30 | N55 00.0 | W030 00.0 | Learned from NAT tracks message |
| 55/40 | N55 00.0 | W040 00.0 | Learned from NAT tracks message |
| 55/50 | N55 00.0 | W050 00.0 | Learned from NAT tracks message |
| 56/20 | N56 00.0 | W020 00.0 | Learned from NAT tracks message |
| 56/30 | N56 00.0 | W030 00.0 | Learned from NAT tracks message |
| 56/40 | N56 00.0 | W040 00.0 | Learned from NAT tracks message |
| 56/50 | N56 00.0 | W050 00.0 | Learned from NAT tracks message |
| 5630/20 | N56 30.0 | W020 00.0 | Learned from NAT tracks message |
| 5630/40 | N56 30.0 | W040 00.0 | Learned from NAT tracks message |
| 57/20 | N57 00.0 | W020 00.0 | Learned from NAT tracks message |
| 57/30 | N57 00.0 | W030 00.0 | Learned from NAT tracks message |
| 57/40 | N57 00.0 | W040 00.0 | Learned from NAT tracks message |
| 57/50 | N57 00.0 | W050 00.0 | Learned from NAT tracks message |
| 5730/20 | N57 30.0 | W020 00.0 | Learned from NAT tracks message |
| 5730/30 | N57 30.0 | W030 00.0 | Learned from NAT tracks message |
| 58/20 | N58 00.0 | W020 00.0 | Learned from NAT tracks message |
| 58/30 | N58 00.0 | W030 00.0 | Learned from NAT tracks message |
| 58/40 | N58 00.0 | W040 00.0 | Learned from NAT tracks message |
| 59/20 | N59 00.0 | W020 00.0 | Learned from NAT tracks message |
| 59/30 | N59 00.0 | W030 00.0 | Learned from NAT tracks message |
| 59/40 | N59 00.0 | W040 00.0 | Learned from NAT tracks message |
| 60/20 | N60 00.0 | W020 00.0 | Learned from NAT tracks message |
| 60/30 | N60 00.0 | W030 00.0 | Learned from NAT tracks message |
| ONZIN | S85 00.0 | E000 00.0 | Learned from NAT tracks message |
| SOCCO | N21 07.0 | W063 03.7 | Learned from NAT tracks message |

<!-- LEARNED-NAT-END -->
