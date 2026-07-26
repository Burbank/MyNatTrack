# MyNatTrack

iPad-landscape PWA for NAT HLA track / bearing / distance planning.

**Not certified for navigation.** Educational / simulator use only.

## Live site

GitHub Pages: after first push, open  
`https://burbank.github.io/MyNatTrack/`  
(password-gated; Home Screen install remembers unlock).

## Features

- Named oceanic / landfall waypoints + diversion airports from bundled reference DB
- FMC-style coordinate entry (`57N020W`, `N50W015`, `5040N01500W`, …)
- WGS-84 Vincenty initial track + distance (NM)
- Optional magnetic track (offline approximate magvar grid)
- Offline North Atlantic chart
- Settings: verification date, open Markdown reference, toggles
- Service worker: full offline after Home Screen install

## Run on Mac (for iPad install / update)

```bash
cd "/Users/DuniaMBP/Library/Mobile Documents/com~apple~CloudDocs/CURSOR_PROJECT_REPOS/MyNatTrack"
python3 serve.py
```

On the iPad (same Wi‑Fi): open the printed `http://<mac-lan-ip>:8765/` in Safari → Share → **Add to Home Screen**.

Then enable Airplane Mode and confirm the app still loads with waypoints, calc, chart, and Settings → Open reference.

## Update waypoint accuracy date

1. Edit `docs/NAT_HLA_Waypoints_Reference.md` and `data/waypoints.json`
2. Set `accuracyVerifiedOn` in JSON
3. Bump `CACHE` version string in `sw.js`
4. Reload once from the Mac URL on the iPad so the new cache installs
