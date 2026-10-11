# Profilo, famiglia e impostazioni (senza inviti)

Creato: 11 ottobre 2026
Attività: W2 dell'ondata 2, branch `traguardo/profilo`
Stato: corretta dopo la review di spec e piano (`progetto/coordinamento/revisioni/w2-profilo-spec-piano.md`,
messaggio `w2-06`); in attesa del via.

Spec di dettaglio subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`): parte 1 («Chi la usa»,
«Lingua e unità di misura»), sezioni 1, 2, 7, 12, 13, 15 e 16. Rispetta le «Interfacce
decise» del piano generale e le regole comuni dell'ondata 2.

## Obiettivo e criteri di riuscita

Nel traguardo A la famiglia di Federico, creata a mano con `supabase/scripts/bootstrap.sql`,
si configura per intero dall'app e da un agente MCP, senza toccare il database:

- ogni persona cambia nome e lingua; la lingua vale per web e MCP perché il server
  localizza dal profilo;
- ogni persona vede le proprie famiglie e sceglie quella mostrata, ricordata sul server;
- i membri leggono famiglia, membri con ruolo, impostazioni ed elenco «Non proporre
  più»; gli amministratori della famiglia cambiano nome, unità, fuso e tutte le
  impostazioni del quarto giro del prototipo tranne i pesi;
- ogni membro aggiunge e toglie ricette da «Non proporre più»;
- ogni operazione ha il suo strumento MCP con gli stessi permessi.

## Perimetro

**Dentro:** operazioni delle aree `profile` e `family` elencate sotto, con gestori,
migrazione, schermate web, strumenti MCP derivati e test; lo schema dei valori salvati in
`families.settings` e la loro risoluzione (`domain/src/family/settings.ts`); procedura
documentata per completare la famiglia di Federico dopo lo script dei primi utenti.

**Fuori, con punti di aggancio** (ondata 3): inviti familiari e all'app, rimozione di
membri, uscita dalla famiglia, cambio di ruolo, creazione della famiglia e wizard,
eliminazione della famiglia, cancellazione dell'account, accesso con Google. Nelle
schermate i relativi comandi non compaiono (nessun segnaposto disattivato, come per le
righe dei ruoli nella base di W5); le operazioni si aggiungono nelle aree `profile` e
`family` senza cambiare quelle di questa spec.

**Fuori, di altre attività:** pesi del punteggio (in `families.settings`, mai mostrati né
modificabili da web o MCP), «Collega un agente», gestione del ricettario, amministrazione.

## Scelte del brainstorming

| Tema | Scelta | Chi |
|---|---|---|
| Impostazioni nel traguardo A | Tutta la pagina del prototipo, pesi esclusi: unità, fuso, matrice (porzioni, pasti fissi, limiti di tempo), regole, ingredienti evitati e limitati, libri, Avanzate | Coordinatore |
| Schema di `families.settings` | Schema dei valori salvati e `resolveFamilySettings` in `domain/src/family/settings.ts`, di questa attività; tipi `PlannerSettings` e default restano in `domain/src/planner/` (W1), che importa la funzione | Coordinatore, d'accordo con W1 |
| Famiglia mostrata | Sul server, privata: tabella `app.profile_preferences` leggibile solo dal proprietario (review, rilievo 1) | Coordinatore |
| «Non proporre più» | Elenco, aggiunta e rimozione in quest'area; revisione dei pasti e W6 richiamano `family.addExclusion` | Coordinatore |
| Mutazioni delle impostazioni | Operazioni puntuali a stato assoluto, una per gesto; il server scrive solo la chiave toccata del jsonb | Coordinatore |
| Impostazioni malformate | Lettura tollerante (default al posto dei pezzi non validi); la scrittura rende oggetto ogni genitore del percorso nella stessa scrittura atomica (review, rilievo 8) | Coordinatore |
| Implementatore del server | Costruito solo in `server/src/router.ts` (dove W1 aggiunge `{ prepare }`); ogni area esporta un factory che riceve `os: Implementer` (review, rilievo 5) | Coordinatore |
| Da `me.get` a `profile.get` nel web | Lo fa questa attività sopra la seconda PR di W5 (client oRPC reale): wrapper, tipi, client finto, chiavi della sessione, revoca (review, rilievo 4) | Coordinatore |
| Mutazioni nel web | Modello di W5 (`web/src/api/ratings.ts`): letture interessate cancellate prima di applicare la risposta, sessione e lingua verificate, ordine delle risposte (review, rilievo 2) | Coordinatore |

## Dominio: `domain/src/family/settings.ts`

`families.settings` conserva solo i valori che la famiglia ha cambiato rispetto ai default
(migrazione `families`: «the server fills in the domain defaults»). Così un default
cambiato in futuro vale per tutte le famiglie che non l'hanno toccato.

Forma salvata (`StoredSettings`, schema zod `storedSettingsSchema`, tutto facoltativo):

```ts
{
  slots?: { lunch?: Record<'0'..'6', SlotSetting>, dinner?: Record<'0'..'6', SlotSetting> },
  rules?: MealRule[],              // elenco intero: presente = scelto dalla famiglia
  knownNew?: { known, new, tolerance },
  groupRanges?: Partial<Record<FoodGroup, GroupRange>>,
  weights?: Partial<ScoreWeights>  // mai scritto da web o MCP; lo legge solo il pianificatore
}
```

- La matrice si salva per singolo pasto (`slots.lunch."4"`), così due amministratori che
  cambiano giorni diversi non si sovrascrivono.
- `resolveFamilySettings(stored: unknown): PlannerSettings` parte da
  `defaultPlannerSettings()` di W1 e sovrappone i valori salvati validi. Un valore non
  valido (dati vecchi o scritti a mano) si scarta pezzo per pezzo con il default al suo
  posto, mai un errore: la lettura e il job di W1 non si bloccano per un jsonb sporco.
- Limiti, condivisi da schema, contratto e interfaccia ed esportati come costanti:
  porzioni intere 0-12 (`MAX_SERVINGS`), `fixedText` tolto degli spazi, 1-60 caratteri, o
  `null`; `maxMinutes` fra `TIME_LIMITS = [15, 20, 30, 45, 60]` o `null`; regole dai
  quattro modelli di `MealRule` con `weekday` 0-6, gruppi e piatti dai vocabolari di
  `domain/src/planner/types.ts`; quota note/nuove intera 0-14; intervalli interi
  0 ≤ min ≤ max ≤ 14. Se W1 cambia i tipi, questo file si adegua; i limiti nuovi passano
  dal coordinatore.
- Regole: identificate dal loro valore (stesso `kind` e stessi campi), senza id;
  `normalizeRules` toglie i doppioni e ordina in modo stabile. Aggiungere una regola già
  presente o togliere una regola assente non cambia nulla.
- Il server salva ogni valore scelto anche se uguale al default (è una scelta esplicita
  della famiglia); `rules` si salva sempre come elenco intero normalizzato.

## Contratto e server

Aree nuove `profile` e `family` in `contract/src/profile/` e `contract/src/family/`,
gestori in `server/src/profile/` e `server/src/family/`; indice del contratto e router
toccati solo per registrarle. Tutte con `offline: false` (nessuna è nella coda offline
della spesa) e senza `webOnly`.

**Implementatore unico.** `server/src/router.ts` costruisce l'implementatore una sola
volta (`createImplementer(contract, …)`, con il `prepare` di W1 quando arriva); ogni area
esporta un factory `profileRouter(os: Implementer)` e `familyRouter(os: Implementer)` che
restituisce i gestori. Il tipo `Implementer` si esporta da `server/src/pipeline.ts`
(`ReturnType<typeof createImplementer<Contract>>`); lo aggiunge chi arriva prima fra W2,
W1 e W6. Nessuna area costruisce un implementatore proprio.

**Errori dichiarati.** Oltre agli errori comuni (`unauthorized`, `forbidden`, `invalid`,
`web_only`, `internal`), le operazioni che possono rispondere `not_found` lo dichiarano
con `.errors({ not_found: errorDefinitions.not_found })`: `family.setBookOwned`,
`family.setIngredientRestriction`, `family.addExclusion`. I test lo verificano nel
contratto e attraverso RPC e REST.

### Letture

| Operazione | Ruolo | `reads` | Vista |
|---|---|---|---|
| `profile.get` | user | — | `{ user: {id, displayName, email, locale, globalRoles}, families: [{id, name, role, timeZone, measurementSystem}], currentFamilyId }` |
| `family.get` | familyMember | family | `{ id, name, measurementSystem, timeZone, myRole, members: [{userId, displayName, role, isMe, joinedAt}] }` |
| `family.getSettings` | familyMember | family, catalogue | `{ settings: PlannerSettings senza weights, books: [{id, title, owned}], restrictions: [{ingredientId, name, restriction, weeklyMax}], canEdit }` |
| `family.searchIngredients` | familyMember | — | fino a 8 `{id, name}` |
| `family.listExclusions` | familyMember | family, catalogue | `[{ recipe: {id, name}, reason, createdByName, createdAt }]` |

- **`profile.get`** sostituisce il `me.get` provvisorio di W5 (il client reale si allinea
  ai nomi del contratto, come previsto dalla spec di W5). Non è una lettura versionata:
  non dipende da una sola famiglia e pesa poco; nessun contatore nuovo. Email da
  `auth.jwt() ->> 'email'`; ruoli globali da `user_roles`. Famiglie ordinate per nome
  nella lingua dell'utente. `currentFamilyId`: quella salvata, altrimenti la prima
  dell'elenco, `null` senza famiglie.
- **Membri:** prima gli amministratori, poi per nome. I nomi arrivano dalla policy
  `profiles_read` già esistente (co-membri).
- **Impostazioni:** risolte con `resolveFamilySettings`, senza `weights`; `canEdit` vale
  per gli amministratori. Libri: non archiviati più quelli posseduti anche se archiviati,
  per titolo. Ingredienti con restrizione: nome nella lingua dell'utente, per nome.
- **Ricerca ingredienti:** testo tolto degli spazi, 2-60 caratteri (sotto i 2 risultato
  vuoto); confronto senza maiuscole e accenti su nome e sinonimi nella lingua
  dell'utente (`ingredients.name`, `synonyms`), solo non archiviati, esclusi quelli già
  con restrizione nella famiglia; ordine: prima chi inizia con il testo, poi per nome.
- **Esclusioni:** più recenti prima; nome della ricetta localizzato (proiezione di
  `recipes`), autore `null` se non è più membro («ex membro» nell'interfaccia).

### Mutazioni

Ognuna è a stato assoluto e idempotente (ripeterla dà lo stesso risultato) e restituisce
la vista aggiornata della lettura corrispondente (`family.get`, `family.getSettings`,
`family.listExclusions` o `profile.get`, in forma non versionata), che il web scrive
nella cache senza rileggere.

| Operazione | Ruolo | Input | Effetto |
|---|---|---|---|
| `profile.update` | user | `displayName?` (1-60 dopo il trim), `locale?` | aggiorna il profilo; almeno un campo |
| `profile.setCurrentFamily` | user | `familyId` | `forbidden` se non membro |
| `family.rename` | familyAdmin | `name` (1-60 dopo il trim) | |
| `family.setMeasurementSystem` | familyAdmin | `metric` / `uk_imperial` | |
| `family.setTimeZone` | familyAdmin | fuso IANA | fuso sconosciuto a Postgres → `invalid` sul campo |
| `family.setMeal` | familyAdmin | `mealType`, `weekday` 0-6, `servings`, `fixedText`, `maxMinutes` | scrive `slots.<meal>."<day>"` |
| `family.addRule` / `family.removeRule` | familyAdmin | `rule` (`MealRule`) | elenco normalizzato |
| `family.setKnownNew` | familyAdmin | `known`, `new`, `tolerance` | |
| `family.setGroupRange` | familyAdmin | `group`, `min`, `max` | |
| `family.setBookOwned` | familyAdmin | `bookId`, `owned` | `not_found` se il libro non esiste (anche con `owned: false`) o, per `owned: true`, è archiviato; togliere un libro esistente non posseduto non cambia nulla |
| `family.setIngredientRestriction` | familyAdmin | `ingredientId`, `restriction` `avoid`/`limit`/`null`, `weeklyMax` 1-7 solo con `limit` | `null` toglie; `not_found` se l'ingrediente non esiste o è archiviato (per toglierla basta che esista) |
| `family.addExclusion` | familyMember | `recipeId`, `reason?` (≤ 200) | esistente: invariata (primo autore e data restano); `not_found` per ricette non visibili o in bozza |
| `family.removeExclusion` | familyMember | `recipeId` | assente: nessun effetto |

- **Scritture sul jsonb:** un solo `update app.families set settings = jsonb_set(…)`
  sulla sola chiave toccata, nella transazione dell'utente; la policy `families_update`
  resta la garanzia. Ogni genitore del percorso (`slots`, `slots.<meal>`, `groupRanges`)
  che non è un oggetto (assente, `null`, stringa, array) diventa `{}` nella stessa
  scrittura, mentre un genitore oggetto si conserva con le sue altre chiavi: così un
  jsonb malformato, che la lettura mostra con i default, non impedisce il salvataggio
  successivo. Due amministratori che cambiano chiavi diverse non perdono nulla; sulla
  stessa chiave vince l'ultimo, come per i pasti. Dopo la scrittura il gestore rilegge
  la vista, quindi la risposta mostra il valore davvero salvato.
- **Errori Postgres mappati:** violazione di un check (`23514`) o fuso non valido
  (`22023`) → `invalid` con il percorso del campo; nessuna riga aggiornata dove ci si
  aspettava una famiglia → `forbidden`. Gli altri restano `internal`.
- **Contatori:** già coperti dai trigger di W2 (`families`, `family_books`,
  `family_ingredients`, `recipe_exclusions`; `profiles.display_name` per le famiglie
  dell'utente). Il cambio di `profiles.locale` e della famiglia mostrata non fa crescere
  nulla: la lingua è già nella versione composta delle letture.
- **Nessuna operazione nuova di sessione:** la lingua salvata sul profilo vale dalla
  richiesta successiva, perché `loadSession` la rilegge a ogni richiesta.

### MCP

Uno strumento per operazione dal contratto esistente (`profile_get`,
`family_setMeal`…), letture con `readOnly: true`. Il `summary` di ogni operazione è la
descrizione per l'agente, in inglese, e dice quando usarla (per esempio
`family.addExclusion`: «Stop proposing a recipe to this family»). Gli agenti passano
sempre `familyId`: la famiglia mostrata non è un default implicito (sezione 1, «Famiglia
esplicita»); `profile.get` indica all'agente quale famiglia è mostrata nell'app.

## Database

Una migrazione nuova, `supabase/migrations/20261011120000_profile_preferences.sql`. La
famiglia mostrata non va in `profiles`: quella tabella è leggibile dai co-membri (policy
`profiles_read`) e l'RLS filtra righe, non colonne, quindi Bruno leggerebbe quale altra
famiglia ha scelto Anna (review, rilievo 1). Sta in una tabella privata:

```sql
create table app.profile_preferences (
  user_id uuid primary key references app.profiles (user_id) on delete cascade,
  current_family_id uuid,
  updated_at timestamptz not null default now(),
  constraint profile_preferences_current_family_member
    foreign key (current_family_id, user_id)
    references app.family_members (family_id, user_id)
    on delete set null (current_family_id)
);
alter table app.profile_preferences enable row level security;
grant select, insert on app.profile_preferences to authenticated;
grant update (current_family_id, updated_at) on app.profile_preferences to authenticated;
create policy profile_preferences_own on app.profile_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
```

- Una riga per persona, creata alla prima scelta (`insert … on conflict (user_id) do
  update`); senza riga vale la prima famiglia.
- La chiave esterna composta garantisce che la famiglia mostrata sia una di cui si è
  membri; uscita, rimozione o eliminazione della famiglia la azzerano da sole (Postgres
  15 o successivo, come il progetto Supabase). La cancellazione dell'utente toglie la
  riga con il profilo.
- Nessun trigger dei contatori: la scelta non cambia i dati di nessuna famiglia.
- Test pgTAP con le fixture (Anna in Rossi e Bianchi, Bruno solo in Rossi, Verdi
  estranea ad Anna): Anna sceglie Bianchi; Bruno non legge né scrive la riga di Anna;
  la scelta di Verdi da parte di Anna è rifiutata (`23503`); uscita da Bianchi →
  `current_family_id` nullo; il contatore di Rossi e di Bianchi non cresce;
  `coverage_test.sql` resta verde (RLS attiva, nessun permesso ad `anon` e PUBLIC).

**Tabelle e colonne toccate** (per il controllo dei conflitti del coordinatore): nuova
tabella `app.profile_preferences`; scritture applicative (nessun cambio di schema) su
`app.profiles` (`display_name`, `locale`), `app.families` (`name`,
`measurement_system`, `time_zone`, `settings`), `app.family_books`,
`app.family_ingredients`, `app.recipe_exclusions`.

## Web

Parte quando la seconda PR di W5 (client oRPC reale) è su `main`; se non lo è quando si
arriva ai task del web, il worker si ferma e lo dice al coordinatore. Segue la struttura
di quella base (oggi `web/src/routes/`, `web/src/api/`, `web/src/session/`, dizionari in
`web/src/i18n/messages/`), con i file di quest'area separati e le rotte, la navbar e i
dizionari comuni toccati solo per registrarli.

**Da `me` a `profile`** (review, rilievo 4), in questa attività:

- `wrapApi` (`web/src/session/session.ts`) avvolge esplicitamente ogni area: si sostituisce
  `me` con `profile` e si aggiunge `family`, così rinnovo della sessione, segni di revoca
  per famiglia e risposte nella lingua superata valgono anche per le aree nuove;
- tipi `Api`, `MeView` → `ProfileView`, client finto (`web/src/api/fake/`) con
  `profile.*` e `family.*`;
- chiavi: `['me']` diventa `['profile', 'get']` ovunque, compresa l'invalidazione dopo
  `forbidden` in `SessionScope` e la lettura della lingua del profilo;
- test attraverso `SessionScope`: chiamata a `profile.get` e a un'operazione `family`
  con un token scaduto (un rinnovo, poi riuscita), con `forbidden` (famiglia revocata e
  `['profile', 'get']` riletta).

| Rotta | Contenuto |
|---|---|
| `/profile` | Nome ed email; scheda della famiglia mostrata con Membri (numero), Impostazioni, Non proporre più (numero); «Le tue famiglie» con ruolo, un tocco chiama `profile.setCurrentFamily`; Account con Preferenze |
| `/profile/preferences` | Nome (salvato all'uscita dal campo), email in sola lettura, lingua (Italiano, English) con `profile.update`; «Esci» |
| `/profile/family` | Membri in sola lettura: nome, ruolo, «tu»; ai membri una riga con gli amministratori a cui chiedere |
| `/profile/family/settings` | Pagina del prototipo: nome, matrice dei commensali, regole, ingredienti, libri, unità, fuso, «Avanzate» chiusa (quota e intervalli) |
| `/profile/family/exclusions` | Elenco con ricetta, autore e data; «Riproponi» |

- Componenti dal prototipo riscritti in React, senza componenti nuovi non previsti:
  `DinersGrid`, `MealRules`, `IngredientRestrictions`, `Stepper`, `PageHeader`,
  `StateNotice`, righe `settings-card` e `row-list`. Il fuso è un `select` con i fusi di
  `Intl.supportedValuesOf('timeZone')`, nella sezione delle unità; non c'è nel prototipo,
  è un select dei moduli della guida (`design/design.md`, «Moduli»).
- **Salvataggio a ogni modifica**, nessun aggiornamento ottimistico: il controllo resta
  sul valore inviato in attesa della risposta, che sostituisce la vista in cache; un
  errore riporta il valore del server e mostra il messaggio tradotto. Campi di sola
  lettura per i membri e offline («Le impostazioni si cambiano online»).
- **Applicazione delle risposte** (modello di W5, `applyRating` e `useRateRecipe`;
  review, rilievo 2), in una funzione unica `applyMutation` dell'area:
  1. alla partenza la mutazione registra un gettone per la vista che cambia
     (`session.track('settings:<familyId>')`, `'family:<familyId>'`,
     `'exclusions:<familyId>'`, `'profile'`) e annota la lingua corrente;
  2. alla risposta: se la sessione è chiusa, la risposta si scarta senza toccare la
     cache (la chiusura la cancella comunque). Se la sessione è valida ma la risposta è
     superata (lingua cambiata, oppure è partita un'altra mutazione sulla stessa vista
     e il gettone non è più l'ultimo), la vista non si scrive ma la scrittura sul server
     è riuscita: si marcano scadute la vista **e tutte le letture dipendenti
     dell'operazione** secondo la tabella sotto (seconda review, rilievo 1). Così due
     risposte complete arrivate in ordine inverso non riportano indietro la vista, e una
     restrizione `avoid` superata da un `setMeal` fa comunque rileggere la spesa;
  3. altrimenti si cancellano le letture interessate ancora in corso (la vista e quelle
     della tabella sotto), poi si scrive la vista nella cache con la versione vecchia
     (la lettura successiva riceve dati nuovi, mai un «invariato» sbagliato), poi si
     invalidano le altre letture della tabella; le letture cancellate che non avevano
     dati ripartono.
- **Viste aggiornate e invalidate per operazione** (review, rilievo 3). Chiavi
  `[area, operazione, input]` delle altre aree come nelle loro spec (W1 menu, W6
  ricettario, W4 spesa); «della famiglia» = con lo stesso `familyId` nell'input.

  | Operazione | Vista scritta con la risposta | Letture invalidate |
  |---|---|---|
  | `profile.update` con `displayName` | `['profile','get']` | tutte le query (gesto raro: il nome compare nelle attribuzioni di menu, spesa ed esclusioni di ogni famiglia della persona) |
  | `profile.update` con `locale` | `['profile','get']` | nessuna: la lingua cambia con il meccanismo di W5, che non mostra dati della lingua precedente |
  | `profile.setCurrentFamily` | `['profile','get']` | nessuna: il cambio di famiglia segue `useFamily()` di W5 |
  | `family.rename` | `['family','get']` | `['profile','get']` |
  | `family.setMeasurementSystem` | `['family','get']` | `['profile','get']`; della famiglia: `['menu',*]`, `['recipes',*]`, `['shopping',*]` |
  | `family.setTimeZone` | `['family','get']` | `['profile','get']` (il Menu legge `timeZone` da lì); della famiglia: `['menu',*]`, `['recipes','get']`, `['shopping',*]` |
  | `family.setMeal`, `addRule`, `removeRule`, `setKnownNew`, `setGroupRange` | `['family','getSettings']` | nessuna: i menu già fatti non cambiano, i suggerimenti si leggono dal server |
  | `family.setBookOwned` | `['family','getSettings']` | della famiglia: `['recipes','search']`, `['recipes','get']` |
  | `family.setIngredientRestriction` | `['family','getSettings']` | della famiglia: `['shopping',*]` (gli `avoid` escono dalla lista) |
  | `family.addExclusion`, `removeExclusion` | `['family','listExclusions']` | nessuna (W6 non mostra le esclusioni; la revisione dei pasti legge dal server) |

  I test popolano prima tutte le cache della tabella (anche di un'altra famiglia, che
  non deve cambiare) e verificano scrittura e invalidazioni.
- **Lingua:** la scelta passa da `profile.update`; alla risposta il web applica la
  lingua del profilo con il meccanismo di W5 (cambio d'identità: niente dati della
  lingua precedente) e la chiave temporanea `locale:user:<id>` non serve più. Offline la
  scelta resta temporanea come oggi e non si salva.
- **Famiglia mostrata:** `useFamily()` di W5 legge `currentFamilyId` da `['profile','get']`;
  il tocco salva sul server e alla risposta cambia la famiglia mostrata senza dati della
  precedente.
- Dizionari `profile` e `family` in italiano e inglese britannico, con i testi del
  prototipo (`prototype/src/lib/i18n/`); errori con i codici esistenti.

## Primi utenti

`supabase/scripts/bootstrap.sql` copre già utenti, ruoli globali e famiglia: nessuno
script nuovo. Si aggiunge al `supabase/README.md`, dopo il passo dello script, come
completare la famiglia di Federico dall'app (Profilo → Impostazioni) o da un agente,
con i valori di `scripts/planner-data/family.ts` (matrice dei commensali, pizza la
domenica a pranzo, cena libera il sabato, limiti di tempo, tre regole, cetrioli al
massimo una volta la settimana): i cetrioli richiedono gli ingredienti dell'import,
quindi questo passo viene dopo l'import (attività «Messa in produzione»).

## Test

- **Dominio** (Vitest): `resolveFamilySettings` con jsonb vuoto, parziale, con valori
  non validi scartati pezzo per pezzo, con chiavi sconosciute; `normalizeRules`;
  schema dei valori salvati sui limiti.
- **Contratto:** `checkContract` passa con le aree nuove; ruoli, metadati ed errori
  dichiarati (`not_found` dove serve) attesi per ogni operazione.
- **Server** (Vitest con il Postgres locale, come i test di W1): per ogni operazione
  permessi (membro, amministratore, estraneo → `forbidden`), validazione (`invalid` con
  percorso), idempotenza, vista restituita; due transazioni concorrenti su giorni
  diversi della matrice senza perdite; contatore della famiglia che cresce dopo una
  mutazione e lettura «invariata» prima; lingua salvata che cambia la lingua della
  richiesta successiva; famiglia mostrata azzerata dopo la cancellazione
  dell'appartenenza; jsonb malformato (`slots: null`, `slots.lunch` stringa,
  `groupRanges` array) letto con i default e poi salvato davvero, conservando le altre
  chiavi valide; `not_found` attraverso RPC e REST; MCP: una lettura, una scrittura
  riuscita con rilettura e una scrittura rifiutata con errore localizzato.
- **Esecuzione delle suite del server:** `TEST_DATABASE_URL` impostato esplicitamente
  (stesso valore della CI) e `CI=1`, così una suite senza database fallisce invece di
  essere saltata; il passo rosso deve fallire per il comportamento mancante.
- **Database** (pgTAP): la migrazione, come sopra, con i nomi delle fixture senza
  prefisso (`tests.family('Rossi')`).
- **Web** (Vitest con Testing Library): sola lettura per i membri, salvataggio con la
  vista del server, errore che riporta il valore, cambio di lingua e di famiglia,
  dizionari completi nelle due lingue; con promesse controllate: lettura vecchia
  completata dopo una mutazione, due mutazioni su chiavi diverse con risposte invertite,
  risposta dopo l'uscita o dopo il cambio di lingua; tabella delle invalidazioni con
  le cache popolate prima; `me` → `profile` attraverso `SessionScope` (rinnovo e
  revoca). Prova visiva con agent-browser sulle cinque
  rotte, su telefono, in italiano e in inglese.

## Decisioni da riportare nella specifica

**Prodotto:**

- Famiglia mostrata ricordata sul server, uguale su tutti i dispositivi (sezione 7,
  «Vista Profilo»).
- Nel traguardo A il Profilo non mostra i comandi dell'ondata 3 (inviti, rimozione,
  uscita, cambio di ruolo, eliminazione, cancellazione, «Crea un'altra famiglia»)
  (sezione 7).
- Il fuso della famiglia si cambia nella pagina delle impostazioni, accanto alle unità
  (sezioni 2 e 7).
- Ricerca degli ingredienti da evitare o limitare su nomi e sinonimi nella lingua
  dell'utente (sezioni 2 e 12).

**Tecniche:**

- `families.settings` conserva solo i valori scelti dalla famiglia; schema e
  risoluzione in `domain/src/family/settings.ts`, valori non validi scartati alla
  lettura (sezione 2, «Impostazioni della famiglia»).
- Impostazioni modificate con operazioni puntuali a stato assoluto che scrivono solo la
  chiave toccata del jsonb; regole identificate dal loro valore (sezioni 1 e 2).
- Nuova tabella privata `profile_preferences(user_id, current_family_id)` con chiave
  esterna composta verso `family_members` e RLS del solo proprietario (sezione 2,
  tabella degli utenti).
- Impostazioni malformate lette con i default; la scrittura rende oggetto ogni genitore
  del percorso (sezione 2).
- Implementatore del server costruito in un solo punto (`router.ts`), aree come factory
  (sezione 1).
- Mutazioni del web: risposta applicata solo se ultima per la vista, con sessione e
  lingua correnti, dopo aver cancellato le letture in corso; tabella delle viste
  invalidate per operazione (sezione 1, «Letture dalla copia sul dispositivo»).
- `profile.get` al posto di `me.get` (sezione 1).
- `profile.get` non versionata; le altre letture dell'area usano i contatori della
  famiglia e del catalogo (sezione 1, «Letture dalla copia sul dispositivo»).
- Elenco delle operazioni MCP dell'ambito «Famiglia e account» per il traguardo A
  (sezione 13).
