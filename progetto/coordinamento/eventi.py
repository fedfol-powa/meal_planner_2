#!/usr/bin/env python3
"""Continuous listener for coordination events, built on herdr's events.subscribe.

Run it once per coordinator session with Claude Code's Monitor tool: every stdout line is
an event to handle. It never exits on its own.

  - at start: every worker or reviewer with something not yet handled (as `attendi.py --stato`);
  - a worker becomes blocked (a menu or a permission prompt is open);
  - a worker stops (idle or done) after working: its last STATO line or menu, or
    "fermo senza nuovo STATO";
  - a reviewer prints REVISORE_FINITO.

Lines: "<pane> <label> | <event>". Handled events are acknowledged with
`attendi.py --visto <pane>` as before; panes are discovered from tab labels ("W...",
"R ...") and the subscription is renewed when panes are created or closed.
"""
import json
import os
import socket
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from attendi import key, last_event, panes, seen  # noqa: E402

STOPPED = {"idle", "done", "blocked"}
SETTLE = 2  # seconds for the screen to show the final message before reading it


def emit(line):
    print(line, flush=True)


def pending_at_start():
    acked = seen()
    for pane, label, kind, st in panes():
        event = last_event(pane, kind)
        if event and key(pane, event) not in acked and (kind == "reviewer" or st != "working"):
            emit(f"{pane} {label} | {event}")


def subscribe(known):
    sock = socket.socket(socket.AF_UNIX)
    sock.connect(os.environ["HERDR_SOCKET_PATH"])
    subs = [{"type": "pane.created"}, {"type": "pane.closed"}, {"type": "pane.agent_detected"}]
    for pane, (label, kind) in known.items():
        if kind == "worker":
            subs.append({"type": "pane.agent_status_changed", "pane_id": pane})
        else:
            subs.append({"type": "pane.output_matched", "pane_id": pane, "source": "recent_unwrapped",
                         "match": {"type": "regex", "value": r"^REVISORE_FINITO\s*$"}})
    req = {"id": "eventi", "method": "events.subscribe", "params": {"subscriptions": subs}}
    sock.sendall((json.dumps(req) + "\n").encode())
    return sock


def lines(sock):
    buf = b""
    while True:
        chunk = sock.recv(65536)
        if not chunk:
            return
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            if line.strip():
                yield json.loads(line)


def main():
    pending_at_start()
    status = {}  # last agent status seen per worker pane
    last_emitted = {}  # last event line printed per pane, to avoid repeats
    while True:
        known = {p: (label, kind) for p, label, kind, st in panes()}
        for p, label, kind, st in panes():
            status.setdefault(p, st)
        try:
            sock = subscribe(known)
            for msg in lines(sock):
                ev, data = msg.get("event"), msg.get("data") or {}
                if ev in ("pane.created", "pane.closed", "pane.agent_detected"):
                    break  # renew the subscription with the current panes
                pane = data.get("pane_id")
                if pane not in known:
                    continue
                label, kind = known[pane]
                if ev == "pane.output_matched":
                    event = "REVISORE_FINITO"
                    if key(pane, event) in seen():
                        continue  # already handled; herdr replays existing output on subscribe
                elif ev == "pane.agent_status_changed":
                    new, old = data.get("agent_status"), status.get(pane)
                    status[pane] = new
                    if new == "working":
                        last_emitted.pop(pane, None)
                    if new not in STOPPED or (new != "blocked" and old not in ("working", "blocked")):
                        continue
                    time.sleep(SETTLE)
                    event = last_event(pane, kind)
                    if new == "blocked" and not (event or "").startswith("MENU:"):
                        event = "BLOCCATO (permesso o domanda): leggi il pane"
                    elif not event or key(pane, event) in seen():
                        event = f"fermo ({new}) senza nuovo STATO"
                else:
                    continue
                line = f"{pane} {label} | {event}"
                if last_emitted.get(pane) != line:
                    last_emitted[pane] = line
                    emit(line)
            sock.close()
        except (OSError, ValueError) as e:
            emit(f"- eventi | connessione al socket persa ({e}), riprovo")
            time.sleep(5)


if __name__ == "__main__":
    main()
