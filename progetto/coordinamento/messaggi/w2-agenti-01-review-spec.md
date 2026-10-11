# W2 — rilievi della review di spec e piano del Collegamento degli agenti

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w2-agenti-spec-piano.md`
(commit `741d785`, verdetto «da rifare prima dell'esecuzione»). Leggilo tutto: vanno risolti
tutti i 10 rilievi. Restano ferme le decisioni già prese (grant di Supabase, revoca tramite le
sessioni, riautorizzazione come Supabase, poteri su Supabase Auth solo documentati, passi
remoti dell'utente).

## Decisioni del coordinatore

1. **Testi veritieri (rilievo 1).** Consenso e conferma di «Scollega», in italiano e inglese,
   dicono in modo semplice che l'agente agisce con il tuo account, che su Supabase Auth può
   anche cambiare la password e chiudere le tue sessioni, e che «Scollega» revoca
   l'autorizzazione e le sessioni di quell'agente, non eventuali accessi ottenuti in altro
   modo (per esempio con una password cambiata: in quel caso si cambia la password). Niente
   promesse di blocco totale; i test verificano la presenza di queste informazioni.
2. **«Ultimo uso» (rilievo 10).** Diventa **«Ultimo rinnovo dell'accesso»**, dal rinnovo
   della sessione, senza registrazioni aggiuntive, con una riga che spiega cosa misura.
   Registralo fra le decisioni da riportare (sezione 13): la voce «ultimo uso» della
   specifica è sostituita, non chiusa.
3. **CI (rilievo 6).** La modifica a `.github/workflows/ci.yml` per lo stack locale con OAuth
   attivo e il Worker è tua, minima e dichiarata nella PR; nessuna credenziale di
   produzione. Se rallenta troppo la CI (oltre qualche minuto in più), proponi un job
   separato ma obbligatorio.
4. **Confini delle PR (rilievo 7).** Scegli tu se una o due PR, purché ogni PR passi da sola
   tutti i controlli di `main`; contratto e gestori stanno nella stessa PR.

Rilievi 2, 3, 4, 5, 8, 9: correggi come propone il revisore.

Aggiorna spec e piano e chiudi con `STATO: SPEC_PIANO_PRONTI` come ultima riga: segue una
seconda review breve.
