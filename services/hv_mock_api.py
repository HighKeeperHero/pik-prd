"""
PIK — Mock Heroes' Veritas API
services/hv_mock_api.py

Simple mock server that simulates the HV game API.
Serves completed sessions that the hv_connector can poll and forward to PIK.

Usage:
    python3 services/hv_mock_api.py

Runs on http://localhost:8000
"""

import json
import uuid
import random
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone

# ── Generate mock sessions ──────────────────────────────────

def generate_sessions():
    """Create a set of mock completed sessions."""
    return [
        {
            "session_id": f"hv-session-{uuid.uuid4().hex[:8]}",
            "state": "completed",
            "difficulty": "hard",
            "players": [
                {"player_id": "demo-player-001", "display_name": "Player One"}
            ],
            "node_states": {
                "node-alpha": {"status": "completed"},
                "node-beta": {"status": "completed"},
                "node-gamma": {"status": "completed"},
                "node-delta": {"status": "completed"},
                "node-epsilon": {"status": "completed"},
            },
            "economy_summary": {
                "boss_damage_pct": 85.0
            },
            "completed_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "session_id": f"hv-session-{uuid.uuid4().hex[:8]}",
            "state": "completed",
            "difficulty": "normal",
            "players": [
                {"player_id": "demo-player-003", "display_name": "Player Three"}
            ],
            "node_states": {
                "node-alpha": {"status": "completed"},
                "node-beta": {"status": "completed"},
                "node-gamma": {"status": "completed"},
            },
            "economy_summary": {
                "boss_damage_pct": 40.0
            },
            "completed_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "session_id": f"hv-session-{uuid.uuid4().hex[:8]}",
            "state": "in_progress",
            "difficulty": "hard",
            "players": [
                {"player_id": "demo-player-002", "display_name": "Player Two"}
            ],
            "node_states": {},
            "economy_summary": {},
        },
    ]

# Generate once at startup
SESSIONS = generate_sessions()


class HVHandler(BaseHTTPRequestHandler):
    """Handle mock HV API requests."""

    def do_GET(self):
        if self.path == "/api/sessions":
            self.send_json(200, {"status": "ok", "data": SESSIONS})
        elif self.path.startswith("/api/sessions/"):
            session_id = self.path.split("/")[-1]
            session = next((s for s in SESSIONS if s["session_id"] == session_id), None)
            if session:
                self.send_json(200, {"status": "ok", "data": session})
            else:
                self.send_json(404, {"status": "error", "message": "Session not found"})
        elif self.path == "/api/health":
            self.send_json(200, {"status": "ok", "data": {"service": "heroes-veritas-mock", "healthy": True}})
        else:
            self.send_json(404, {"status": "error", "message": f"Not found: {self.path}"})

    def send_json(self, code, data):
        body = json.dumps(data, indent=2).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"  [HV] {args[0]}")


def run():
    port = 8000
    server = HTTPServer(("0.0.0.0", port), HVHandler)
    print(f"\n  Heroes' Veritas — Mock API")
    print(f"  Serving on http://localhost:{port}")
    print(f"  Sessions:  {len([s for s in SESSIONS if s['state'] == 'completed'])} completed, "
          f"{len([s for s in SESSIONS if s['state'] == 'in_progress'])} in-progress")
    print(f"  Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down.")
        server.shutdown()


if __name__ == "__main__":
    run()
