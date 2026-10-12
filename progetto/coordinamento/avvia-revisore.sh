#!/bin/zsh
# Avvia un revisore Codex in una tab herdr nuova.
# Uso: avvia-revisore.sh <etichetta> <worktree> <file-rapporto> <istruzioni>
set -e
label=$1; wt=$2; report=$3; task=$4
root=/Users/fedfol/Projects/meal_planner_2
model=${REVIEW_MODEL:-gpt-6-astra}
effort=${REVIEW_EFFORT:-high}
# percorsi assoluti: il comando gira dopo il cd nel worktree
report=${report:A}; wt=${wt:A}
prompt="Leggi $root/progetto/coordinamento/brief/revisore.md ed eseguilo. $task Il tuo ultimo messaggio deve essere il rapporto completo in Markdown (verrà salvato in $report): non scriverlo su file da solo."
pane=$(herdr tab create --workspace w1 --label "$label" --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
printf '%s' "$prompt" > "$report.prompt"
herdr pane run "$pane" "cd $wt && codex exec -m $model -c model_reasoning_effort=\"$effort\" -s workspace-write --add-dir $root/progetto/coordinamento -o $report - < $report.prompt; echo REVISORE_FINITO"
echo "$pane"
