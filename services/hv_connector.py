"""
PIK — Heroes' Veritas Connector
services/hv_connector.py

Polls the Heroes' Veritas REST API for completed sessions and
translates them into PIK progression events.

Architecture:
  HV (localhost:8000)  →  this connector  →  PIK API (localhost:8080)

The connector is stateless between runs (it tracks sent sessions
in a local SQLite table to avoid double-posting).

Usage:
    python3 services/hv_connector.py           # polls every 10s forever
    python3 services/hv_connector.py --once    # single poll pass then exit
    python3 services/hv_connector.py --dry-run # print what would be sent

Configuration (all via CLI env or HV_* env vars):
    HV_API_URL      Heroes' Veritas API base  (default: http://localhost:8000)
    PIK_API_URL     PIK API base              (default: http://localhost:8080)
    PIK_API_KEY     PIK source API key        (default: hv-demo-api-key-2025)
    POLL_INTERVAL   Seconds between polls     (default: 10)
"""

import json
import sys
import os
import time
import sqlite3
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone

# SSL context for Windows compatibility (avoids cert revocation check timeout)
SSL_CTX = ssl.create_default_context()
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────
HV_API_URL    = os.environ.get("HV_API_URL",    "http://localhost:8000")
PIK_API_URL   = os.environ.get("PIK_API_URL",   "https://pik-prd-production.up.railway.app")
PIK_API_KEY   = os.environ.get("PIK_API_KEY",   "hv-demo-api-key-2025")
PIK_SOURCE_ID = "src-heroes-veritas-01"
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "10"))

# Small local DB to track which sessions have already been forwarded
SENT_DB_PATH  = Path(__file__).parent.parent / "db" / "hv_connector_sent.db"

DRY_RUN  = "--dry-run" in sys.argv
RUN_ONCE = "--once"    in sys.argv


# ── Helpers ────────────────────────────────────────────────────

def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def log(msg: str):
    print(f"[{now()}]  {msg}")

def get_sent_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(SENT_DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sent_sessions "
        "(session_id TEXT PRIMARY KEY, sent_at TEXT)"
    )
    conn.commit()
    return conn

def already_sent(sent_conn: sqlite3.Connection, session_id: str) -> bool:
    row = sent_conn.execute(
        "SELECT session_id FROM sent_sessions WHERE session_id=?",
        (session_id,)
    ).fetchone()
    return row is not None

def mark_sent(sent_conn: sqlite3.Connection, session_id: str):
    sent_conn.execute(
        "INSERT OR IGNORE INTO sent_sessions(session_id,sent_at) VALUES(?,?)",
        (session_id, now())
    )
    sent_conn.commit()


# ── HV API calls ───────────────────────────────────────────────

def hv_get(path: str) -> dict | None:
    url = f"{HV_API_URL}{path}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"  HV fetch error ({url}): {e}")
        return None


# ── PIK API calls ───────────────────────────────────────────────

def pik_post(path: str, body: dict) -> dict | None:
    url  = f"{PIK_API_URL}{path}"
    data = json.dumps(body).encode()
    req  = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "Content-Type":  "application/json",
            "X-PIK-API-Key": PIK_API_KEY,
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        log(f"  PIK post error ({url}): HTTP {e.code} — {body_text}")
        return None
    except Exception as e:
        log(f"  PIK post error ({url}): {e}")
        return None


def pik_get(path: str) -> dict | None:
    url = f"{PIK_API_URL}{path}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"  PIK fetch error ({url}): {e}")
        return None


# ── Player → PIK root_id lookup ─────────────────────────────────
# The connector maps HV player_id to PIK root_id via a simple
# lookup against PIK users.  In production this would be a proper
# identity assertion; for POC we match on player_id stored in
# auth_handle or via a name lookup.

def resolve_root_id(player_id: str) -> str | None:
    """
    Returns the PIK root_id for a given HV player_id.
    Strategy (POC):
      1. Check if any PIK user has auth_handle == player_id
      2. If not found, return None (no link — event is skipped)
    """
    result = pik_get("/api/users")
    if not result or result.get("status") != "ok":
        return None

    for user in result.get("data", []):
        # auth_handle often matches player_id for demo users
        # In real integration: HV session would carry a PIK root_id directly
        root_id = user.get("root_id", "")
        # For demo: map known HV demo player IDs to our seeded roots
        if player_id in ("demo-player-001", "demo-player-002"):
            return "pik-root-demo-operator-001"
        if player_id in ("demo-player-003", "demo-player-004"):
            return "pik-root-demo-self-001"

    return None


# ── Boss damage tier → title mapping ───────────────────────────

def boss_pct_to_title(pct: float) -> str | None:
    if pct >= 100: return "title_veilbreaker_100"
    if pct >= 75:  return "title_veilbreaker_75"
    if pct >= 50:  return "title_veilbreaker_50"
    if pct >= 25:  return "title_veilbreaker_25"
    return None


# ── Core: translate one completed HV session into PIK events ───

def process_session(session: dict, sent_conn: sqlite3.Connection):
    session_id = session.get("session_id")
    state      = session.get("state")

    if state != "completed":
        return
    if already_sent(sent_conn, session_id):
        return

    log(f"  Processing completed session: {session_id}")

    players  = session.get("players", [])
    if not players:
        log(f"    No players in session — skipping")
        return

    difficulty   = session.get("difficulty", "normal")
    node_states  = session.get("node_states", {})
    nodes_done   = sum(1 for v in node_states.values() if v.get("status") == "completed")

    # Boss damage (from economy summary if present, else estimate from node)
    boss_damage_pct = 0.0
    econ = session.get("economy_summary", {})
    if econ:
        boss_damage_pct = float(econ.get("boss_damage_pct", 0))

    for player in players:
        player_id = player.get("player_id") or player.get("id")
        root_id   = resolve_root_id(player_id)

        if not root_id:
            log(f"    player {player_id}: no PIK root_id found — skipping")
            continue

        if DRY_RUN:
            log(f"    [DRY RUN] Would send session_completed for {player_id} → {root_id}")
            log(f"      difficulty={difficulty}, nodes={nodes_done}, boss_pct={boss_damage_pct}")
            continue

        # ── Event 1: session completed ──────────────────────
        resp = pik_post("/api/ingest", {
            "root_id":    root_id,
            "event_type": "progression.session_completed",
            "session_ref": session_id,
            "payload": {
                "difficulty":      difficulty,
                "nodes_completed": nodes_done,
                "boss_damage_pct": boss_damage_pct,
            }
        })
        if resp and resp.get("status") == "ok":
            changes = resp["data"].get("changes_applied", {})
            xp_total = (changes.get("session_xp", 0)
                        + changes.get("boss_bonus_xp", 0)
                        + changes.get("node_xp", 0))
            log(f"    player {player_id} → {root_id}  +{xp_total} Fate XP")
            if changes.get("level_up"):
                lvl = changes["level_up"]
                log(f"    ★ LEVEL UP  {lvl['from']} → {lvl['to']}")
        else:
            log(f"    session_completed ingest failed for {player_id}")

        # ── Event 2: boss title (if applicable) ────────────
        title_id = boss_pct_to_title(boss_damage_pct)
        if title_id:
            pik_post("/api/ingest", {
                "root_id":    root_id,
                "event_type": "progression.title_granted",
                "session_ref": session_id,
                "payload": {"title_id": title_id}
            })
            log(f"    Granted title: {title_id}")

        # ── Event 3: fate markers from node completion ──────
        for node_id, node_state in node_states.items():
            if node_state.get("status") == "completed":
                marker = f"node:{node_id}"
                pik_post("/api/ingest", {
                    "root_id":    root_id,
                    "event_type": "progression.fate_marker",
                    "session_ref": session_id,
                    "payload": {"marker": marker}
                })

    if not DRY_RUN:
        mark_sent(sent_conn, session_id)
        log(f"  Session {session_id} forwarded to PIK ✓")


# ── Poll loop ──────────────────────────────────────────────────

def poll_once(sent_conn: sqlite3.Connection):
    result = hv_get("/api/sessions")
    if not result:
        log("  Could not reach HV API — will retry")
        return

    sessions = result.get("data", [])
    completed = [s for s in sessions if s.get("state") == "completed"]
    unsent    = [s for s in completed if not already_sent(sent_conn, s.get("session_id",""))]

    if not unsent:
        return

    log(f"  Found {len(unsent)} new completed session(s)")
    for session in unsent:
        process_session(session, sent_conn)


def run():
    sent_conn = get_sent_conn()
    mode = "dry-run" if DRY_RUN else ("single pass" if RUN_ONCE else f"polling every {POLL_INTERVAL}s")
    print(f"\n  PIK — Heroes' Veritas Connector")
    print(f"  HV  API : {HV_API_URL}")
    print(f"  PIK API : {PIK_API_URL}")
    print(f"  Mode    : {mode}")
    print(f"  Press Ctrl+C to stop.\n")

    if RUN_ONCE or DRY_RUN:
        poll_once(sent_conn)
    else:
        while True:
            try:
                poll_once(sent_conn)
            except Exception as e:
                log(f"  Unhandled error in poll: {e}")
            time.sleep(POLL_INTERVAL)

    sent_conn.close()


if __name__ == "__main__":
    run()
