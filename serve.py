#!/usr/bin/env python3
"""Local static server for MyNatTrack install / update on the LAN.

Proxies NAT track JSON at /api/nat-tracks:
  1) FAA NMS (preferred — full NOTAM text + TMI)
  2) VATSIM natTrak (fallback when FAA is unreachable)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import socketserver
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler

FAA_NAT_JSON = "https://nms.aim.faa.gov/datanat/nat.json"
VATSIM_TRACKS = "https://nattrak.vatsim.net/api/tracks"


def _http_get_json(url: str, headers: dict[str, str], timeout: float = 30) -> object:
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
    return json.loads(body.decode("utf-8"))


class QuietHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **getattr(SimpleHTTPRequestHandler, "extensions_map", {}),
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".md": "text/markdown; charset=utf-8",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/api/nat-tracks", "/api/nat-tracks/"):
            self._proxy_nat_tracks()
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/api/learn-waypoints", "/api/learn-waypoints/"):
            self._learn_waypoints()
            return
        self.send_error(404, "Not found")

    def _send_json(self, status: int, payload: dict) -> None:
        out = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(out)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(out)

    def _proxy_nat_tracks(self) -> None:
        errors: list[str] = []

        # 1) FAA NMS
        try:
            data = _http_get_json(
                FAA_NAT_JSON,
                {
                    "Accept": "application/json,text/plain,*/*",
                    "User-Agent": "MyNatTrack/1.0 (private educational; local proxy)",
                    "Referer": "https://nms.aim.faa.gov/nat",
                },
            )
            if not isinstance(data, list):
                raise ValueError("FAA NAT JSON was not a list")
            self._send_json(
                200,
                {
                    "format": "faa",
                    "source": "FAA NMS (https://nms.aim.faa.gov/datanat/nat.json)",
                    "parts": data,
                },
            )
            return
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            ValueError,
            json.JSONDecodeError,
        ) as exc:
            errors.append(f"FAA: {exc}")

        # 2) VATSIM natTrak fallback
        try:
            data = _http_get_json(
                VATSIM_TRACKS,
                {
                    "Accept": "application/json",
                    "User-Agent": "MyNatTrack/1.0 (private educational; local proxy)",
                },
            )
            if not isinstance(data, list):
                raise ValueError("VATSIM tracks JSON was not a list")
            self._send_json(
                200,
                {
                    "format": "vatsim",
                    "source": "VATSIM natTrak (https://nattrak.vatsim.net/api/tracks)",
                    "vatsimTracks": data,
                },
            )
            return
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            ValueError,
            json.JSONDecodeError,
        ) as exc:
            errors.append(f"VATSIM: {exc}")

        self._send_json(
            502,
            {"error": "; ".join(errors) or "NAT fetch failed", "source": "proxy"},
        )

    def _learn_waypoints(self) -> None:
        """Merge learned NAT fixes into waypoints.json + reference markdown (local Mac only)."""
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"ok": False, "error": "invalid json"})
            return

        incoming = payload.get("waypoints") or []
        if not isinstance(incoming, list) or not incoming:
            self._send_json(200, {"ok": True, "added": 0})
            return

        verified = str(payload.get("accuracyVerifiedOn") or "").strip()
        root = os.path.dirname(os.path.abspath(__file__))
        wp_path = os.path.join(root, "data", "waypoints.json")
        md_path = os.path.join(root, "docs", "NAT_HLA_Waypoints_Reference.md")
        marker_start = "<!-- LEARNED-NAT-START -->"
        marker_end = "<!-- LEARNED-NAT-END -->"

        try:
            with open(wp_path, "r", encoding="utf-8") as f:
                wp_data = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            self._send_json(500, {"ok": False, "error": f"waypoints read: {exc}"})
            return

        existing = wp_data.get("waypoints") or []
        by_name = {
            str(w.get("name") or "").upper(): w
            for w in existing
            if isinstance(w, dict)
        }
        added = 0
        for item in incoming:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip().upper()
            try:
                lat = float(item.get("lat"))
                lon = float(item.get("lon"))
            except (TypeError, ValueError):
                continue
            if not name or name in by_name:
                continue
            entry = {
                "id": name,
                "name": name,
                "lat": lat,
                "lon": lon,
                "category": "nat-track",
                "region": "learned",
                "accuracy": "approximate",
                "notes": "Learned from NAT tracks message",
            }
            existing.append(entry)
            by_name[name] = entry
            added += 1

        if verified:
            wp_data["accuracyVerifiedOn"] = verified
        wp_data["waypoints"] = existing
        try:
            with open(wp_path, "w", encoding="utf-8") as f:
                json.dump(wp_data, f, indent=2, ensure_ascii=False)
                f.write("\n")
        except OSError as exc:
            self._send_json(500, {"ok": False, "error": f"waypoints write: {exc}"})
            return

        # Rebuild learned markdown section from all learned-category waypoints
        learned_rows = [
            w
            for w in existing
            if isinstance(w, dict)
            and (
                w.get("category") == "nat-track"
                or str(w.get("notes") or "").startswith("Learned from NAT")
            )
        ]
        learned_rows.sort(key=lambda w: str(w.get("name") or ""))
        md_rows = []
        for w in learned_rows:
            try:
                lat = float(w["lat"])
                lon = float(w["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            def _cockpit(abs_deg: float, hemi: str, deg_width: int) -> str:
                deg = int(abs_deg)
                minutes = round((abs_deg - deg) * 60 * 10) / 10
                if minutes >= 60:
                    deg += 1
                    minutes = 0.0
                whole = int(minutes)
                tenth = int(round((minutes - whole) * 10))
                return f"{hemi}{deg:0{deg_width}d} {whole:02d}.{tenth}"

            lat_txt = _cockpit(abs(lat), "N" if lat >= 0 else "S", 2)
            lon_txt = _cockpit(abs(lon), "E" if lon >= 0 else "W", 3)
            md_rows.append(
                f"| {w.get('name')} | {lat_txt} | {lon_txt} | "
                f"Learned from NAT tracks message |"
            )
        section = ""
        if md_rows:
            section = (
                f"{marker_start}\n"
                "## Learned from NAT track messages\n\n"
                "Coordinate fixes absorbed from downloaded OTS track routings "
                "(approximate; educational only).\n\n"
                "| Waypoint | Latitude | Longitude | Notes |\n"
                "|----------|-------------------|-------------------|---------------------------------------------|\n"
                + "\n".join(md_rows)
                + f"\n\n{marker_end}\n"
            )

        try:
            with open(md_path, "r", encoding="utf-8") as f:
                md_text = f.read()
            md_text = re.sub(
                rf"{re.escape(marker_start)}[\s\S]*?{re.escape(marker_end)}\n?",
                "",
                md_text,
            ).rstrip()
            if section:
                md_text = md_text + "\n\n" + section
            else:
                md_text = md_text + "\n"
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(md_text)
        except OSError as exc:
            self._send_json(
                200,
                {
                    "ok": True,
                    "added": added,
                    "markdownError": str(exc),
                    "accuracyVerifiedOn": verified or None,
                },
            )
            return

        self._send_json(
            200,
            {"ok": True, "added": added, "accuracyVerifiedOn": verified or None},
        )


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve MyNatTrack for iPad PWA install")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.host, args.port), QuietHandler) as httpd:
        ip = lan_ip()
        print("MyNatTrack local server")
        print(f"  Root: {root}")
        print(f"  Mac:  http://127.0.0.1:{args.port}/")
        print(f"  iPad: http://{ip}:{args.port}/")
        print(f"  NAT:  http://127.0.0.1:{args.port}/api/nat-tracks")
        print("Add to Home Screen from Safari after first load. Then works offline.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
