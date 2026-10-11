#!/usr/bin/env python3
"""Wait for coordination events from herdr workers and Codex reviewers.

Panes are discovered from tab labels: "W..." are Claude workers, "R ..." are reviewers.

  attendi.py              wait; exits printing "<pane> <label> | <event>" when:
                          - a worker is stopped and its last STATO line was not acknowledged
                            (checked at start too, so a worker that stopped while nobody was
                            waiting is never lost);
                          - a worker goes from working to stopped (even without a STATO line);
                          - a worker shows an open multiple-choice question ("MENU: ...");
                          - a reviewer printed REVISORE_FINITO and it was not acknowledged.
  attendi.py --visto P    acknowledge the current STATO line (or REVISORE_FINITO) of pane P.
  attendi.py --stato      print every worker and reviewer with status and last event, then exit.
"""
import hashlib
import json
import os
import subprocess
import sys
import time

SEEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visti.txt")
POLL = 15


def herdr(*args):
    out = subprocess.run(["herdr", *args], capture_output=True, text=True).stdout
    return out


def panes():
    """Return [(pane_id, label, kind, agent_status)] for workers and reviewers."""
    tabs = json.loads(herdr("tab", "list", "--workspace", "w1"))["result"]["tabs"]
    labels = {t["tab_id"]: t["label"] for t in tabs}
    result = []
    for p in json.loads(herdr("pane", "list"))["result"]["panes"]:
        label = labels.get(p["tab_id"], "")
        if label.startswith("W"):
            kind = "worker"
        elif label.startswith("R "):
            kind = "reviewer"
        else:
            continue
        result.append((p["pane_id"], label, kind, p.get("agent_status")))
    return result


def last_event(pane, kind):
    text = herdr("pane", "read", pane, "--source", "recent-unwrapped", "--lines", "120")
    lines = [l.strip() for l in text.splitlines()]
    if kind == "reviewer":
        return "REVISORE_FINITO" if "REVISORE_FINITO" in lines else None
    # an open multiple-choice question (AskUserQuestion) waits for an answer like a STATO line
    if any("Enter to select" in l for l in lines[-6:]):
        start = max((i for i, l in enumerate(lines) if l.startswith("☐")), default=-1)
        question = next((l.lstrip("│ ").strip() for l in lines[start + 1:] if l.lstrip("│ ").strip()), "")
        return f"MENU: {question[:150]}"
    idx = [i for i, l in enumerate(lines) if l.startswith("STATO:")]
    if not idx:
        return None
    i = idx[-1]
    # the same STATO text (e.g. "STATO: DOMANDA") can close different messages:
    # a digest of the lines before it tells them apart
    digest = hashlib.sha1("\n".join(lines[max(0, i - 6):i]).encode()).hexdigest()[:8]
    return f"{lines[i]} #{digest}"


def seen():
    try:
        with open(SEEN) as f:
            return {l.rstrip("\n") for l in f if l.strip()}
    except FileNotFoundError:
        return set()


def key(pane, event):
    return f"{pane}\t{event}"


def acknowledge(pane):
    kind = next((k for p, _, k, _ in panes() if p == pane), "worker")
    event = last_event(pane, kind)
    if not event:
        print(f"{pane}: nessuno stato da segnare")
        return
    with open(SEEN, "a") as f:
        f.write(key(pane, event) + "\n")
    print(f"{pane}: visto «{event}»")


def status():
    acked = seen()
    for pane, label, kind, st in panes():
        event = last_event(pane, kind)
        mark = "" if not event else (" (visto)" if key(pane, event) in acked else " (DA GESTIRE)")
        print(f"{pane} {label} [{st}] {event or '-'}{mark}")


def wait():
    was_working = set()
    stopped_polls = {}
    while True:
        acked = seen()
        for pane, label, kind, st in panes():
            if kind == "worker" and st == "working":
                was_working.add(pane)
                stopped_polls[pane] = 0
                continue
            event = last_event(pane, kind)
            if event and key(pane, event) not in acked:
                print(f"{pane} {label} | {event}")
                return
            if kind == "worker" and pane in was_working:
                # two polls in a row, so a short pause between tool calls is not an event
                stopped_polls[pane] = stopped_polls.get(pane, 0) + 1
                if stopped_polls[pane] >= 2:
                    print(f"{pane} {label} | fermo ({st}) senza nuovo STATO")
                    return
        time.sleep(POLL)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--visto":
        acknowledge(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "--stato":
        status()
    else:
        wait()
