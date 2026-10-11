**Verdetto: APPROVABILE CON CORREZIONI**

Revisione della PR #8 sul commit `2bd49b3`, tramite `git diff origin/main...HEAD`, con confronto del dominio su `origin/fondamenta/unita-spesa` (`f0be2fa`). Nessun file modificato, nessun commento su GitHub.

**Rilievi**

1. **Importante — Il vincolo lascia passare fonti vuote secondo il dominio.**  
   File: `supabase/migrations/20261011100900_equivalence_source.sql:5`; test: `supabase/tests/catalogue_test.sql:142`.  
   `btrim(source)` elimina soltanto gli spazi ordinari: una fonte composta da tabulazioni o ritorni a capo, per esempio `E'\t\n'`, supera il controllo. Lo schema `domain/src/units/equivalence.ts:27` sul branch W4 usa invece `z.string().trim().min(1)` e la rifiuta. Il database può quindi conservare equivalenze incompatibili con il dominio, contrariamente alla motivazione della PR. La semantica di `btrim` è confermata dalla [documentazione PostgreSQL consultata tramite Context7](https://www.postgresql.org/docs/17/functions-string.html).  
   **Correzione proposta:** allineare il controllo SQL ai caratteri considerati vuoti dal trim del dominio, compresi quelli Unicode; aggiungere test pgTAP per tabulazioni, ritorni a capo e spazi non separabili, oltre alla stringa vuota. Coprire anche un `UPDATE source`, già consentito ai curatori.

**Verifiche della migrazione e dei test**

- Migrazione aggiuntiva corretta nella forma: non modifica quelle già unite e combina `NOT NULL` con un `CHECK`.
- **Righe esistenti:** entrambi i vincoli vengono verificati all’applicazione. Fonti `NULL`, vuote o composte da soli spazi ordinari fanno fallire l’intero `ALTER TABLE`; nessun dato viene corretto o eliminato automaticamente. Seed e fixture esaminati non introducono equivalenze preesistenti da sanare. Non è stato verificato il contenuto del database remoto.
- **Privilegi:** l’alterazione conserva grant e policy RLS. Rimane valido il grant `UPDATE (to_unit, factor, source)` in `20261011100200_catalogue.sql:275`; i nuovi vincoli valgono anche per questi aggiornamenti. Non occorrono nuovi privilegi.
- **Test senza migrazione:** per analisi statica, il test senza fonte alla riga 141 fallisce perché l’inserimento sarebbe consentito. Quello successivo fallisce anch’esso: trova la collisione di unicità prodotta dall’inserimento precedente, anziché il `23514` atteso. La regressione viene dunque intercettata, ma la prova di rimozione della migrazione non è stata eseguita.
- Le fixture degli altri casi ricevono una fonte valida: i controlli su fattore, unicità e unità non vengono mascherati dal nuovo `NOT NULL`.
- `git diff --check origin/main...HEAD`: superato.

**Esecuzione e limiti**

La verifica SQL è **statica**: `supabase test db` si interrompe per `EPERM` sulla telemetria della CLI; anche `podman ps` è bloccato dal sandbox nell’accesso al socket locale. Nessuna suite pgTAP eseguita.

`npm test` è bloccato dalla scrittura della configurazione temporanea Vite fuori dal worktree. `npm run typecheck` supera radice, dominio e contratto, poi fallisce nel server per la dipendenza mancante `@cloudflare/workers-types`. Build non eseguita: il solo script web presente genera un segnaposto ed è estraneo alla modifica SQL.

**Punti da decidere**

Nessuna nuova decisione di prodotto. Prima dell’applicazione a un database già popolato, il coordinatore deve verificare eventuali equivalenze prive di fonte e farle completare con fonti reali; la migrazione correttamente non ne inventa.