# Brief W15: Email dell'app (ondata 3, attività D, parte software)

Segui `progetto/coordinamento/protocollo-worker.md` e, per la forma del lavoro verticale,
`progetto/coordinamento/brief/ondata2-comune.md` (proprietà dei file, migrazioni, MCP,
design, interfacce decise: valgono anche qui).

- **Branch:** `ondata3/email` · **Worktree:** `.worktrees/email`
- **Spec e piano:** `progetto/superpowers/specs/2026-10-17-email.md`,
  `progetto/superpowers/plans/2026-10-17-email.md`
- **Specifica principale:** Parte 1 («Chi la usa», «Amministrare l'app»), sezioni 1
  (Supabase Auth, SMTP personalizzato su Resend, «Email con Resend», segreti), 4
  («Errori»: `weekly_job_overdue` e `weekly_job_abandoned`, referente operativo), 7 (tutta
  la parte su accesso, inviti all'app e alla famiglia, «Password dimenticata», «Dopo
  l'attività D», «Email con Resend»), 8 (esportazione notturna e allarme sui fallimenti),
  12 (lingue), 13 (parità MCP) e 15. Piano generale: «Ordine dell'ondata 3» (riga D) e
  «Interfacce decise» (in particolare la voce sul login).
- **Spec di dettaglio da cui parti:** `specs/2026-10-13-inviti-app.md` (A),
  `specs/2026-10-16-gestione-famiglia.md` (C), `specs/2026-10-13-cambio-password.md`
  (W7: «Secure password change» e riautenticazione).
- **Design e prototipo:** `design/design.md`, `design/percorsi.md` (accesso, inviti),
  in `prototype/` le pagine di accesso e d'invito.

## Obiettivo

L'app spedisce email. Chi ha dimenticato la password la recupera da solo. Chi riceve un
invito dimostra di possedere l'email prima che l'account sia utilizzabile, così finisce il
rischio accettato delle email non verificate negli inviti all'app e alla famiglia. Il
referente operativo riceve un'email quando il job settimanale è in ritardo o abbandonato e
quando l'esportazione notturna fallisce.

## Stato di partenza (17 ottobre 2026)

Passi esterni già fatti dall'utente e dal coordinatore: dominio `cosasimangia.app`
verificato in Resend (DKIM, MX e SPF su `send.`, DMARC `p=none`); *Site URL* e
*Redirect URLs* di Supabase Auth sul nuovo dominio; SMTP personalizzato di Supabase Auth
su Resend con mittente `Cosa si mangia <noreply@cosasimangia.app>` e una chiave dedicata
di solo invio; prova con un magic link riuscita. Oggi l'accesso è con email e password,
gli inviti all'app e alla famiglia fanno scegliere la password sulla pagina dell'invito e
l'account nasce già confermato (`email_confirm: true`); il cambio della password dal
Profilo funziona senza email.

## Vincoli già decisi (specifica principale)

- Il link nell'email serve **solo a scegliere o recuperare la password**, mai a entrare:
  apre Safari una volta, poi si entra nell'app (anche la PWA installata) con email e
  password. Niente magic link per l'accesso.
- Si passa al link nell'email **senza rifare il flusso di A**: cambia solo come la persona
  riceve il link e dimostra di possedere l'email; prenotazione e chiusura restano uguali.
  Se serve il link di Supabase per scegliere la password, la creazione dell'account avrà
  una variante senza password (sezione 7, «Dopo l'attività D»).
- Email operative inviate dal server via API di Resend; destinatario configurato in modo
  esplicito: essere curatore o amministratore non basta a riceverle (sezione 4).
- Limiti di Resend sul piano gratuito: 100 email al giorno, 3.000 al mese; SMTP di Supabase
  da 30 all'ora.
- Nei log mai password, token, email né corpi di richiesta e risposta.

## Decisioni da prendere nel brainstorming

Quelle di prodotto le porti all'utente tramite il coordinatore, una alla volta, con
un'opzione consigliata. Le altre le decidi tu nella spec, motivandole.

- **Verifica dell'email negli inviti** (prodotto):
  - invito all'app: l'app spedisce l'email con il link (e chi invita smette di mandarlo a
    mano) oppure il link resta da condividere e la verifica avviene dopo, sulla pagina;
  - invito alla famiglia, riusabile e senza email: come dimostra il possesso dell'email
    chi crea un account da lì (link per scegliere la password, codice da inserire sulla
    pagina o altro), e cosa vede nel frattempo;
  - chi ha già un account e accetta un invito: serve una verifica o no;
  - account esistenti creati prima di D con email non verificata: si lasciano come sono,
    si chiede una verifica al prossimo accesso o altro.
- **Password dimenticata** (prodotto e tecnica): dove sta il comando (pagina di accesso),
  cosa dice la pagina dopo l'invio senza rivelare se l'email ha un account, pagina di
  arrivo per la password nuova (percorso, regole uguali al cambio dal Profilo, almeno 8
  caratteri), cosa succede alle altre sessioni. Verifica con Context7 le API correnti di
  Supabase Auth (`resetPasswordForEmail`, `verifyOtp`, `exchangeCodeForSession`, flusso
  PKCE o token hash) e come il link si comporta quando l'email si apre sull'iPhone con la
  PWA installata.
- **Testi delle email** (prodotto): template di Supabase Auth in italiano e inglese
  britannico, nel tono del design; come si sceglie la lingua (Supabase ha un template per
  tipo: metadati dell'utente nel template o altra via); dove vivono i template
  (`supabase/templates/` e `config.toml` in locale; in produzione la spec elenca i passi
  per la dashboard o la Management API, che fa il coordinatore).
- **Email operative:**
  - chiamata a Resend dal Worker con `fetch`, senza SDK se basta (la dipendenza va
    motivata);
  - segreto nuovo per la chiave API del server, distinto da quello di Supabase Auth, e
    destinatario come variabile o segreto: nomi e passi esterni nella spec;
  - eventi esatti che spediscono un'email, frequenza e niente doppioni (un job abbandonato
    non deve mandare un'email a ogni tentativo orario), comportamento se Resend non
    risponde (il job non fallisce per l'email);
  - contenuto: niente dati delle famiglie oltre il necessario (sezione 2).
- **Abusi e limiti:** richieste ripetute di «password dimenticata» o di inviti verso la
  stessa email, rispetto ai 100 invii al giorno e ai limiti di Supabase; serve un
  limitatore del Worker (come quelli già presenti) o bastano quelli di Supabase.
- **MCP:** cosa espone (per esempio l'invio dell'email di un invito all'app), cosa resta
  `webOnly` motivato (la «password dimenticata» non ha senso per un agente collegato).
- **Una sola PR** per tutta l'attività, salvo che la spec motivi una divisione (per
  esempio email operative separate dagli inviti); in quel caso decide il coordinatore.

## Vincoli dal coordinamento

- **Dipendenze:** al minimo; ogni dipendenza nuova dice cosa sostituisce e cosa costa
  farne a meno, e la approva il coordinatore.
- **Infrastruttura:** non crei né cambi segreti, chiavi Resend, template o impostazioni
  di Supabase in produzione. La spec elenca i passi esterni per il runbook del
  coordinatore (segreti del Worker, template e opzioni di Auth come «Secure password
  change», *Redirect URLs* nuovi, eventuale configurazione dei limiti).
- **Migrazioni** solo additive (sezione 1); dichiarale nella spec e controlla che la
  versione non collida con quelle già su `main`.
- **Test:**
  - pgTAP per lo schema, se cambia;
  - server: invio delle email operative con Resend simulato (eventi, niente doppioni,
    Resend che fallisce), inviti con la verifica dell'email, permessi;
  - SPA sullo stack locale: password dimenticata e inviti fino in fondo, leggendo le email
    dalla casella di prova dello stack Supabase locale (Mailpit/Inbucket);
  - verifica dell'interfaccia con la skill agent-browser, anche a larghezza da telefono.

  Prove locali senza la produzione (`AGENTS.md`, «Regole per tutti», e
  `protocollo-worker.md`): nessuna email di prova verso indirizzi veri, nessuna chiave
  Resend di produzione. Annota nella spec cosa resta da provare a mano sull'iPhone (link
  aperto dall'app Mail con la PWA installata, ritorno nella PWA dopo la password nuova).
- **Testi** nuovi in italiano e inglese britannico.
- **Rilascio in produzione:** non lo fai tu; lo prepara il coordinatore dopo il merge.

## Fuori perimetro

- Accesso con Google, magic link per entrare, notifiche push.
- Email di prodotto alle famiglie (menu pronto, promemoria della revisione, lista della
  spesa): non sono nella specifica; se ti sembrano utili annotale come idea nella spec,
  senza realizzarle.
- Cambio dell'email dell'account.
