# W6 — rilievi della review di spec e piano della Messa in produzione

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w6-produzione-spec-piano.md`
(commit `26a51d6`, verdetto «da rifare»). Leggilo tutto: vanno risolti tutti i 16 rilievi.
Restano ferme le decisioni già prese (esecuzione del coordinatore, file locale delle
credenziali, anteprima e «vai», CLI Supabase, rilasci a mano, tre fasi, finestra
lunedì–mercoledì).

**Novità su `main` di cui tenere conto:** la #30 (esportazione) è unita, quindi il codice
pubblicato contiene già binding R2 e cron notturno (rilievo 4); la migrazione
dell'esportazione è ora `20261012110000_backup.sql` (PR #32) e `scripts/migrations.test.ts`
vieta versioni duplicate. TLS con verifica del certificato come nella CLI di W5
(`scripts/backup/cli.ts`, rilievo 2: riusala se possibile).

## Decisioni del coordinatore sui punti aperti

1. **Preferenze condizionali nelle note dell'origine** (per esempio una ricetta vietata nelle
   cene per quattro ma ammessa per due adulti): non diventano esclusioni. Lo script le
   elenca nel report e nell'anteprima, sotto «preferenze da sistemare a mano», con ricetta e
   testo della nota. Nessuna perdita silenziosa, nessun divieto più ampio.
2. **Due ricette nello stesso pasto storico:** il pasto prende la prima per slug; l'altra
   entra fra le ricette provate (`family_tried_recipes`, se non c'è già) e nel report. Così
   l'informazione «l'abbiamo mangiata» non si perde e non si inventa un pasto.
3. **Avvio che non termina nella finestra:** se il bootstrap riesce ma caricamento o primo
   collaudo non terminano entro le 19 del mercoledì, la famiglia ancora inutilizzata si
   rimuove (comando del piano, in transazione, con anteprima e «vai») e si ritenta in una
   finestra successiva. Niente sospensioni della generazione.

Aggiorna spec e piano e chiudi con `STATO: SPEC_PIANO_PRONTI` come ultima riga: segue una
seconda review breve.
