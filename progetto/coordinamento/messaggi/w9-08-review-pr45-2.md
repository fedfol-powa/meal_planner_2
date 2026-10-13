# W9, seconda revisione della PR #45: due rilievi minori

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w9-pr45-2.md`.
Tutte le correzioni di `w9-07` sono verificate. Correggi i due rilievi minori:

1. Un'uscita **dopo** la notifica del proprio ingresso invalida definitivamente il
   tentativo (distinta dall'uscita iniziale di «Esci e continua»), con il test del
   revisore (in `/tmp/w9-pr45-2-49mk7u5f`, `--testNamePattern='review:'`).
2. OpenAPI: le operazioni con ruolo `public` dichiarano `security: []`, derivato dal
   ruolo; test sul documento generato (pubbliche senza autenticazione, le altre ancora
   protette).

Push, poi `STATO: PR_CORRETTA`.
