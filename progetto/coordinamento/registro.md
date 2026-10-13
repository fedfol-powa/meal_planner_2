# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

**13/10: nessun worker attivo.** W7 chiuso dopo il merge della PR #41 (cambio della password, #37). Da fare: riportare le «Decisioni da riportare nella specifica» di `specs/2026-10-13-cambio-password.md` nella specifica principale (PR del coordinatore, serve il «mergia» dell'utente); **rilasciato il 13/10** (versione `63f09c03-d3ec-493c-b65f-fa475d87be65`, commit 74174f8; rollback `6382d9b5…`); l'utente ha confermato «Secure password change» spento e ha acceso «Require current password when updating»; minimo di produzione non verificato (la SPA impone 8). Chiudere #37 dopo la prova dell'utente. Accesso deciso dall'utente il 13/10: email e password permanente (la PWA su iPhone non condivide la sessione con Safari), Google solo come comodità dopo una prova sull'iPhone; PR #40 in aggiornamento dal sottoagente, poi revisione Codex. Il 12/10 pomeriggio l'utente ha messo in pausa il lavoro («riprendiamo quando riesco a dedicarci tempo»): W6 chiuso dopo il merge della #34, worktree rimosso. Alla ripresa, limite di un solo worker Claude (decisione del 12/10), revisori Codex senza limite. W2, W3, W4, W5 chiusi il 12/10 (lavoro tutto su main). Revisori Codex senza limite.

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2), #13 (`mealRecipeVersions`, `versionedInput`, dominio con `noUncheckedIndexedAccess`), #16 (profilo e famiglia lato server), #14 (ricettario lato server), #15 (menu lato server), #11 (spesa lato server), #17 (client oRPC reale e agganci di sessione), #18 (profilo al posto di me nel web), #19 (ricettario web), #20 (menu web), #21 (profilo e famiglia web), #22 (spesa web), #23 (gestione del ricettario lato server), #24 (nomi delle varietà nella spesa), #25 (correzioni della prova sullo stack reale, shell della PWA), #28 (porzioni del pasto nella scheda), #27 (unità contate scalate), #26 (bozze e archiviate nel web per i curatori), #29 (revisione dei pasti, server), #30 (esportazione notturna in R2), #32 (versione di migrazione duplicata), #31 (collegamento degli agenti), #33 (revisione dei pasti, web), #34 (strumenti della messa in produzione), #35, #36, #40 (specifica dopo la produzione), #41 (cambio della password, W7). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Stato |
|---|---|---|---|

## Decisioni dell'utente da ricordare (11–12/10)

- **Un solo worker Claude** (12/10): W1 e W6 finiscono il lavoro in corso; il primo che termina si chiude (tab chiusa), l'altro resta l'unico worker. Revisori Codex senza limite.
- **Messa in produzione:** caricamento dei dati, migrazioni, `bootstrap.sql` e rilasci li esegue il coordinatore, con le credenziali in un file locale ignorato da Git scritto dall'utente (mai nella conversazione), anteprima e «vai» dell'utente prima di ogni scrittura; a fine avvio l'utente cambia le password. Avvio in tre fasi: 1 infrastruttura (dopo l'approvazione del piano), 2 import e famiglia (dopo revisione dei pasti web), 3 agenti. Finestra lunedì–mercoledì entro le 19. Rilasci a mano con `npm run release`. Migrazioni dalla CLI di Supabase. Impostazioni della famiglia dallo script. Settimane già pianificate nell'origine importate come «menu in corso». Produzione: `lronuqvtjdhfyychnscr`, partenza da workers.dev.
- **Iscrizioni libere spente in produzione** (12/10): account solo con «Add user».
- **Poteri dei token d'agente su Supabase Auth:** solo documentati per ora, testi veritieri; «ultimo rinnovo dell'accesso».
- **Altre:** 7 copie in R2 cifrate con chiave dell'utente; Annulla 6 s nell'app, nessun limite lato server; porzioni 1–20; scheda aperta da un pasto con le porzioni del pasto; unità contate scalate all'intero superiore tranne i pezzi (a mezzi in scheda e menu, interi nella spesa); voci della spesa «Nome (varietà)»; note e pasti liberi come scritti; ingrediente creabile senza nome inglese; nessun «Genera la prima settimana».

## Prossima azione del coordinatore

Aggiornato il 12 ottobre 2026, notte. **Fase 1 della messa in produzione quasi completa.** main verde, nessuna PR aperta.

Stato della fase 1 (runbook in `progetto/superpowers/plans/2026-10-11-messa-in-produzione.md`):

- R1–R3b fatti: account Cloudflare `d0deb498ea6d174e013c878ff38d8dfb`, sottodominio `qunidi.workers.dev`
  (rinominato dall'utente), indirizzo `https://cosasimangia.qunidi.workers.dev`; Data API solo
  `public`/`graphql_public`; iscrizioni spente (`disable_signup: true`); OAuth server attivo con
  registrazione dinamica; Site URL e Redirect URL sull'indirizzo `workers.dev`.
- R4: `.env.production.local` (ignorato da Git) e `~/.config/cosasimangia/supabase-ca.crt` scritti
  dall'utente; host Session pooler `aws-0-eu-west-2.pooler.supabase.com`.
- R5: 17 migrazioni applicate, `app_roles 3`.
- R6: password di `app_server` impostata dall'utente; pool Supabase 15. Nota: una prima password di
  `app_server` è comparsa nella conversazione per un controllo del coordinatore che stampava l'host
  di una riga malformata; l'utente l'ha rigenerata. I controlli sul file stampano solo sì/no.
- R7: Hyperdrive `cosasimangia` id `4c2038adf73d4ed094584a3244f7fbf2`, cache spenta, limite 10.
- R8: R2 attivato dall'utente; bucket `cosasimangia-backups` (eu) creato.
- R9: PR #35 unita (`b7322cf`), merge chiesto esplicitamente dall'utente.
- R10: primo rilascio, versione `e0cab6a9-49f9-4689-ab6a-13d6dea7139c`; dopo il segreto di R11 la
  versione attiva è `6382d9b5-9187-47d6-bb6c-2e188e46cc4d`.
- R11: `BACKUP_ENCRYPTION_KEY` impostato dall'utente.
- R12: account dell'utente creato a mano, UID `44f5d13c-296c-48f6-91f9-98d7733f07a1`; accesso
  dall'iPhone riuscito, app vera senza famiglia; cron delle 22:00 UTC eseguito senza errori (outcome ok).
  R17 pronto: account di Chicca creato dall'utente; nomi, email e UID in
  `progetto/coordinamento/famiglia.local.md` (solo locale, escluso con `.git/info/exclude`).
  Famiglia «Folloni-Balcerek»; Federico e Chicca entrambi `family_admin`, it-IT.

Prossimi passi:

1. **R13 fatto (13/10):** in R2 `exports/2026-10-13T02-30Z.json.gz.enc` (1369 byte), nessun duplicato alle 04:30.
   **R15 fatto (13/10):** l'utente ha decifrato con la chiave del gestore di password; `inspect` → Worker
   `6382d9b5…`, 17 migrazioni, commit `a567c03`; ripristino locale riuscito (32 tabelle, 2 utenti, 2 identità),
   i due UID presenti. File scaricato cancellato.
2. **Finestra del 13/10 aperta** (R18–R20 entro le 19). Impronte di avvio (vale l'ultima):
   - **B0 = `14f1d2ab274de7df828df39fcc6d72a9`** (bootstrap, R18, 13/10 mattina; famiglia `f3eada3e-67fc-4386-b5ad-93fdb8fb91d3`).
   - **B1 = `3282a49aa50e57662c743052afb6793b`** (caricamento, R19, 13/10 mattina; input `bc9d6086d8a317ae`).
   - **R20 positivo (13/10):** collaudo dell'utente tutto a posto; `show-fingerprint` = B1.
   - **Impronta di avvio CHIUSA (13/10, inizio di R23):** da qui niente azzeramento; si corregge in avanti.
3. **R23 in corso:** la famiglia usa l'app. **Giovedì 15/10, prima di aprire il menu:**
   `node scripts/prod-sql.ts --preview check-first-generation --set family_id=f3eada3e-67fc-4386-b5ad-93fdb8fb91d3 --set week_start=2026-10-19`
   → `cron_generated = t` (job e settimana mercoledì 14/10 fra le 20 e le 21); la notte dopo, l'esportazione più grande.
   Esito in `server/README.md` e qui. Da qui il vecchio flusso non pianifica più settimane.
   **R25 fatto (13/10):** nessun commit di codice dopo `b7322cf`, nessun rilascio. Scoperta MCP verificata
   (resource `/mcp`, `/authorize` 200, `/mcp` senza token 401). L'utente ha collegato Claude Code
   (registrazione dinamica con iscrizioni spente: funziona), `session_whoami` e ricettario via agente ok,
   agente visibile nella pagina Agenti (quindi `app.connected_agents()` legge le tabelle `oauth_*`),
   «Scollega» e nuova richiesta di accesso verificati.
   **R26 rimandato** per decisione dell'utente (13/10): le password restano quelle attuali per ora.
   **R27:** PR #36 con «Risorse di produzione» in `server/README.md`; da unire dopo la CI.
4. **Specifica principale:** riportare le decisioni della messa in produzione con un agente in worktree, più la
   decisione dell'utente del 13/10: **la registrazione da invito (ondata 3) funziona sia con Google sia con email e
   password scelte dall'utente** (oggi la sezione 7 dice magic link e Google). Issue aperte il 13/10: #37 cambio
   della password dal Profilo (traguardo A, priorità alta), #38 pagina di amministrazione dei ruoli (ondata 3),
   #39 foto delle ricette (da progettare).
5. **Pulizia facoltativa** dei worktree di PR già unite in `.worktrees/`.
6. **Revisori Codex:** prompt come revisione di qualità, non «avversariale».
7. **Merge:** `gh pr merge <n> --merge` solo dopo `gh pr checks` → `pass`; le PR non revisionate
   le unisce il coordinatore solo su richiesta esplicita dell'utente.
