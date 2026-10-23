# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Stato corrente (aggiornato il 23 ottobre 2026)

- **Attività in corso:** W22 (skeleton nelle pagine rare e nelle sezioni dei curatori,
  seguito della issue #49) e W24 (avviso del menu pronto), entrambi in implementazione.
- **Worker attivi:** W22, tab «W22 skeleton pagine rare» (`w1:t5R`, pane `w1:p5R`), branch
  `evolutive/skeleton-pagine-rare`, worktree `.worktrees/skeleton-rare`; ultimo STATO:
  revisione 1 APPROVABILE CON CORREZIONI (`revisioni/w22-spec-piano.md`), correzioni
  e decisioni del coordinatore in `messaggi/w22-01-revisione-spec.md`; corrette (commit
  `c725262`); revisione 2 APPROVABILE CON CORREZIONI, correzioni in
  `messaggi/w22-02-revisione-spec-2.md`; revisione 3 con un solo rilievo minore (etichetta
  del ruolo negli Inviti): spec e piano approvati dal coordinatore con quella correzione;
  corretto (commit `1843993`); `PR_APERTA` #79, in revisione.
  W24, avviso del menu pronto (email e in app, preferenza per non ricevere le email),
  brief `brief/w24-avviso-menu-pronto.md`, tab «W24 avviso menu» (pane `w1:p5V`), branch
  `evolutive/avviso-menu-pronto`, worktree `.worktrees/avviso-menu`; fase 1 (brainstorming
  con l'utente nella tab, poi prototipo `d3464ce` sulla porta 8767); scelte dell'utente:
  pallino sull'icona del calendario, giorni della settimana nuova in verde nel mese (niente
  puntini), email B a righe compatte; anteprima confermata dall'utente; revisione 1 APPROVABILE CON CORREZIONI (`revisioni/w24-spec-piano.md`), correzioni in
  `messaggi/w24-01-revisione-spec.md`; rilievo 7: l'utente sceglie un fondo verde chiaro
  dietro i giorni nuovi (`messaggi/w24-02-segnale-calendario.md`). Corrette (commit
  `fc71121`, anteprima sulla porta 8768); revisione 2 APPROVABILE CON CORREZIONI (quattro
  rilievi tecnici), corrette; revisione 3 con due rilievi minori: spec e piano approvati
  dal coordinatore (commit `6d8b786`); `/clear` e implementazione in corso.
  Ordine dei merge: W23 prima di W24 (stessa barra del Menu); W24 si riallinea a main prima
  della PR.
- **Unite, in attesa del rilascio unico:** W23, pulsante «Oggi», PR #78 (merge `c9a8be1`,
  revisioni `revisioni/w23-*.md`); tab, worktree e branch rimossi. Decisioni da riportare
  nella specifica: nella spec `2026-10-23-bottone-oggi.md`, da riportare insieme a W22 e W24.
- **Revisori attivi:** «R W22 PR», rapporto atteso `revisioni/w22-pr79.md`.
- **Evolutiva E, ricetta da un link:** in pausa per scelta dell'utente (17/10); descrizione
  in `progetto/superpowers/specs/2026-10-17-ricetta-da-link-descrizione.md`, da approvare.
- **Spunti da Cuicuit (22/10):** in `progetto/superpowers/specs/2026-10-22-spunti-cuicuit.md`;
  **in sospeso**, l'utente ci vuole pensare prima del via al piano.
- **Domande in sospeso:** via al piano degli spunti da Cuicuit; chiudere la issue #49 (W20
  rilasciata) dopo W22.
- **Rilascio:** decisione dell'utente (23/10): un unico rilascio quando W22, W23 e W24 sono
  tutti uniti. Comprende la migrazione di W24 e la variabile `APP_ORIGIN`; meglio prima di un
  mercoledì sera (prima email col menu nuovo).
- **Limite:** 3 worker Claude (portato da 1 a 3 dall'utente il 23/10); revisori Codex senza limite.
- **In produzione:** versione `507c4662-e2c0-4c03-8811-b2b0ea5e67f0` (commit `bb523a2`, 18/10
  16:39 UTC, W20). Precedente per un ritorno: `c3a72b02-bf2f-4100-8628-b8ce61bcadd0`.
- **Prossimo passo:** revisione delle PR di W22 e W24 quando arrivano; dopo i merge, PR di
  documentazione con le decisioni di W22, W23 e W24 nella specifica; poi anteprima del
  rilascio unico.

## Storico

- **18/10, sera:** collaudi di W20 (skeleton, PR #75, versione `507c4662`) e W21 (PR #74)
  fatti dall'utente; W19 (PR #72), W17 (PR #68-#70) e W18 (PR #71) rilasciati; PR di
  documentazione #76 e #77 unite.

### Worker e attività (fino al 17/10)

**17/10 pomeriggio, W15 (parte software di D):** brainstorming con sette decisioni dell'utente; spec e piano approvati dopo tre revisioni Codex (`revisioni/w15-spec-piano*.md`, messaggi `w15-01` … `w15-04`; semplificazioni approvate dall'utente: prima email dal server, etichetta «Non ha ancora confermato l'email», «Accedi» dopo la password); PR #64 (+6776 −676) con revisione APPROVABILE CON CORREZIONI e CI rossa su un test instabile, correzioni in `67a0a7a` verificate dal coordinatore, **unita** (`7f9342a`).

**17/10 pomeriggio:** W14 chiuso dopo la prova finale con «riprendiamo» (tab, worktree e branch rimossi). PR #63 di documentazione unita (`4770182`, «mergia» dell'utente, senza revisione Codex per sua scelta): frase su `AGENTS.md` nella specifica principale, somiglianza e zoom nella specifica e in `design/design.md`, `*.prompt` dei revisori fuori da Git, regola del rilascio allentata (il coordinatore lancia `--apply` dopo il «vai»; il commit l'ha fatto l'utente con `!`, perché il classificatore ha bloccato la modifica al coordinatore e al sottoagente). Issue #62 aperta (worker curatore del ricettario). W15 avviato sulla parte software di D.


**17/10, W13 chiuso: PR #60 unita** (`a6adf55`; #48 caratteristica `primary_ingredient_line` della somiglianza, #51 campi a 16px con test statico conservativo). Revisione Codex `revisioni/w13-pr60.md` DA CORREGGERE: test dei campi reso conservativo (verificato dal coordinatore con i due casi del revisore); carne rossa oltre il massimo in 3 settimane su 20 invece di 1 nel report: **accettata dall'utente** (17/10), la causa è il ricettario troppo piccolo, l'utente lo estenderà a breve con ricette più varie. **Da fare:** rilascio (anteprima del coordinatore, «vai» dell'utente, lancio con `!`) prima di mercoledì 21/10 alle 20:00; prova sull'iPhone (campo di ricerca in «Cambia pasto», Safari e PWA); decisioni del piano `plans/2026-10-17-somiglianza-e-zoom.md` nella specifica principale (sezione 3) e in `design/design.md`; chiudere #48 e #51 dopo la prova; rimuovere tab e worktree di W13. **W14** (tab «W14 istruzioni», pane `w1:p4K`, worktree `.worktrees/istruzioni`): brainstorming fatto dall'utente nel pane, spec e piano rivisti (`revisioni/w14-spec-piano.md` DA CORREGGERE, rilievi in `messaggi/w14-01-revisione-spec.md`), corretti. Utilizzo settimanale all'87% il 17/10 mattina (azzeramento 18/10 alle 15): revisioni Codex solo dove servono.

**17/10 mattina, ordine concordato con l'utente** (risposta «Ok» alla proposta del coordinatore): 1) PR #59 di documentazione (decisioni delle foto nella specifica principale, dominio e stato di D nel piano generale; revisione Codex `revisioni/pr59-specifica.md` DA CORREGGERE, due rilievi corretti dal coordinatore), poi «mergia» dell'utente; 2) correzione di #48 prima della generazione di mercoledì 21/10 alle 20:00, insieme a #51; 3) parte software di D; 4) E, parti scelte dall'utente; pulizia dei worktree quando capita. Worktree di W12 rimosso (branch unito). **Decisione dell'utente su #48 (17/10):** nuova caratteristica della somiglianza (ingrediente principale di una ricetta presente come riga non facoltativa nell'altra), solo penalità, **nessun vincolo rigido** né per l'ingrediente né per la proteina nello stesso giorno. L'utente ha ricordato che il lavoro va ai worker herdr: **W13 avviato** (tab «W13 somiglianza», pane `w1:p4J`), brief `brief/w13-somiglianza-e-zoom.md`, branch `correzioni/somiglianza-e-zoom`, worktree `.worktrees/somiglianza` (con il test di #48 già scritto dal coordinatore, non committato); piano breve, niente spec separata, revisione Codex sulla PR; rilascio entro mercoledì 21/10 alle 20:00.

**17/10, dominio `cosasimangia.app`** (decisione dell'utente, lavoro del coordinatore senza worker): zona Cloudflare `b28d7cf76d666507a65079ca8c08e4f1`; fatti record `www` (AAAA 100:: proxy) con regola di reindirizzamento 301 verso il dominio (`9d82dcf2f58a48eb80bc6b86430d8df3`) e DMARC `p=none`. PR #56 unita (dominio personalizzato del Worker, `workers_dev` spento, controllo del rilascio aggiornato, `wrangler dev --local-upstream` per l'origine locale). **Rilasciata** (17/10, 04:23 UTC) dopo il «vai»: versione `8d4763ec-b29d-4d09-941b-9411c22fa3f9` (commit dc288e6; rollback `5dce4dda-67d7-4315-97f3-608631f45796`). Il rilascio si è fermato a `deploy-target` dopo il deploy: Wrangler scrive la destinazione come `cosasimangia.app (custom domain)`; controlli successivi fatti a mano e superati (solo la versione nuova al 100%, `info.version` uguale, `/mcp` 401, metadati OAuth 200, SPA 200, lista inesistente 404; vecchio indirizzo 404). Correzione del confronto nella PR #57, unita (17/10, `2e20cbe`; nessun rilascio, tocca solo lo script). **Completato (17/10):** DNS di Resend pubblicati dall'utente (MX e SPF su `send.`, DKIM `resend._domainkey`, DMARC `p=none`) e dominio verificato; *Site URL* e *Redirect URLs* di Supabase sul nuovo dominio senza il vecchio (utente); SMTP personalizzato di Supabase Auth su Resend (`smtp.resend.com:465`, utente `resend`, chiave dedicata «supabase-auth» con solo invio sul dominio, mittente `Cosa si mangia <noreply@cosasimangia.app>`), impostato dall'utente; prova con magic link dalla parte dell'utente riuscita; PWA reinstallata sull'iPhone e funzionante; agente MCP di Claude Code ricollegato a `https://cosasimangia.app/mcp` (`session_whoami` ok).

**16/10 sera, W12 avviato su E, foto delle ricette (#39)** con l'approvazione dell'utente: brief `brief/w12-foto-ricette.md`, branch `ondata3/foto-ricette` da `main` locale, worktree `.worktrees/foto`. L'utente ha accettato l'orientamento del coordinatore (bucket R2 separato, caricamento dall'app e via MCP da indirizzo, ridimensionamento nel browser, provenienza, cache a runtime, backup dei soli riferimenti con conservazione). Fase: brainstorming. Decisioni dell'utente nel brainstorming (16/10): comandi della foto solo nella scheda ricetta aperta, mai nelle schede compatte; **provenienza tolta** (risposta data dall'utente nel pane di W12; decade il punto 4 del brief), si salvano solo autore e data; agente: più libertà nella ricerca dell'immagine (risposta dell'utente nel pane), conferma esplicita del curatore prima di impostare la foto (sì dell'utente). **Spec e piano pronti (commit 5096a3c)**; prima revisione DA CORREGGERE (`revisioni/w12-spec-piano.md`, `messaggi/w12-01-revisione-spec.md`; decisioni del coordinatore: nessuna pulizia automatica del bucket, `/photos/*` senza cache HTTP e offline solo dal service worker); correzioni in 437c3f8, seconda revisione DA CORREGGERE, quattro rilievi tecnici (`revisioni/w12-spec-piano-2.md`, `messaggi/w12-02-revisione-spec-2.md`); correzioni in fdaca68, terza revisione DA CORREGGERE, un solo rilievo sul formato del 413 (`revisioni/w12-spec-piano-3.md`, `messaggi/w12-03-revisione-spec-3.md`), correzione in 4732d64 verificata dal coordinatore: **spec e piano approvati**, devDependency `@orpc/openapi-client` approvata (piano generale, registro delle decisioni); implementazione fatta; **PR #54 aperta** (6b6d0c8, +4638 −62, 80 file); CI verde; prima revisione DA CORREGGERE (`revisioni/w12-pr54.md`, `messaggi/w12-04-revisione-pr54.md`: logout del service worker, errori di Images.info, cache tollerante, prova del lucchetto, minori). Passi esterni per il rilascio nel rapporto: bucket `cosasimangia-photos` eu senza regole di cancellazione, binding PHOTOS e IMAGES, limitatore 9103, `/photos/*` in run_worker_first. Correzioni in 6e5b1f1 (pgTAP 918, server 658 con database); seconda revisione DA CORREGGERE (`revisioni/w12-pr54-2.md`, `messaggi/w12-05-revisione-pr54-2.md`: tetto delle 300 foto superato con scritture contemporanee, prova negativa di lockRecipe da mostrare); correzione in b7b3dc0 verificata dal coordinatore (tetto ricontrollato dopo la scrittura; prova negativa di lockRecipe vista). **PR #54 unita** (16/10 sera, CI verde). **Rilasciata** (16/10, 18:33 UTC): bucket `cosasimangia-photos` creato dall'utente, migrazione `20261016110000_recipe_photos.sql` applicata, versione `5dce4dda-67d7-4315-97f3-608631f45796` (commit 41d9918; rollback `c5f006a4-9404-423c-84c8-11f748ea1dd8`), controlli superati. Popolamento delle foto (16/10 sera, decisione dell'utente «caricamento massivo senza conferme», autorizzazione esplicita): 30 foto impostate via MCP dalle pagine delle fonti (omelette rifiutata, photo_too_small); il file servito non contiene EXIF (verificato su una foto con EXIF all'origine); ricerca online per le 20 ricette restanti (richiesta dell'utente): 16 impostate, 4 bloccate dal classificatore dei permessi (hamburger di cavallo, pappardelle Alfredo, riso alla cantonese, sandwich), in attesa dell'utente. Test web instabile in CI su main: «leave then join restores the family without old data» (`FamilyDeletePage.test.tsx`), passato al secondo tentativo. Issue #55 aperta per i test del backup non ripetibili. **Da fare:** passi esterni (bucket `cosasimangia-photos` eu, binding PHOTOS e IMAGES, limitatore 9103), migrazione `20261016110000_recipe_photos.sql`, rilascio dopo il «vai» dell'utente, prove sull'iPhone, decisioni nella specifica principale (PR del coordinatore, serve il «mergia»); chiudere W12 e il worktree dopo il rilascio. Foto correnti delle bozze servite anche prima della pubblicazione; foto delle ricette da libro servite come le altre (decisioni di W12). Spec scritta, verifica interna del worker con un sottoagente prima del piano; poi revisione Codex di spec e piano.

**16/10 pomeriggio, #52 rilasciata** (commit 9228598, versione `c5f006a4-9404-423c-84c8-11f748ea1dd8`; rollback `75d29930-6125-41bd-acf4-786814218171`): migrazione `20261016100000_family_management.sql` applicata, controlli del rilascio superati. Lanciato dall'utente con `!` dalla cartella principale (un primo tentativo dal worktree della PR #53 si è fermato ai controlli, nessuna scrittura). **Collaudo dell'utente e prove sull'iPhone riusciti (16/10): attività C chiusa.** **PR #53 unita** (16/10, «mergia» dell'utente): decisioni di C nella specifica principale, piano generale e `design/percorsi.md`; worktree del sottoagente rimosso. Storico: PR #53 (specifica principale con le decisioni di C, revisione Codex `revisioni/pr53-specifica.md` DA CORREGGERE, correzioni in fa052a4) da aggiornare con il rilascio, poi «mergia» dell'utente.

**16/10 pomeriggio, PR #52 unita** (attività C, W11; quattro revisioni di spec e piano, due della PR più la verifica del coordinatore sull'ultimo commit 7c71bb9; CI verde). W11 chiuso, worktree e branch rimossi; la macchina Podman risulta spenta (W11 ha fermato i suoi processi). Nuova migrazione `20261016100000_family_management.sql`. **Da fare:** rilascio in produzione dopo il «vai» dell'utente (migrazione con la CLI, anteprima di `npm run release`, poi l'utente lo lancia con `!`); prove a mano sull'iPhone (spec `specs/2026-10-16-gestione-famiglia.md`, «Da provare a mano sull'iPhone»), compresa l'eliminazione dell'account e della famiglia di prova di A; riportare le «Decisioni da riportare nella specifica» nella specifica principale, nel piano generale e in `design/percorsi.md` (PR del coordinatore, serve il «mergia»). **Nessun worker attivo.**

**16/10, W11 avviato su C (gestione della famiglia)** con l'approvazione dell'utente: brief `brief/w11-gestione-famiglia.md`, branch `ondata3/gestione-famiglia` da `main` locale, worktree `.worktrees/famiglia`. Decisione dell'utente del 16/10: **una sola PR** per tutta C. Decisione di prodotto attesa dal brainstorming: se e come un invito alla famiglia crea un account (decisa: tetto di 10 account per link). Spec e piano pronti (commit 02bcbdc); prima revisione DA CORREGGERE (`revisioni/w11-spec-piano.md`, rilievi al worker in `messaggi/w11-02-revisione-spec.md`), correzioni in 62f8022; seconda revisione DA CORREGGERE (`revisioni/w11-spec-piano-2.md`, `messaggi/w11-03-revisione-spec-2.md`), correzioni in b0a0f2d; terza revisione DA CORREGGERE senza bloccanti (`revisioni/w11-spec-piano-3.md`, `messaggi/w11-04-revisione-spec-3.md`), correzioni in 928cdb8; quarta revisione mirata DA CORREGGERE (`revisioni/w11-spec-piano-4.md`, `messaggi/w11-05-revisione-spec-4.md`), correzioni in 71f3e5b verificate dal coordinatore: **spec e piano approvati**, fase: implementazione; compiti 1–16 fatti (093f10f), **PR #52 aperta** (4c90de0, +11222 −380, 124 file); prima revisione DA CORREGGERE (`revisioni/w11-pr52.md`, `messaggi/w11-06-revisione-pr52.md`), correzioni in 75ca561; seconda revisione in corso (tab «R W11 PR52-2», `revisioni/w11-pr52-2.md`). Prima: `/clear` e ripresa dal 17 (registro del worker `.superpowers/sdd/2026-10-16-gestione-famiglia/progress.md`; stack locale `w11-famiglia`, porte 586xx). Messaggio al worker: `messaggi/w11-01-riepilogo-design.md`.

**16/10 mattina, #47 rilasciata** (commit cecefef, versione `75d29930-6125-41bd-acf4-786814218171`; rollback `d53e1bce-1a3f-48a9-9a7e-9220787cf7e1`, nata dal ricaricamento del segreto `SUPABASE_SECRET_KEY` il 15/10): migrazione `20261015100000_user_admin.sql` applicata. Lanciato dall'utente con `!` (il classificatore di Claude Code blocca il rilascio dal coordinatore). Provata dall'utente sull'iPhone il 16/10: funziona; **#38 chiusa**. **R23 chiuso:** esportazione della notte 15→16/10 `exports/2026-10-16T02-30Z.json.gz.enc` di 134456 byte (130983 la notte prima), nessun duplicato alle 04:30.

**15/10 sera, PR #47 unita** (attività B, #38; due revisioni di spec e piano, due della PR, ultimo giro controllato dal coordinatore; CI verde su `a9967f7`). W10 chiuso, worktree rimosso. Nuova migrazione `20261015100000_user_admin.sql` (solo funzioni). Da fare: rilascio in produzione (migrazione con la CLI, poi `npm run release`) dopo il «vai» dell'utente; chiudere #38 dopo la prova; riportare le «Decisioni da riportare nella specifica» di `specs/2026-10-15-amministrazione-utenti.md` nella specifica principale (PR del coordinatore, serve il «mergia»); poi attività C.

**15/10 sera, W10 avviato su B (#38)** con il «procedi» dell'utente: brief `brief/w10-amministrazione-utenti.md` (commit 455f070), branch `ondata3/amministrazione-utenti` da `main` locale, worktree `.worktrees/amministrazione`. Decisione dell'utente del 15/10: **la cancellazione degli utenti va in C**, non in B. Fase: brainstorming.

**15/10, #45 rilasciata** (commit 8c69336, versione `25039e50-79ca-46db-ae23-833e34483530`; rollback `4c9d614c…`): migrazione `app_invitations` applicata, segreto `SUPABASE_SECRET_KEY` caricato dall'utente (chiave `worker-invitations`; il primo caricamento con `!`/`pbpaste` aveva un valore sbagliato → `auth_admin_failed`, ricaricato da un terminale interattivo). Prova sull'iPhone riuscita: invito, account, nome, famiglia, Home, login nella PWA. L'utente tiene l'account e la famiglia di prova per collaudare l'attività C (eliminarli con i comandi di C). #42 verificata: dopo questo rilascio la PWA si è aggiornata da sola. R23: `cron_generated = t` il 15/10. **PR #46 unita** (15/10, «mergia» dell'utente dato in anticipo; due revisioni Codex, `revisioni/pr46-specifica.md`, `-2.md` APPROVATA): decisioni di W9 nella specifica principale, piano generale e `design/percorsi.md`. Prossimo: attività B (#38) con un worker nuovo, quando l'utente lo dice. W9 chiuso il 14/10 dopo il merge della #45. **PR #44 unita** (13/10, «mergia» dell'utente) dopo due revisioni Codex (`revisioni/pr44-specifica.md`, `-2.md`), worktree rimosso. Decisione dell'utente: niente email finché il DNS di `qunidi.it` non si può modificare (dominio aggiunto in Resend, `eu-west-1`, in attesa dei record); invito all'app con password scelta sulla pagina; app su `workers.dev`. Prima: **nessun worker attivo.** W8 chiuso dopo il merge della PR #43 (aggiornamento della PWA, #42; spec `specs/2026-10-13-aggiornamento-pwa.md`). **Rilasciato il 13/10 sera** (versione `759ce4d6-cd15-455d-8095-668f379848c9`, commit e7423c0; rollback `63f09c03…`). Da fare: primo passaggio con due aperture a freddo (sezione «Il primo rilascio di questa correzione» della spec); collaudo sull'iPhone dell'utente (sezione «Da provare a mano»); poi chiudere #42 e #37; riportare nella specifica principale e nelle «Interfacce decise» del piano generale le decisioni delle spec W7 e W8 (navigazioni dalla shell, CACHE_SCHEMA al posto del buster della build, cambio password) con una PR del coordinatore che richiede il «mergia» dell'utente. W7 chiuso dopo il merge della PR #41 (cambio della password, #37). Da fare: riportare le «Decisioni da riportare nella specifica» di `specs/2026-10-13-cambio-password.md` nella specifica principale (PR del coordinatore, serve il «mergia» dell'utente); **rilasciato il 13/10** (versione `63f09c03-d3ec-493c-b65f-fa475d87be65`, commit 74174f8; rollback `6382d9b5…`); l'utente ha confermato «Secure password change» spento e ha acceso «Require current password when updating»; minimo di produzione non verificato (la SPA impone 8). Chiudere #37 dopo la prova dell'utente. Accesso deciso dall'utente il 13/10: email e password permanente (la PWA su iPhone non condivide la sessione con Safari), Google solo come comodità dopo una prova sull'iPhone; PR #40 in aggiornamento dal sottoagente, poi revisione Codex. Il 12/10 pomeriggio l'utente ha messo in pausa il lavoro («riprendiamo quando riesco a dedicarci tempo»): W6 chiuso dopo il merge della #34, worktree rimosso. Alla ripresa, limite di un solo worker Claude (decisione del 12/10), revisori Codex senza limite. W2, W3, W4, W5 chiusi il 12/10 (lavoro tutto su main). Revisori Codex senza limite.

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|

Unite su `main` (ondata 3): #44 (specifica W7/W8 e ondata 3 senza email), #45 (inviti all'app e famiglie nuove, W9). Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2), #13 (`mealRecipeVersions`, `versionedInput`, dominio con `noUncheckedIndexedAccess`), #16 (profilo e famiglia lato server), #14 (ricettario lato server), #15 (menu lato server), #11 (spesa lato server), #17 (client oRPC reale e agganci di sessione), #18 (profilo al posto di me nel web), #19 (ricettario web), #20 (menu web), #21 (profilo e famiglia web), #22 (spesa web), #23 (gestione del ricettario lato server), #24 (nomi delle varietà nella spesa), #25 (correzioni della prova sullo stack reale, shell della PWA), #28 (porzioni del pasto nella scheda), #27 (unità contate scalate), #26 (bozze e archiviate nel web per i curatori), #29 (revisione dei pasti, server), #30 (esportazione notturna in R2), #32 (versione di migrazione duplicata), #31 (collegamento degli agenti), #33 (revisione dei pasti, web), #34 (strumenti della messa in produzione), #35, #36, #40 (specifica dopo la produzione), #41 (cambio della password, W7), #43 (aggiornamento della PWA, W8). Ondata 1 completata.


### Prossime azioni precedenti


**Aggiornato il 16 ottobre 2026. Si riparte da qui.**

- **Attività C chiusa** (16/10): rilasciata, collaudata, specifica aggiornata (PR #52 e #53).
- **Prossimo:** attività E (D bloccata dal DNS di `qunidi.it`); l'utente sceglie da dove partire. Un solo worker Claude, revisori Codex, brief da approvare. Perimetro nel piano generale («Ordine dell'ondata 3», riga C) più la **cancellazione degli utenti dall'amministrazione** (decisione dell'utente del 15/10). Usa le interfacce di A e B in «Interfacce decise» (in particolare il lucchetto `app_admin_roles` per ogni percorso che toglie `app_admin`, anche la cancellazione dell'account). Brief da scrivere sul modello di `brief/w10-amministrazione-utenti.md` e da far approvare all'utente; un solo worker Claude, revisori Codex; prove locali senza la produzione (`protocollo-worker.md`, «Prove sullo stack locale»).
- **PR #50 unita** (16/10, «mergia» dell'utente; revisione Codex `revisioni/pr50-specifica.md`, correzioni in `827ecc2`): decisioni di B nella specifica principale, piano generale e `design/percorsi.md`; worktree del sottoagente rimosso.
- **Rilasci:** il classificatore di Claude Code blocca `npm run release -- --apply` dal coordinatore: anteprima dal coordinatore, poi l'utente lo lancia con `!`.

**Aggiornato il 13 ottobre 2026 sera, prima di un /clear chiesto dall'utente. Si riparte da qui.**

Decisioni del brainstorming di W9 registrate nelle «Interfacce decise» del piano generale (13/10).
0. **Ondata 3 avviata (13/10 sera):** ordine approvato (A → B → C, D quando c'è il DNS, poi E; piano generale nella PR #44). W9 su A. Alla chiusura della revisione della #44: correzioni nel worktree del sottoagente, poi «mergia» dell'utente.
1. **Prossimo lavoro: ondata 3** (decisione dell'utente del 13/10). L'utente vuole aggiungere un'altra
   persona che si crea la propria famiglia: ha preferito non usare il `bootstrap` a mano (possibile
   senza sviluppo, `prod-sql.ts bootstrap` senza `--launch`) e procedere con l'ondata 3. Perimetro nel
   piano generale, «Ondata 3: prodotto». Primo passo: proporre all'utente l'ordine dell'ondata 3 e le
   dipendenze (inviti che creano l'account con iscrizioni spente, Resend e dominio, creazione delle
   famiglie dagli utenti, amministrazione dell'app #38, wizard…), con la mappa produttore→consumatore
   prima di lanciare worker; limite di un worker Claude, revisori Codex senza limite; solito giro.
2. **PR #44 aperta** (branch `traguardo/specifica-w7-w8`, commit `c5656f8`, worktree del sottoagente
   `.claude/worktrees/agent-afff511744cf9c57e`): riporta nella specifica principale e nelle «Interfacce
   decise» del piano generale le decisioni di `specs/2026-10-13-cambio-password.md` e
   `specs/2026-10-13-aggiornamento-pwa.md`. Da fare: revisione Codex (`avvia-revisore.sh`), correzioni,
   poi **«mergia» esplicito dell'utente** (PR scritta dal coordinatore), poi rimuovere il worktree (il
   checkout deve essere pulito per `npm run release`).
3. **#42 verificata il 15/10** (aggiornamento automatico dopo il rilascio della #45); prima: verificare al prossimo rilascio il passaggio automatico al ritorno in primo piano
   sull'iPhone. Il primo passaggio dalla versione vecchia non è avvenuto con due aperture: l'utente ha
   dovuto togliere l'app, cancellare i dati di `qunidi.workers.dev` (Impostazioni › Safari › Avanzate)
   e riaggiungerla. Chicca probabilmente deve fare lo stesso.
4. **#37 chiusa:** cambio della password provato dall'utente in produzione. Produzione: «Secure password
   change» spento, «Require current password when updating» acceso (13/10). Versione attiva
   `759ce4d6-cd15-455d-8095-668f379848c9` (commit e7423c0); rollback `63f09c03…`.
5. **Giovedì 15/10 (R23)**, prima che la famiglia apra il menu: `node scripts/prod-sql.ts --preview
   check-first-generation --set family_id=f3eada3e-67fc-4386-b5ad-93fdb8fb91d3 --set
   week_start=2026-10-19`, atteso `cron_generated = t`; la notte dopo controllare l'esportazione più
   grande; esito in `server/README.md` e qui; poi collaudo completo con la famiglia.
6. Regole: PR scritte dal coordinatore o da suoi sottoagenti solo con «mergia» dell'utente; PR dei
   worker con revisione chiusa e CI verde le unisce il coordinatore. Produzione sempre anteprima →
   «vai» → applicazione. R26 (rotazione password) rimandato dall'utente.


### Storico della fase 1 (12–13/10)

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
   **Fatto il 15/10: `cron_generated = t`** (job 14/10 20:00:27, `done`, 1 tentativo). Resta l'esportazione della notte 15→16/10.
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
