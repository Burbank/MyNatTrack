#!/usr/bin/env python3
"""Local static server for MyNatTrack install / update on the LAN.

Also proxies FAA NAT track JSON at /api/nat-tracks (browser CORS workaround).
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

    def _proxy_nat_tracks(self) -> None:
        req = urllib.request.Request(
            FAA_NAT_JSON,
            headers={
                "Accept": "application/json,text/plain,*/*",
                "User-Agent": "MyNatTrack/1.0 (private educational; local proxy)",
                "Referer": "https://nms.aim.faa.gov/nat",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                data = json.loads(body.decode("utf-8"))
            if not isinstance(data, list):
                raise ValueError("FAA NAT JSON was not a list")
            payload = {
                "source": "FAA NMS (https://nms.aim.faa.gov/datanat/nat.json)",
                "parts": data,
            }
            out = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(out)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(out)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            msg = json.dumps({"error": str(exc), "source": "FAA NMS"}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(msg)


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
