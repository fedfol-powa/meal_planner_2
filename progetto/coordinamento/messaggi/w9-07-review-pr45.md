# W9, revisione della PR #45: da correggere

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w9-pr45.md`.

Correggi i quattro rilievi, con i test che il revisore descrive (riproducili: devono
fallire sul codice attuale e passare dopo):

1. `closedAccounts`: l'eccezione vale solo per l'uscita in corso, non per sempre.
2. Validità del tentativo mantenuta anche attraverso `signIn` (identità estranea,
   abbandono della pagina anche tornando allo stesso link).
3. Fusi a scostamento (`+01:00`) → ripiego su `Europe/Rome`, con test dell'helper e di
   `family.create`.
4. `Referrer-Policy: no-referrer` anche per la shell servita dal service worker (policy
   nell'HTML o regola globale), verificata con il service worker attivo.

Dei rilievi minori che avevi rinviato, correggi anche quelli confermati e semplici:
- email malformata distinta da «Non è l'email di questo invito»;
- `password_too_long` come codice dichiarato nella spec;
- errore di rete dopo la creazione con un testo che non parli della password della
  prima volta;
- errore di una revoca precedente azzerato quando cambia l'invito;
- «Riprova» su «Troppi tentativi» al caricamento;
- foglio del nuovo invito: id nuovo quando cambiano email o ruoli, stesso id solo per
  un ritentativo identico.

Testi: «chi ti ha invitato», «curatore» e «amministratore» restano come sono.

Push sul branch della PR, aggiorna la descrizione (togli i rinvii risolti), poi
`STATO: PR_CORRETTA`.
