# Brief W24: avviso «menu della settimana prossima pronto» (email e in app)

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `evolutive/avviso-menu-pronto` (da `origin/main`) · **Worktree:** `.worktrees/avviso-menu`
- **Richiesta dell'utente (23/10/2026):** quando il job del mercoledì prepara il menu della
  settimana dopo, avvisare i membri della famiglia in due modi:
  1. un'**email** con il menu proposto e un link all'app su quella settimana;
  2. un **avviso leggero in app** che c'è il menu della nuova settimana; sparisce la prima
     volta che la persona guarda la settimana successiva.
  L'utente non sa ancora dove mettere l'avviso in app: è la prima cosa da studiare.
  **Requisito fisso (utente, 23/10):** nelle Preferenze della persona un'opzione per non
  ricevere più le email con il menu della settimana; il valore predefinito si decide nel
  brainstorming.
- **Cambia una decisione registrata:** la specifica principale dice «Non manda notifiche
  sui menu» (sezione «Cosa l'app non fa (per ora)»). Questa attività la supera su richiesta
  dell'utente; la specifica la aggiorna il coordinatore dopo il merge.
- **Da leggere prima:** specifica principale, sezioni 1, 14, 15 e 16, «Una settimana tipo»,
  sezione 4 «Job settimanale» (cron orario, `weekly_jobs`, generazione pigra), le email già
  spedite dal Worker con l'API di Resend (inviti, segnalazioni al referente; segreto
  `RESEND_API_KEY`), lingua delle email (sezione 12); `design/design.md` (barra del Menu,
  «Scheda dopo la prima generazione»), `design/percorsi.md`; `spike/REPORT.md` se tocchi
  server o database.
- **Eccezione alla proprietà dei file:** puoi aggiornare `design/design.md` con la forma
  dell'avviso scelta dall'utente.
- **Attività in parallelo:** W23 aggiunge il pulsante «Oggi» nella barra del Menu
  (`brief/w23-bottone-oggi.md`) e W22 lo skeleton nelle pagine rare. Se l'avviso finisce
  nella barra del Menu o vicino alla fila dei giorni, scrivilo nella spec: il coordinatore
  decide l'ordine dei merge.

## Fasi

1. **Brainstorming con l'utente** (skill `superpowers:brainstorming`): fermati con
   `STATO: DOMANDA` appena hai le domande; il coordinatore attiva il Remote Control nel tuo
   pane e l'utente entra lì. Domande da chiarire, almeno:
   - **dove sta l'avviso in app**: per esempio una scheda compatta sopra la barra del mese
     (lo schema esistente della «Scheda dopo la prima generazione»), un pallino sull'icona
     del calendario o sulla voce Menu della navbar, un'indicazione sul bordo della fila dei
     giorni verso la settimana dopo; cosa succede al tocco (porta alla settimana dopo);
   - **quando sparisce**: «guardata» vuol dire aperta nel Menu su un giorno della settimana
     dopo (anche via swipe)? Vale per persona, su tutti i suoi dispositivi (stato sul
     server, serve una migrazione) o per dispositivo (stato locale)? E se la settimana non
     viene mai guardata, l'avviso scade al lunedì?
   - **email**: a chi (tutti i membri o chi lo sceglie), preferenza nelle Preferenze
     (requisito fisso: attiva o spenta all'inizio, anche per chi entra dopo; link per
     smettere nell'email stessa?), lingua della persona, contenuto (pasti per giorno, pasti
     liberi, link alla settimana), cosa succede se il menu cambia dopo l'invio (l'email è
     una fotografia), una sola email per persona e settimana anche se il job riprova;
   - settimane create dalla generazione pigra o da una famiglia appena creata: avviso sì o
     no.
2. **Prototipo con varianti** in `prototype/` per l'avviso in app (2-3 posizioni,
   **commutabili dal pannello Prova**) e un'anteprima dell'email (HTML statico va bene).
   Pubblica l'anteprima come nei giri precedenti e fermati con `STATO: DOMANDA`.
3. **Spec e piano** dopo le scelte: modello dei dati e migrazione (stato «visto» se sul
   server, registro degli invii per l'idempotenza, preferenza email), contratto oRPC e
   strumenti MCP derivati, invio nel job settimanale (fuori dalla transazione della
   generazione, errori che non bloccano le altre famiglie), limiti del piano gratuito di
   Resend, accessibilità dell'avviso, «Decisioni da riportare nella specifica».
   `STATO: SPEC_E_PIANO_PRONTI` e revisione Codex.
4. **Implementazione**, PR, `STATO: PR_APERTA <url>`.

## Vincoli

- Documentazione di Resend, Cloudflare, Supabase e oRPC con Context7.
- Nessuna dipendenza nuova senza approvazione del coordinatore (template dell'email con
  il codice già presente, se possibile).
- Migrazioni in `supabase/migrations/`, con RLS; controlla che la versione non collida con
  altre PR aperte.
- Testi localizzati in italiano e inglese britannico.
- Test: invio una sola volta per persona e settimana, rispetto della preferenza, lingua,
  avviso presente fino alla prima visita della settimana dopo e assente dopo.
- Prove solo sullo stack locale: **nessuna email vera** verso indirizzi della famiglia e
  nessuna chiave di produzione; usa un invio finto o la modalità di prova di Resend.
- Rilascio in produzione e migrazioni in produzione: **non li fai tu**.
