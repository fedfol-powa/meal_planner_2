#!/bin/zsh
# args: claude panes ... -- codex reviewer panes ...
# exits when a claude pane goes working->stopped, or a reviewer pane prints REVISORE_FINITO
cl=(); rv=(); mode=c
for a in "$@"; do if [[ $a == -- ]]; then mode=r; elif [[ $mode == c ]]; then cl+=$a; else rv+=$a; fi; done
typeset -A ww cnt
while true; do
  for p in $cl; do
    st=$(herdr pane get $p 2>/dev/null | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]; print(r.get("pane",r).get("agent_status"))' 2>/dev/null)
    if [[ "$st" == working ]]; then ww[$p]=1; cnt[$p]=0
    elif [[ -n "${ww[$p]}" ]]; then cnt[$p]=$(( ${cnt[$p]:-0}+1 )); (( cnt[$p] >= 2 )) && { echo "$p $st"; exit 0; }; fi
  done
  for p in $rv; do
    herdr pane read $p --source recent-unwrapped --lines 15 2>/dev/null | grep -q '^REVISORE_FINITO' && { echo "$p reviewer-finished"; exit 0; }
  done
  sleep 15
done
