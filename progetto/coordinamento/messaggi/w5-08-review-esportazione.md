# W5 — rilievi della review di spec e piano dell'Esportazione in R2

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w5-esportazione-spec-piano.md`
(commit `dbf9d706`, verdetto «da rifare»). Leggilo tutto: vanno risolti tutti i 10 rilievi.
Decisioni del coordinatore sui punti aperti:

1. **Marcatori `*_xid` (rilievo 3).** Al ripristino i contatori applicativi
   (`data_version`, `version`) si conservano; i marcatori di deduplicazione
   (`families.data_version_xid`, `catalogue_state.version_xid` e simili) si azzerano a un
   valore che non può coincidere con una transazione del nuovo database (per esempio
   `NULL`, se i trigger lo gestiscono; altrimenti una regola equivalente motivata). Il
   confronto dopo il ripristino è esatto su tutto tranne questi campi, elencati in modo
   esplicito nel codice e nella spec. Test con una mutazione dopo il ripristino.
2. **Limite dell'esportazione (rilievo 5).** Misura memoria, CPU e durata in workerd con
   dati poco comprimibili e fissa un limite sostenibile con margine. Il controllo avviene
   **prima** delle allocazioni costose (per esempio dalle dimensioni delle tabelle); oltre
   il limite l'esportazione non parte e scrive un log di errore. Correggi il limite di CPU
   del cron (15 minuti).
3. **Commit per il ripristino (rilievo 9).** Non serve un registro nuovo: l'esportazione
   contiene già l'elenco delle migrazioni applicate. La procedura ricava il commit come
   quello in cui `supabase/migrations/` corrisponde esattamente a quell'elenco (comando
   scritto nella procedura); `workerVersion` resta informativo. Test di recupero di un
   archivio precedente dopo l'aggiunta di una migrazione.
4. **Collaudo (punto 3 del rapporto).** Due prove distinte nella spec e nella procedura:
   la prova locale completa (destinazione con migrazioni reali, preparazione documentata,
   `--dry-run`, ripristino, accesso e lettura di famiglia e menu) è il criterio di fine
   della tua PR; la prova di produzione (esportazione vera, chiave dal gestore di password)
   la fa l'utente dopo la creazione del bucket ed è una voce separata del registro.
5. **Destinazione (rilievo 1).** La preparazione documentata è anche quella del test: gestisci
   esplicitamente le righe che le migrazioni inseriscono (per esempio `catalogue_state`) senza
   permettere di sovrascrivere dati veri.

Rilievi 2, 4, 6, 7, 8 e 10: correggi come propone il revisore (nessun oggetto errore stampato
dalla CLI, test con sentinelle; privilegi solo nel setup dei test; tutte le configurazioni
dipendenti dal progetto, Worker e SPA; confronto esatto delle serializzazioni anche per Auth;
test della fotografia con scrittura concorrente, colonna generata, CLI riuscita, dry-run e
rollback; comandi copiabili).

Aggiorna spec e piano e chiudi con `STATO: SPEC_PIANO_PRONTI` come ultima riga: segue una
seconda review breve.
