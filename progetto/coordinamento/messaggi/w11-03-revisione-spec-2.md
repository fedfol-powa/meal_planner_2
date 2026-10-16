# W11: rilievi della seconda revisione di spec e piano (16/10)

Leggi `progetto/coordinamento/revisioni/w11-spec-piano-2.md` (DA CORREGGERE) e accogli
i rilievi 1–10. Nessuna decisione di prodotto nuova.

Indicazioni del coordinatore, per non far crescere il design oltre il necessario:

- **Rilievi 1 e 2, un'unica risorsa per utente:** preferisci un lucchetto consultivo per
  utente (per esempio `pg_advisory_xact_lock(hashtextextended('user_memberships:' ||
  user_id, 0))`) preso da ogni percorso che crea un'appartenenza o una prenotazione per
  quell'utente (`app.create_family` di A compresa, `join`, `complete`) e dalla
  cancellazione, prima delle famiglie. Mettilo nell'ordine completo dei lucchetti:
  `app_admin_roles` → utente → famiglie per id → link → prenotazioni. `complete`
  ricontrolla `family_removals` e l'appartenenza già esistente (nessun doppio ingresso,
  nessun cambio della famiglia mostrata); il `join` autenticato chiude la prenotazione
  `reserved` della stessa persona. Per la ricreazione di un UUID cancellato con una
  richiesta già in volo: la creazione in `server/src/accounts/` deve ricontrollare
  nel database, subito prima del `POST`, che l'id non sia in `account_deletions`;
  documenta la finestra residua e perché è accettabile, oppure chiudila.
- **Rilievo 7:** d'accordo con il revisore su tutti i punti del ritentativo; i test
  accettano entrambi gli esiti dello stallo.
- **Rilievo 8:** se è più semplice, rendi `familyInvitations.list` non versionata
  (lettura piccola, solo amministratori).
- **Interfacce condivise:** la risorsa per utente, `afterCommit` e `RETRY_ON_DEADLOCK`
  vanno nella sezione «Interfaccia» della spec, da riportare nel piano generale.

Poi commit e `STATO: SPEC_E_PIANO_CORRETTI` con l'elenco di come hai chiuso ogni
rilievo. Seguirà una terza revisione.
