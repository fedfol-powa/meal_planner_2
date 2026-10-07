# Prototipo, giro 6: MCP e Amministrazione dell'app — piano

> **Esecuzione:** inline, senza subagenti e senza tappa intermedia (metodo dei giri
> precedenti): si sviluppa tutto il giro, poi review sull'output su iPhone. I passi
> usano le caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** rendere provabili su iPhone i percorsi 7 e 8. Per MCP (specifica,
sezione 13, e parte funzionale "Usare l'app attraverso il proprio agente") servono la
pagina di collegamento per i quattro client, la schermata di autorizzazione nel browser
e gli agenti collegati. Per l'amministrazione (sezioni 7 e 8, parte funzionale
"Amministrare l'app") servono utenti, ruoli, nomina di amministratori, inviti all'app,
cancellazione degli utenti e ripristino dell'intero ricettario da backup.

**Architettura:** quella dei giri precedenti (`design/percorsi.md`, "Architettura del
prototipo"). Nuove operazioni simulate in `src/lib/operations/admin.ts`,
`app-invitations.ts`, `catalogue-backup.ts` e `agents.ts`. Ricevono il contesto
(utente e canale `web`/`mcp`), controllano il ruolo `app_admin` e restituiscono errori
strutturati. Le operazioni con regole diverse per canale, come la cancellazione di un
utente che eliminerebbe una famiglia, si provano con test sul canale `mcp`. Nessuna
interfaccia simula l'agente.

**Stack:** invariato (SvelteKit, Svelte 5 runes, TypeScript, Vitest). Nessuna nuova
dipendenza. I comandi e le configurazioni dei client si verificano con Context7 e con
la documentazione dei client prima di scriverli nella pagina, e restano marcati come
esempi.

**Riferimenti da leggere prima di iniziare:** specifica, sezioni 2 (`user_roles`,
`app_invitations`), 7, 8 ("Backup e ripristino", "Recupero su due livelli"), 13, 15
("Utenti e inviti", "Cancellazione", "Backup e ripristino", "MCP") e 17 (R1);
`design/percorsi.md`; `design/design.md` e `design/index.html`; `prototype/README.md`.

## Decisioni della preparazione (7 ottobre 2026, provvisorie)

Registrate come provvisorie in `design/percorsi.md`. Entrano nella specifica solo alla
chiusura del giro, dopo averle viste funzionare.

1. **Un solo giro** per i percorsi 7 e 8.
2. **Nessun agente simulato.** Per MCP il prototipo mostra solo la pagina di
   collegamento con le configurazioni, la schermata di autorizzazione che il browser
   apre quando un agente chiede l'accesso, e l'elenco degli agenti collegati con
   «Scollega». Le operazioni simulate restano la bozza di quelle condivise con MCP.
3. **Inviti all'app con ruoli:** l'amministratore indica un'email e, se vuole, i ruoli
   da assegnare all'accettazione (curatore, amministratore dell'app). Il link vale 7
   giorni, si può revocare e si usa una sola volta, solo con quell'email. L'iscrizione
   resta aperta e l'invito non fa entrare in nessuna famiglia.
4. **Ripristino del ricettario da backup:** le ricette presenti nel backup tornano
   com'erano, pubblicate come nuova versione, così lo storico resta intero. Quelle nate
   dopo il backup vengono archiviate, non cancellate, e i pasti che le citano restano
   leggibili. Prima di confermare si vede un'anteprima con i numeri.

**Default proposti nel piano** (da confermare approvando il piano):

- **Ingressi dal Profilo:** la sezione segnaposto «In arrivo» lascia il posto a
  «Collega un agente» per tutti, in Account, e alla sezione «Amministrazione dell'app»
  con Utenti, Inviti e Backup del ricettario, solo per gli `app_admin`.
- **Pagina di collegamento** (`/profile/agents`):
  - cosa si può fare tramite agente e quali operazioni dipendono dal ruolo;
  - indirizzo MCP con «Copia», dichiarato come indirizzo d'esempio;
  - un percorso per client: Claude Code e Codex CLI con comando o configurazione da
    copiare, ChatGPT e Claude Desktop con i passaggi nell'interfaccia;
  - accesso nel browser, riautenticazione, esempio per provare il collegamento
    («Cosa mangiamo stasera?»);
  - per i curatori, un esempio del flusso di curatela e un collegamento alle istruzioni
    servite all'agente (`curation-guide.ts`);
  - la nota che le famiglie si eliminano solo nell'app;
  - in fondo, «Agenti collegati»: client, data del collegamento, ultimo uso e
    «Scollega» con conferma. Scollegare revoca l'accesso, e l'agente dovrà chiedere
    una nuova autorizzazione.
- **Autorizzazione** (`/authorize?client=…`, simile a un consenso OAuth): «Claude Code
  chiede di accedere ad App Famiglia», account in uso con «Non sei tu?», cosa potrà
  fare (le stesse azioni dell'app con i tuoi ruoli, tranne eliminare famiglie),
  «Consenti» e «Annulla». Dopo il consenso: «Collegato. Torna a Claude Code». Senza
  accesso si passa prima dal login del giro 4. Si apre dal pannello Prova.
- **Amministrazione** (`/admin`): una pagina con le sezioni Utenti, Inviti all'app e
  Backup del ricettario, a schede come le impostazioni.
  - **Utenti:** ricerca per nome o email; ogni riga mostra nome, email, chip dei ruoli
    e numero di famiglie. Il dettaglio (`/admin/users/[id]`) ha gli interruttori
    Curatore e Amministratore dell'app. La nomina di un amministratore chiede
    conferma. Togliere il ruolo all'ultimo amministratore è bloccato, con il motivo.
    Il dettaglio mostra anche le famiglie (nome e ruolo, nessun contenuto) e «Cancella
    utente».
  - **Cancellazione di un utente** (`/admin/users/[id]/delete`): stessa pagina della
    cancellazione dell'account del giro 4 in versione amministratore, con l'esito
    famiglia per famiglia, la scelta del successore e il blocco sull'ultimo
    amministratore dell'app. Non si può cancellare sé stessi da qui: si usa il proprio
    account.
  - **Inviti all'app:** «Invita» apre un foglio con email e ruoli facoltativi e
    restituisce un link da copiare o condividere (l'email non parte, come per gli
    inviti alla famiglia). L'elenco mostra stato (in attesa, accettato, scaduto,
    revocato), ruoli, autore e scadenza, con «Copia link» e «Revoca». La pagina
    dell'invito (`/invite/app/[token]`) mostra chi invita e i ruoli. Chi la apre senza
    account si iscrive, poi conferma; con un'email diversa vede un messaggio chiaro.
    Accettando riceve i ruoli e, se non ha famiglie, arriva al benvenuto del giro 4.
  - **Backup del ricettario:** elenco delle copie con data e numero di ricette. Una
    copia apre l'anteprima: ricette che tornano alla versione del backup, ricette nate
    dopo che saranno archiviate, ricette invariate. L'anteprima spiega che bozze, menu,
    voti, famiglie e utenti non cambiano e che i pasti passati restano sulla versione
    mangiata (R1). Gli ingredienti del catalogo tornano come nel backup; quelli nati
    dopo restano, perché citati da ricette archiviate. Si conferma con
    `ConfirmDanger`. Prima di ripristinare si crea in automatico una copia «Prima del
    ripristino», così l'operazione si può annullare con un altro ripristino.
- **Offline simulato:** amministrazione e collegamento in sola consultazione.

## Varianti da scegliere su iPhone

Nel pannello Prova, da tenere o togliere nella review:

- **Client nella pagina di collegamento:** (a) controllo a schede in alto (Claude Code,
  Codex, ChatGPT, Claude Desktop) con un client per volta; (b) elenco dei quattro
  client che si apre a fisarmonica.

## Simulazione dei dati

Dichiarata nell'interfaccia dove serve e in `design/percorsi.md`.

- **Agenti collegati:** Federico ha Claude Code (ultimo uso oggi) e ChatGPT (ultimo uso
  due settimane fa); Lucia ha Claude Desktop.
- **Inviti all'app:** uno in attesa per `chiara@example.com` con ruolo di curatrice, uno
  scaduto e uno accettato (Lucia, curatrice).
- **Backup:** copie giornaliere degli ultimi 7 giorni e settimanali delle 4 settimane
  precedenti, ricavate dallo storico delle versioni. Frequenza e conservazione sono
  dimostrative: la voce resta aperta nella sezione 15. Il backup del 4 ottobre precede
  la versione 2 degli hamburger di cavallo, quindi l'anteprima mostra almeno una
  ricetta che torna indietro.
- **Pannello Prova:** «Un agente chiede l'accesso» (scelta del client) e «Apri
  l'invito all'app demo», oltre alla variante del giro.

## Modello simulato

- `ConnectedAgent { id, userId, client, connectedAt, lastUsedAt }`; scollegare lo
  rimuove. La cancellazione di un account rimuove anche i suoi agenti.
- `AppInvitation { token, email, roles, createdBy, createdAt, expiresAt, status,
  acceptedBy }`, con `status` = `pending` | `accepted` | `revoked`. Lo stato scaduto si
  calcola dalla data simulata.
- `CatalogueBackup { id, takenAt, kind: 'daily' | 'weekly' | 'pre_restore' }`. Il
  contenuto non è una copia: si ricava dallo storico delle versioni (per ogni ricetta,
  l'ultima versione pubblicata prima di `takenAt`) e dallo stato di archiviazione
  registrato. Il ripristino pubblica le nuove versioni con `restoredFrom` che indica
  il backup.
- `deleteUser` riusa la logica di `deleteAccount` (piano, successori, ultimo
  amministratore). Sul canale `mcp`, se eliminerebbe una famiglia, restituisce
  `web_only` con l'URL della pagina.

## Struttura dei file

- `src/lib/domain/types.ts`: tipi sopra; `DemoDatabase` con `connectedAgents`,
  `appInvitations`, `catalogueBackups`.
- `src/lib/operations/admin.ts` (+ test): `listUsers`, `getUserAdmin`, `setUserRole`,
  `getUserDeletionPlan`, `deleteUser`. La parte comune con `account.ts` va in una
  funzione condivisa.
- `src/lib/operations/app-invitations.ts` (+ test): `listAppInvitations`,
  `createAppInvitation`, `revokeAppInvitation`, `getAppInvitation`,
  `acceptAppInvitation`.
- `src/lib/operations/catalogue-backup.ts` (+ test): `listCatalogueBackups`,
  `previewCatalogueRestore`, `restoreCatalogue`.
- `src/lib/operations/agents.ts` (+ test): `listConnectedAgents`, `authorizeAgent`,
  `disconnectAgent`; testi dei client in `src/lib/mcp-clients.ts`.
- `src/lib/demo-data/seed.ts`: agenti, inviti e backup demo; versione dello stato
  salvato incrementata.
- Rotte: `/profile/agents`, `/authorize`, `/admin`, `/admin/users/[id]`,
  `/admin/users/[id]/delete`, `/admin/backups/[id]`, `/invite/app/[token]`.
- Componenti: `CopyField` (testo o comando con «Copia»), `ClientGuide` (le due
  varianti), `RoleToggles`, `InviteSheet`, `RestorePreview`; riuso di `PageHeader`,
  `BottomSheet`, `ConfirmDanger`, `StateNotice`, `ActionMenu`, `ShareLinkSheet` e
  della pagina di cancellazione dell'account.
- Testi it-IT ed en-GB in `src/lib/i18n/` (nuovo `messages-admin.ts` se `messages.ts`
  cresce troppo).

## Attività

### Attività 1: decisioni nei documenti e branch

- [x] Branch `prototipo-giro-6` da `main`.
- [x] `design/percorsi.md`: sezione "Giro 6" con perimetro, decisioni provvisorie,
      variante e simulazione; tabella dei percorsi aggiornata (7 e 8 nel giro 6).
- [x] Commit del piano e dei documenti.

### Attività 2: modello e dati demo

- [x] Tipi, seed con agenti, inviti e backup; versione dello stato salvato.
- [x] Test sui dati: ogni backup ricostruisce un ricettario che supera la validazione
      di pubblicazione; esiste un backup con almeno una ricetta diversa da oggi.
- [x] Commit.

### Attività 3: operazioni (test prima)

- [x] Permessi: solo `app_admin` per amministrazione, inviti e backup; ogni utente per
      i propri agenti; offline in sola lettura.
- [x] Ruoli: assegnazione e revoca; blocco dell'ultimo amministratore, anche su sé
      stessi e via `mcp`.
- [x] Cancellazione di un utente: successori, famiglia eliminata con l'unico membro,
      `web_only` con URL via `mcp`, agenti e link d'invito dell'utente revocati.
- [x] Inviti all'app: creazione, scadenza, revoca, email diversa, uso singolo, ruoli
      assegnati all'accettazione.
- [x] Backup: anteprima coerente con il ripristino; ripristino come nuove versioni,
      archiviazione delle ricette successive, copia «Prima del ripristino», menu,
      voti e bozze invariati, pasti passati sulla versione mangiata.
- [x] Agenti: autorizzazione, elenco, scollegamento; rimossi con l'account.
- [x] Commit.

### Attività 4: viste

- [x] Verifica dei comandi e delle configurazioni dei quattro client (Context7 e
      documentazione dei client); testi marcati come esempi.
- [x] Profilo: «Collega un agente» e sezione «Amministrazione dell'app».
- [x] Pagina di collegamento con le due varianti e gli agenti collegati;
      autorizzazione.
- [x] Amministrazione: utenti, dettaglio e ruoli, cancellazione, inviti, pagina
      dell'invito, backup con anteprima e ripristino.
- [x] Pannello Prova: richiesta di collegamento, invito demo, variante.
- [x] Testi it-IT ed en-GB.
- [x] Commit.

### Attività 5: verifica e review

- [x] `npm test`, `npm run check`; prova nel browser a 320, 390 e 1440 px, italiano e
      inglese, come amministratore e membro (offline solo nei test delle operazioni).
- [ ] Confronto visivo con `design/index.html`: non fatto in modo diretto; le pagine
      riusano schede, righe, chip, pulsanti e fogli già approvati.
- [x] `design/percorsi.md`: rotte, componenti, operazioni, domande per la review;
      README del prototipo.
- [x] `npm run preview:lan` e review dell'utente su iPhone; esito qui e in
      `design/percorsi.md`. Alla chiusura, decisioni nella specifica (sezioni 2, 7, 8,
      13, parti funzionali "Usare l'app attraverso il proprio agente" e "Amministrare
      l'app", 15 "Utenti e inviti", "Cancellazione", "Backup e ripristino", "MCP" e 17
      per R1).

## Domande per la review (bozza)

1. Variante: client a schede o a fisarmonica.
2. La pagina di collegamento è comprensibile per chi non è tecnico? Ci sono troppi
   contenuti?
3. Autorizzazione: chiara su chi si collega e cosa potrà fare?
4. Amministrazione: le tre sezioni in una pagina bastano su iPhone?
5. Inviti all'app: uso singolo e legame con l'email sono giusti, o serve un link
   riusabile?
6. Ripristino del catalogo: l'anteprima si capisce? La copia automatica «Prima del
   ripristino» basta come annullamento?

## Fuori dal giro

Agente o conversazioni simulate; server MCP reale, OAuth reale e verifica pratica dei
client (design tecnico prima dell'implementazione); email reali; frequenza e
conservazione reali dei backup; ingresso dell'amministratore dell'app nelle famiglie;
consegna delle esportazioni via MCP.

## Esito dell'esecuzione (7 ottobre 2026)

Sviluppo completato in questa sessione senza subagenti: 250 test e controllo dei tipi
verdi. Prova nel browser a 320, 390 e 1440 px, in italiano e in inglese, come
amministratore e come membro: pagina di collegamento nelle due varianti, autorizzazione e
scollegamento, nomina di un amministratore e rinuncia al ruolo, cancellazione di un
utente con successore, invito all'app con email già registrata e nuova, iscrizione e
accettazione con ruolo, ripristino del backup del 5 ottobre e annullamento con la copia
«Prima del ripristino». Correzioni emerse dalla prova: comandi spezzati a capo, schede
dei client su due righe, singolari, virgolette inglesi, «Profilo» non attivo in
`/admin`, avviso del ripristino al plurale sbagliato. Il comportamento offline non è
stato provato nel browser: è coperto dai test delle operazioni e dai pulsanti
disattivati. Scelte prese durante lo sviluppo e domande per la review in
`design/percorsi.md`, "Giro 6".

## Esito della review (7 ottobre 2026)

Approvato dall'utente dopo la prova su iPhone. Modifiche: tolto il paragrafo
introduttivo della pagina di collegamento; client a fisarmonica, tolta la variante a
schede. Tutto il resto confermato. Decisioni riportate nella specifica (sezioni 2, 7, 8,
13, 14, 15, 16 e 17, parti funzionali "Usare l'app attraverso il proprio agente" e
"Amministrare l'app") e in `design/design.md`; esito in `design/percorsi.md`, "Giro 6".

