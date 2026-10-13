# Brief W9: Inviti all'app e famiglie nuove (ondata 3, attività A)

Segui `progetto/coordinamento/protocollo-worker.md` e, per la forma del lavoro verticale,
`progetto/coordinamento/brief/ondata2-comune.md` (proprietà dei file, migrazioni, MCP,
design, interfacce decise: valgono anche qui).

- **Branch:** `ondata3/inviti-app` (da `origin/main`) · **Worktree:** `.worktrees/inviti`
- **Spec e piano:** `progetto/superpowers/specs/2026-10-13-inviti-app.md`,
  `progetto/superpowers/plans/2026-10-13-inviti-app.md`
- **Specifica principale:** Parte 1 («Chi la usa», «Amministrare l'app»), sezioni 1, 2
  (`app_invitations`, ruoli globali, famiglie), 7 (tutta), 13 (parità MCP), 14, 15 e 16.
  Piano generale: «Ordine dell'ondata 3» e «Interfacce decise».
- **Percorsi e prototipo:** `design/percorsi.md`; quarto giro (primo accesso, «Crea la tua
  famiglia», wizard) e sesto giro (pagina `/admin`, inviti all'app, `/invite/app/<token>`)
  in `prototype/`.

La sezione 7 e il piano generale sono in aggiornamento nella PR #44, non ancora unita: la
decisione che conta per te è sotto. Leggila nel branch `traguardo/specifica-w7-w8`
(`git show origin/traguardo/specifica-w7-w8:progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`).

## Contesto e decisione dell'utente (13 ottobre 2026)

L'app è in produzione su `https://cosasimangia.qunidi.workers.dev` per una famiglia; gli
account oggi si creano a mano dalla dashboard di Supabase e le iscrizioni libere sono
spente (restano spente). L'utente vuole far entrare una persona nuova che si crea la
propria famiglia.

**Niente email per ora:** il DNS di `qunidi.it` non si può modificare, quindi Resend non
può verificare il dominio di invio. Fino ad allora l'invito all'app si accetta sulla
pagina `/invite/app/<token>`: la persona scrive l'email dell'invito (deve coincidere) e
sceglie la password; **il server crea l'account già confermato** e la persona entra
subito con email e password. L'amministratore copia il link e lo manda a mano. Il
possesso del link vale come prova, con i limiti già decisi: un'email, uso singolo,
7 giorni, revoca, un nuovo invito alla stessa email sostituisce quello in attesa, nessun
invito a un'email che ha già un account. «Password dimenticata» e link nell'email
**non** sono in questa attività (attività D, quando c'è il dominio): progetta in modo che
il passaggio al link via email non rifaccia il flusso.

## Obiettivo

Federico (`app_admin`) crea dall'app un invito all'app per un'email, copia il link e lo
manda; la persona apre il link anche dall'iPhone, sceglie la password, entra, dà il suo
nome al primo accesso, crea la sua famiglia con il wizard minimo e trova il menu pronto
(generazione pigra). Chi ha già una famiglia può crearne un'altra dal Profilo.

## Perimetro

1. Schema: `app_invitations` come da sezione 2 (token non conservato in chiaro se lo
   ritieni opportuno: decidilo nella spec), RLS e test pgTAP.
2. Operazioni del contratto, gestori e strumenti MCP: creare, elencare, revocare un
   invito all'app (solo `app_admin`); leggere un invito senza accesso (chi invita,
   ruoli, stato); accettarlo creando l'account; creare una famiglia (chi la crea diventa
   `family_admin`; nome, sistema di misura, fuso orario dal browser come da sezione 2).
   Verifica nella sezione 13 quali sono MCP e quali `webOnly`, e motiva.
3. Web: `/invite/app/<token>` (anche con un altro account aperto: propone di uscire e
   rientrare), primo accesso con il solo nome se manca, «Crea la tua famiglia» per chi non
   ne ha, «Crea un'altra famiglia» nel Profilo, pagina `/admin` raggiungibile dal Profilo
   solo per `app_admin` con la **sola** sezione Inviti all'app (elenco con stato e
   scadenza, nuovo invito con ruoli facoltativi, copia del link, revoca). Le sezioni
   Utenti e Ripristino arrivano dopo: niente segnaposto.
4. Il Profilo oggi nasconde i comandi dell'ondata 3: mostra solo quelli di questa
   attività. Inviti alla famiglia, rimozione, uscita, ruoli, eliminazioni e cancellazione
   sono dell'attività C.

## Vincoli dal coordinamento

- **Creazione dell'account dal server.** Il Worker oggi parla con Postgres come
  `app_server` tramite Hyperdrive e con Supabase Auth con la chiave pubblicabile; non ha
  chiavi di amministrazione. Verifica con Context7 l'API di amministrazione di Supabase
  Auth (creazione di un utente già confermato con password, con le iscrizioni spente;
  chiavi «secret» nuove contro `service_role`) e scegli il meccanismo. Il coordinatore
  propende per: una chiamata `admin/users` dal Worker con email confermata e password,
  dopo aver validato l'invito, in un modulo dedicato che è l'unico a usare la chiave
  segreta; password mai registrata nei log né salvata; accettazione ripetibile senza
  doppioni se la creazione riesce e il resto fallisce; poi la SPA entra con
  `signInWithPassword`. Niente scritture dirette nello schema `auth`. Se proponi
  altro, motivalo.
- **Segreto nuovo nel Worker:** è una risorsa esterna. Lo stack locale usa la chiave
  locale; per la produzione scrivi nella spec il nome del segreto e il passo per
  l'utente (`wrangler secret put` da lui, mai il valore in conversazione) e fermati con
  `STATO: DOMANDA` quando serve. Non toccare le impostazioni di Supabase in produzione.
- **Sicurezza del link:** token lunghi e casuali; email da ridigitare confrontata senza
  rivelare se un'email ha già un account a chi non ha il link; stessi messaggi per
  invito scaduto, revocato o usato (chiedi un link nuovo); lunghezza minima della
  password 8 come la SPA. Valuta i limiti di frequenza sull'accettazione.
- **Ruoli globali dell'invito** assegnati all'accettazione nella stessa transazione
  dell'uso dell'invito.
- **Interfacce per B e C:** nella spec una sezione «Interfaccia per B e C» con ciò che
  le attività successive riusano: scheletro di `/admin` e controllo `app_admin`, modulo
  che crea l'account da un invito (C lo userà per gli inviti alla famiglia), operazione
  di creazione della famiglia. Il coordinatore la registra nel piano generale.
- **Migrazioni** solo additive (la PWA installata e la produzione vanno avanti durante il
  rilascio; sezione 1, «Modifiche solo additive»).
- **Test:** pgTAP per schema e policy; server per le operazioni (invito valido, scaduto,
  revocato, usato, email diversa, email con account esistente, non `app_admin`,
  accettazione ripetuta); SPA sullo stack locale per il percorso completo da invito a
  menu della famiglia nuova. Verifica l'interfaccia con la skill agent-browser, anche a
  larghezza da telefono. Annota nella spec cosa resta da provare a mano sull'iPhone.
- Rilascio in produzione: **non lo fai tu**. Lo fa il coordinatore dopo il merge.
