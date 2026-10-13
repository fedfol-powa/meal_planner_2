# W9, seconda revisione di spec e piano: ultime correzioni

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w9-spec-piano-2.md`.
I dodici rilievi precedenti risultano risolti o quasi. Correggi gli **otto** rilievi
nuovi come propone il revisore, in particolare:

- rilievo 1: inizializzazione dello stack in `beforeAll`, e prova esplicita dei due
  comandi (suite normale senza `STACK_*`, script dello stack);
- rilievo 2: blocca anche la riga esistente (`FOR UPDATE`) nel rinnovo, e prendi gli
  stessi lucchetti (stesso ordine) in revoca e chiusura, con test rinnovo/revoca e
  rinnovo/chiusura;
- rilievi 4 e 5: validità del tentativo (pagina, link, identità) prima di `signIn` e
  della navigazione, come in `AuthorizePage`; blocco sincrono del doppio invio e link
  mostrato solo per il tentativo corrente;
- rilievo 6: prova con Auth reale che la password e il profilo della prima creazione
  restano;
- rilievi 3, 7 e 8 come indicato.

**Decisione del coordinatore sulla tua scelta:** confermato `internal` dopo un esito
ambiguo seguito da `GET 404`, con la formulazione «account non ancora osservabile» nella
spec e il test di ripresa del rilievo 6. Allinea anche l'elenco riepilogativo dei file
della spec.

Non ci sarà una terza revisione di spec e piano: le correzioni le verificherà la
revisione della PR. Fai commit, scrivi `STATO: SPEC_E_PIANO_CORRETTI` e aspetta il via
per l'implementazione.
