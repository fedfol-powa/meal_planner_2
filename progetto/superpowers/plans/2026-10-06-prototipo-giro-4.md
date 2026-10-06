# Prototipo, giro 4: Famiglia e account — piano

> **Esecuzione:** inline, senza subagenti e senza tappa intermedia (metodo dei giri
> precedenti): si sviluppa tutto il giro, poi review sull'output su iPhone. I passi
> usano le caselle (`- [x]`) per il tracciamento.

**Obiettivo:** rendere provabile su iPhone l'intero percorso 5 (specifica, sezioni 2 e
7, parte funzionale "Chi la usa"): primo accesso, famiglia nuova con prima
generazione, ingresso da invito, membri e inviti con la regola R2, impostazioni della
famiglia, "non proporre più", preferenze personali, cambio di famiglia, uscita,
eliminazione della famiglia e cancellazione dell'account.

**Architettura:** quella dei giri precedenti (`design/percorsi.md`, "Architettura del
prototipo"). Nuove operazioni simulate in `src/lib/operations/family.ts`,
`invitations.ts`, `account.ts` e `onboarding.ts`; ricevono il contesto, controllano i
permessi della sezione 2 e restituiscono errori strutturati (permesso mancante,
condizione non soddisfatta con l'elenco delle cause). Sono la bozza di quelle che il
percorso 7 userà via MCP.

**Stack:** invariato (SvelteKit, Svelte 5 runes, TypeScript, Vitest). Nessuna nuova
dipendenza.

**Riferimenti da leggere prima di iniziare:** specifica, sezioni 2 (impostazioni,
ruoli, `family_*`), 3 (vincoli e obiettivi), 7 e 17 (R2); `design/percorsi.md`;
`design/design.md` e `design/index.html` (moduli, pulsanti, chip, liste, fogli);
`prototype/README.md`.

## Decisioni della preparazione (6 ottobre 2026, provvisorie)

Registrate come provvisorie in `design/percorsi.md`; entrano nella specifica solo alla
chiusura del giro, dopo averle viste funzionare.

1. **Un solo giro** per tutto il percorso 5.
2. **Rientro dopo la rimozione (R2):** un membro rimosso non può rientrare con un link
   creato prima della sua rimozione; serve un link nuovo dell'amministratore. Gli
   stessi link restano validi per tutti gli altri.
3. **Impostazioni visibili:** tutte quelle della specifica tranne i pesi del
   punteggio; quota note/nuove e intervalli per gruppo alimentare in una sezione
   «Avanzate» chiusa.
4. **Wizard minimo:** nome della famiglia e sistema di misura, poi «Genera la prima
   settimana»; il resto ha default e si sistema dalle impostazioni.
5. **Prima generazione:** riempie i pasti non ancora passati da oggi a domenica; se è
   già passato mercoledì alle 20:00 genera anche la settimana successiva, come farebbe
   il job.

**Default proposti nel piano** (da confermare approvando il piano):

- **«Tu»** diventa una vista vera: nome e email, famiglia corrente con le sue voci
  (Membri e inviti, Impostazioni, Non proporre più), altre famiglie, «Crea un'altra
  famiglia», Preferenze (lingua), Esci dalla famiglia, Elimina la famiglia (solo
  amministratori), Cancella l'account. Curatela, amministrazione e MCP restano
  segnaposto dei percorsi 6–8.
- **Default della famiglia nuova:** tutti i pranzi e le cene pianificati, 2 porzioni,
  nessun pasto fisso, nessun limite di tempo né regola di pasto, nessun ingrediente
  evitato, nessun libro, obiettivi CREA della sezione 3.
- **Dopo la prima generazione** si arriva al Menu; una scheda richiudibile in cima,
  una sola volta, propone «Invita la famiglia» e «Sistema le impostazioni».
- **Impostazioni:** valgono dalle prossime generazioni e dai suggerimenti; i menu già
  fatti non cambiano (fanno eccezione gli evitati, che la lista della spesa già
  applica). Salvataggio a ogni modifica, come nel resto dell'app; nessun «Salva».
  Le modificano solo gli amministratori; i membri le leggono.
- **Commensali:** griglia di sette giorni per pranzo e cena con le porzioni (0 = pasto
  non pianificato); pasti fissi e limiti di tempo si impostano toccando una cella.
- **Regole di pasto:** un elenco a scelta fra modelli (solo a pranzo / mai a cena per
  un tipo di piatto, almeno un pasto di un gruppo in un giorno, mai un gruppo in un
  giorno); niente regole in testo libero.
- **Ingredienti:** ricerca nel catalogo, «Evita» o «Limita» con massimo a settimana.
- **Inviti:** l'amministratore crea un link («Copia», «Condividi» con ripiego come
  nella spesa), vede quelli attivi con scadenza e chi li ha creati, li revoca. Il link
  si apre in `/invite/[token]`.
- **Membri:** elenco con ruolo; l'amministratore cambia ruolo e rimuove, con conferma
  che dice cosa succede ai voti; l'ultimo amministratore non può uscire né perdere il
  ruolo senza nominarne un altro (lo si fa nello stesso foglio).
- **Eliminazione della famiglia:** pagina dedicata `/you/family/delete`, raggiungibile
  da un link diretto (quello che darebbe MCP), che identifica la famiglia, elenca cosa
  si cancella per tutti e chiede conferma; i permessi si ricontrollano alla conferma.
- **Cancellazione dell'account:** pagina dedicata che elenca, famiglia per famiglia,
  cosa succede (resta, va nominato un successore, viene eliminata) e blocca la
  conferma finché una condizione non è soddisfatta, compreso l'ultimo amministratore
  dell'app. Le ricette pubblicate restano; gli inviti creati dall'utente vengono
  revocati. Dopo la conferma si torna alla schermata di primo accesso.
- **Primo accesso simulato:** schermata di accesso con email (magic link simulato,
  «Continua» al posto della posta) e Google simulato; lingua iniziale dal browser
  (`it` → it-IT, altrimenti en-GB). Senza famiglie: «Crea la tua famiglia» oppure
  «Hai ricevuto un link? Aprilo dal messaggio».
- **Offline simulato:** tutto in sola consultazione, come il resto dell'app tranne la
  lista della spesa.

## Varianti da scegliere su iPhone

Nel pannello Prova, da tenere o togliere nella review:

- **Cambio di famiglia:** (a) dalla vista «Tu», toccando un'altra famiglia; (b) nome
  della famiglia nella barra del mese del Menu, con un menu a tendina.
- **Conferma delle eliminazioni:** (a) pulsante rosso dopo il riepilogo; (b) scrivere
  il nome della famiglia (o «CANCELLA» per l'account) per abilitare il pulsante.

## Simulazione dei dati

Dichiarata nell'interfaccia dove serve e in `design/percorsi.md`.

- **Persone:** si aggiungono Marco (ex membro della Famiglia Folloni, rimosso dopo
  aver ricevuto un link ancora valido, per provare R2) e Giulia (utente nuova senza
  famiglie). Email inventate.
- **Inviti demo:** un link attivo della Famiglia Folloni creato da Federico prima della
  rimozione di Marco, uno scaduto e uno revocato.
- **Impostazioni della Famiglia Folloni** ricavate dalle regole di merito del progetto
  di origine (`../meal_planner/progetto/REGOLE.md`, sola lettura): pasti fissi, tempi
  massimi, regole di pasto, quota e intervalli; dove la fonte non dice nulla, default.
  Nonni con i default.
- **Generazione simulata:** riusa la regola dei suggerimenti del giro 2
  (`rankCandidates`) slot per slot, rispettando pasti fissi, commensali, limiti di
  tempo, esclusioni ed evitati; dichiarata come non il pianificatore.
- **Scenari del pannello Prova:** «Utente nuova (Giulia)», «Apri un link d'invito»
  (valido, scaduto, revocato, già membro, membro rimosso), «Link per eliminare la
  famiglia» (come da MCP).

## Struttura dei file

- `src/lib/domain/types.ts`: `FamilySettings` (commensali, pasti fissi, limiti di
  tempo, regole di pasto, quota, intervalli), `Family.settings`, `FamilyMember.joinedAt`,
  `FamilyInvitation`, `FamilyRemoval`, `FamilyIngredient.restriction` e `weeklyMax`,
  `User.email`; `DemoDatabase` con `invitations`, `removals`.
- `src/lib/demo-data/seed.ts`: persone, inviti, impostazioni; versione dello stato
  salvato incrementata.
- `src/lib/operations/` (+ test): `family.ts` (impostazioni, membri, ruoli, uscita,
  esclusioni, ingredienti, libri, eliminazione), `invitations.ts` (crea, revoca,
  `getInvitation`, `acceptInvitation` con R2), `account.ts` (preferenze,
  `getAccountDeletionPlan`, `deleteAccount` tutto o niente), `onboarding.ts`
  (`createFamily`, `generateFirstWeeks`).
- Rotte: `/welcome` (accesso e scelta iniziale), `/welcome/family` (wizard),
  `/invite/[token]`, `/you`, `/you/family` (membri e inviti), `/you/family/settings`,
  `/you/family/exclusions`, `/you/family/delete`, `/you/preferences`,
  `/you/account/delete`.
- Componenti: `SettingsSection`, `DinersGrid`, `SlotSettingsSheet`, `MealRuleEditor`,
  `IngredientRestrictions`, `BookList`, `MemberRow`, `InviteLinks`, `ConfirmDanger`,
  `FamilySwitcher`, `SetupCard`; riuso di `BottomSheet`, `ServingsStepper`,
  `StateNotice`, `UndoToast`.
- Testi it-IT ed en-GB in `src/lib/i18n/messages.ts`.

## Attività

### Attività 1: decisioni nei documenti e branch

- [x] Branch `prototipo-giro-4` da `main`.
- [x] `design/percorsi.md`: sezione "Giro 4" con perimetro, decisioni provvisorie,
      varianti e simulazione; tabella dei percorsi aggiornata.
- [x] Commit del piano e dei documenti.

### Attività 2: modello e dati demo

- [x] Tipi, seed (persone, inviti, rimozione di Marco, impostazioni dalle regole di
      origine), migrazione delle impostazioni esistenti; versione dello stato salvato.
- [x] Test sui dati: ogni famiglia ha almeno un amministratore; impostazioni valide.
- [x] Commit.

### Attività 3: operazioni (test prima)

- [x] Permessi: membro legge, amministratore modifica; offline in sola lettura.
- [x] Inviti: creazione, scadenza a 7 giorni, revoca, già membro, R2.
- [x] Membri: cambio ruolo, rimozione (voti fuori dalla media, tracce «ex membro»),
      ultimo amministratore protetto, uscita.
- [x] Impostazioni, esclusioni, ingredienti, libri con validazione.
- [x] Famiglia nuova e prima generazione (metà settimana, dopo mercoledì 20:00,
      domenica sera).
- [x] Piano di cancellazione dell'account e cancellazione tutto o niente; ultimo
      amministratore dell'app; eliminazione della famiglia.
- [x] Commit.

### Attività 4: viste

- [x] Primo accesso, wizard, scheda dopo la generazione.
- [x] «Tu», membri e inviti, ingresso da invito con tutti gli stati.
- [x] Impostazioni (commensali, pasti fissi, tempi, regole, ingredienti, libri, unità,
      Avanzate), Non proporre più, Preferenze.
- [x] Uscita, eliminazione della famiglia, cancellazione dell'account; varianti del
      pannello Prova.
- [x] Testi it-IT ed en-GB.
- [x] Commit.

### Attività 5: verifica e review

- [x] `npm test`, `npm run check`; prova nel browser a 320, 390 e 1440 px, italiano e
      inglese, come membro e come amministratore, offline.
- [x] Confronto visivo con `design/index.html`.
- [x] `design/percorsi.md`: rotte, componenti, operazioni, domande per la review;
      README del prototipo.
- [x] `npm run preview:lan` e review dell'utente su iPhone; esito qui e in
      `design/percorsi.md`; alla chiusura, decisioni nella specifica (sezioni 2, 7, 15
      e 17 per R2, parte funzionale) e voci "Utenti e inviti", "Cancellazione" e
      "Calendario" della sezione 15 aggiornate per quanto chiarito.

## Domande per la review (bozza)

1. Varianti: dove si cambia famiglia; forma della conferma delle eliminazioni.
2. La griglia dei commensali è comprensibile per chi non l'ha mai vista?
3. Regole di pasto a modelli: bastano o servono altre forme?
4. La scheda dopo la prima generazione è utile o è un'etichetta in più?
5. Il riepilogo della cancellazione dell'account è chiaro famiglia per famiglia?

## Fuori dal giro

Autenticazione reale, email e SMTP; inviti all'app e ruoli globali (percorso 8);
equivalenti MCP e link restituiti da MCP oltre alla pagina di destinazione
(percorso 7); curatela (percorso 6); pesi del punteggio; pianificatore reale.

## Esito dell'esecuzione (6 ottobre 2026)

Sviluppo completato in questa sessione senza subagenti: 196 test e controllo dei tipi
verdi; prova nel browser a 320, 390 e 1440 px, in italiano e in inglese, dei flussi
primo accesso → wizard → prima generazione, invito valido e bloccato per Marco (R2),
modifica delle impostazioni, eliminazione della famiglia da membro e da
amministratore, cancellazione dell'account con famiglia eliminata e con successore.
Due correzioni emerse dalla prova: le scritture dopo un `push` nello stato reattivo
(la prima generazione lasciava i pasti vuoti) e la copia delle impostazioni senza
`structuredClone`. Scelte prese durante lo sviluppo e domande per la review in
`design/percorsi.md`, "Giro 4".

## Esito della review (6 ottobre 2026)

Approvato dall'utente. Unica modifica: la vista «Tu» diventa «Profilo» («Profile»), con
le rotte sotto `/profile`. Confermati i default provati (cambio di famiglia dalla
vista Profilo, conferma delle eliminazioni con il pulsante): tolte le altre varianti.
Decisioni riportate nella specifica (sezioni 2, 3, 4, 7, 14, 15, 16 e 17) e in
`design/design.md`; esito in `design/percorsi.md`, "Giro 4".
