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
