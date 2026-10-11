# Brief W6: Ricettario e voti

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/ricettario` (da `origin/main`) · **Worktree:** `.worktrees/ricettario`
- **Area:** `recipes` (consultazione del ricettario, scheda ricetta, voti).
- **Specifica:** parte 1 («Le stelline», «Il ricettario», «Lingua e unità di misura»),
  sezioni 2, 8 (consultazione, proiezioni, versioni pubblicate: la gestione delle bozze
  tramite MCP è un'attività separata), 6 (solo scalatura e presentazione delle quantità
  nella scheda), 12, 13 per gli strumenti MCP di lettura e voto; più 1, 15, 16.

## Obiettivo

- Elenco del ricettario con filtri e ordinamenti del prototipo, sulle proiezioni.
- Scheda ricetta: versione pubblicata, porzioni scalate e unità della famiglia con il
  dominio di W4 (`domain/src/units/`), nella lingua dell'utente.
- Voti (stelline) per membro, media della famiglia, voto rifiutato offline (interfaccia
  decisa con W5); esclusioni se previste dalla sezione 8.
- Schermate Ricettario e scheda ricetta collegate ai dati veri.

## Vincoli dal coordinamento

- Il documento ricetta e le proiezioni sono di W3 (`domain/src/recipe/`): importali, non
  ridefinirli; se ti serve un cambiamento, `STATO: DOMANDA`.
- Dipendenze ammesse senza discussione: quelle già nel repository. Altre: proponile.
