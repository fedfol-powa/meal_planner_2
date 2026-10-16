# Brief W11: Gestione della famiglia (ondata 3, attività C)

Segui `progetto/coordinamento/protocollo-worker.md` e, per la forma del lavoro verticale,
`progetto/coordinamento/brief/ondata2-comune.md` (proprietà dei file, migrazioni, MCP,
design, interfacce decise: valgono anche qui).

- **Branch:** `ondata3/gestione-famiglia` · **Worktree:** `.worktrees/famiglia`
- **Spec e piano:** `progetto/superpowers/specs/2026-10-16-gestione-famiglia.md`,
  `progetto/superpowers/plans/2026-10-16-gestione-famiglia.md`
- **Specifica principale:** Parte 1 («Chi la usa», «Amministrare l'app», «Usare l'app
  attraverso il proprio agente»), sezioni 1, 2 (`family_invitations`, `family_removals`,
  appartenenze, voti, tracce delle modifiche), 4 (job della famiglia), 7 (inviti alla
  famiglia, rimozione, uscita, eliminazione della famiglia, cancellazione dell'account,
  ultimo amministratore dell'app), 8 (bozze e attribuzioni nel ricettario), 13 (parità
  MCP ed esiti che rimandano all'app), 14, 15 e 16. Piano generale: «Ordine dell'ondata
  3» (riga C) e «Interfacce decise», in particolare «Inviti all'app, interfaccia per B e
  C definitiva» e «Amministrazione utenti, interfaccia per C».
- **Spec da riusare:** `specs/2026-10-13-inviti-app.md` (sezione 7, «Per C»: ruolo
  `public`, limitatori, token, `createInvitedAccount`, prenotazione → creazione →
  chiusura) e `specs/2026-10-15-amministrazione-utenti.md` (sezione 6: lucchetto
  `app_admin_roles`, comando in `UserPage.tsx`, `users.get`).
- **Percorsi e prototipo:** `design/percorsi.md` (quarto giro «Famiglia e account»,
  sesto giro per la cancellazione dall'amministrazione) e in `prototype/` le rotte
  `profile/family`, `profile/account`, `profile/preferences`, `invite/[token]`,
  `admin/users`.

## Obiettivo

Un amministratore della famiglia invita altre persone con un link, anche chi non ha un
account; gestisce membri e ruoli; chi vuole esce dalla famiglia. Un amministratore della
famiglia può eliminarla dall'app. Ogni utente può cancellare il proprio account, e un
amministratore dell'app può cancellare un altro utente dal dettaglio di B. Oggi nessuna
di queste cose si fa dall'app: si fanno con SQL in produzione o non si fanno.

## Perimetro

1. **Inviti alla famiglia:** tabelle `family_invitations` e `family_removals` (sezione
   2); creazione, elenco con autore e scadenza, revoca dalla pagina dei membri; i membri
   vedono a chi chiederlo. Pagina pubblica dell'invito (famiglia e chi invita), conferma
   esplicita per entrare; chi non ha un account lo ottiene con lo schema di A; chi fa già
   parte della famiglia non cambia niente; rientro dopo la rimozione bloccato per i link
   creati prima (`family_removals`); stesso messaggio per link non validi. «Invita la
   famiglia» nella scheda di benvenuto del Menu e il rimando agli inviti alla famiglia
   nello stato «Non fai ancora parte di una famiglia».
2. **Membri e ruoli:** rimozione di un membro con conferma che ne spiega gli effetti
   (voti fuori dalla media, tracce come «ex membro»); cambio di ruolo `family_admin` ↔
   membro, con l'ultimo amministratore della famiglia protetto; uscita libera per i
   membri, l'ultimo amministratore con altri membri nomina il successore nello stesso
   passaggio, l'unico membro deve eliminare la famiglia.
3. **Eliminazione della famiglia:** solo dall'app web, solo `family_admin`; pagina
   `/profile/family/delete?family=<id>` con il riepilogo del prototipo; dati, job e
   accessi della famiglia rimossi, il resto invariato (sezione 7). Via MCP l'esito
   rimanda alla pagina, senza eliminare.
4. **Cancellazione dell'account** (dalle Preferenze) **e degli utenti**
   (dall'amministrazione, `/admin/users/$userId/delete`, stessa pagina in terza persona;
   per il proprio account il rimando alle Preferenze). Regole della sezione 7: successori
   per famiglia scelti sulla pagina, famiglie con un solo membro eliminate, ultimo
   amministratore dell'app protetto, accessi revocati compresi gli agenti MCP, link
   d'invito attivi revocati, ricette pubblicate che restano, nessuna cancellazione
   parziale. Via MCP: se la cancellazione elimina almeno una famiglia, solo il rimando
   alla pagina dell'app.
5. Ogni operazione con il suo strumento MCP, salvo `webOnly` motivato (sezione 13).

## Decisioni da prendere nel brainstorming

Quelle di prodotto le porti all'utente tramite il coordinatore; le altre le decidi tu
nella spec, motivandole.

- **Account nato da un invito alla famiglia** (prodotto): l'invito è riusabile e non è
  legato a un'email, quindi la regola di A (un'email, uso singolo) non si applica
  com'è. La sezione 7 rimanda la regola equivalente a questo lavoro. Proponi le opzioni
  con i rischi (chi ha il link può creare account finché vale) e una raccomandazione.
- **Attribuzioni e tracce dopo una rimozione o una cancellazione** («ex membro»), voti,
  inviti aperti, bozze condivise del ricettario e contributi pubblicati (sezione 7: «si
  completa nel design»).
- **Ordine della cancellazione dell'account:** transazione nel database (lucchetto
  `app_admin_roles`, successori, famiglie, dati personali) e cancellazione in Supabase
  Auth con la chiave segreta da `server/src/accounts/`, che non sono atomiche fra loro:
  descrivi come eviti stati parziali e come si riprende un tentativo interrotto, sul
  modello prenotazione → creazione → chiusura di A.
- **Revoca degli accessi:** sessioni e agenti MCP dell'utente cancellato (tabelle
  `oauth_*` di Supabase, `app.connected_agents()`); verifica con Context7 cosa fa
  l'eliminazione di un utente con l'API di amministrazione di Auth.
- **Numero di agenti collegati** nella pagina di cancellazione (B l'ha tolto dal
  dettaglio rimandandolo qui): includerlo o no, motivando.
- **Una sola PR** (decisione dell'utente del 16 ottobre 2026): spec, piano e PR unici
  per tutta l'attività, così le regole comuni (successore, «ex membro», lucchetti)
  restano coerenti. Il piano ordina i compiti in modo che ogni commit lasci i test
  verdi.

## Vincoli dal coordinamento

- **Ultimo amministratore dell'app:** la cancellazione di un account, proprio o di un
  altro utente, prende `pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))`
  nella stessa transazione e rifiuta con `last_app_admin` (`P0A08`); sotto il lucchetto
  ricontrolla l'autorizzazione di chi chiama (`app_admin` per cancellare un altro
  utente; nessun ruolo globale richiesto per il proprio account). Transazioni `read
  committed`. Test di concorrenza come in `server/test/users-locks.test.ts`.
- **Ultimo amministratore della famiglia:** stessa garanzia sotto concorrenza (due
  amministratori che escono o si retrocedono a vicenda nello stesso momento non lasciano
  una famiglia con membri senza amministratore); scegli il meccanismo nella spec e
  dimostralo con un test.
- **Chiave segreta:** resta letta solo da `server/src/accounts/`; la cancellazione in
  Auth si aggiunge lì. Niente scritture dirette nello schema `auth`.
- **Pagina pubblica dell'invito:** ruolo `public`, `mcp: false`, limitatori, funzioni
  `security definer` per impronta del token, token nel frammento, nessun dato della
  famiglia oltre a nome e chi invita (interfaccia di A).
- **Dati sul dispositivo:** un accesso revocato a una famiglia ne toglie subito i dati
  dal dispositivo (sezione 1); vale per rimozione, eliminazione della famiglia e
  cancellazione dell'account.
- **Migrazioni** solo additive (sezione 1, «Modifiche solo additive»); dichiara nella
  spec tabelle, colonne e funzioni nuove.
- **Test:** pgTAP per schema e funzioni; server per le operazioni (permessi, ultimo
  amministratore della famiglia e dell'app, idempotenza, invito scaduto, revocato o
  dopo una rimozione, cancellazione ripresa dopo un'interruzione, rimando MCP); SPA
  sullo stack locale per invito → account → famiglia, uscita con successore,
  eliminazione della famiglia e cancellazione dell'account. Verifica l'interfaccia con
  la skill agent-browser, anche a larghezza da telefono. Prove locali senza la
  produzione (`protocollo-worker.md`, «Prove sullo stack locale»). Annota nella spec cosa
  resta da provare a mano sull'iPhone.
- **Collaudo in produzione:** l'utente tiene l'account e la famiglia di prova creati con
  A per collaudare C: la spec dice come eliminarli con i comandi di C.
- Rilascio in produzione: **non lo fai tu**. Lo fa il coordinatore dopo il merge.

## Fuori perimetro

- Email (attività D): gli inviti alla famiglia si condividono a mano, come quelli
  all'app.
- Google, ripristino del ricettario, foto, PDF della spesa (attività E).
