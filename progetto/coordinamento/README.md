# Coordinamento

Cartella di lavoro del coordinatore: stato dei worker, brief, messaggi e revisioni.

- Il metodo del coordinatore (ripresa, avvio dei worker, revisioni, merge, rilasci) è nella
  skill `.claude/skills/coordinamento/` (`SKILL.md`, comandi herdr in `herdr.md`).
- Ruoli e proprietà dei file sono in `AGENTS.md`; i worker seguono `protocollo-worker.md`,
  i revisori `brief/revisore.md`.
- `registro.md`: stato corrente in cima («Stato corrente»), storia sotto.
- `brief/`: un brief per attività, più `revisore.md` e i brief comuni delle ondate.
- `messaggi/`: messaggi lunghi ai worker (rilievi, riepiloghi).
- `revisioni/`: rapporti dei revisori Codex (con il prompt in `.prompt`).
- Script (codice: li modifica un worker con un brief che li delega): `eventi.py`
  (ascoltatore degli eventi di herdr per il Monitor), `attendi.py` (stato dei pane,
  `--visto`, polling di ripiego), `avvia-revisore.sh` (avvia un revisore Codex in una tab).
