# Piano W22: skeleton nelle pagine rare e nelle sezioni dei curatori

> **Per gli agenti:** sotto-skill consigliata superpowers:subagent-driven-development o
> superpowers:executing-plans; i passi usano le caselle (`- [ ]`).

**Obiettivo:** le pagine rare e le sezioni dei curatori del Ricettario hanno lo skeleton di
W20 durante le attese, così non si spostano all'arrivo dei dati.

**Architettura:** si riusa `web/src/components/Skeleton.tsx`, esteso in due punti
(un'attesa che raccoglie quelle delle aree interne, testo dell'annuncio). Ogni pagina ha un
layout di attesa costruito con le proprie classi e con pochi pezzi condivisi in
`PageSkeletons.tsx`; `FamilyGate` e `AdminAccessGate` mostrano quel layout invece di
`Loading`.

**Stack:** React 19, TanStack Query, CSS globale e moduli CSS; Vitest + Testing Library.

**Spec:** `progetto/superpowers/specs/2026-10-23-skeleton-pagine-rare.md`, da leggere con la
spec e il piano di W20 (`progetto/superpowers/specs/2026-10-18-skeleton.md`,
`progetto/superpowers/plans/2026-10-18-skeleton.md`), di cui valgono i vincoli globali.

## Vincoli globali

- Tutti i vincoli globali del piano W20 (colore `#EBE7DE`, raggio 8 px, pulsazione solo
  su `.skeleton-card` e `.skeleton-block` esterni, blocchi `display: block`, soglia di
  200 ms, skeleton `aria-hidden` senza elementi focalizzabili, stesse classi del contenuto,
  righe `1lh`).
- Nessuna dipendenza nuova; nessun cambiamento a server, contratto o MCP; nessun testo nuovo
  da tradurre (gli annunci sono `common.loading` e `password.choose.verifying`, già tradotti).
- Mai skeleton con dati disponibili o in un aggiornamento in background; offline in pausa
  (`fetchStatus === 'paused'`) skeleton fermo.
- Le sezioni condizionali hanno blocchi solo a ruolo noto; le pagine riservate hanno lo
  skeleton anche prima (spec, sezione 2 punto 3). Ruolo noto: presente nel profilo
  corrente, anche ripristinato; i controlli di revoca non cambiano.
- **Un solo annuncio di caricamento per pagina**, non un solo `role="status"`: conteggi,
  conferme e banner offline restano con i loro status e il loro testo (decisione del
  coordinatore, spec, sezione 2 punto 1).
- Stessa struttura del contenuto, nello stesso ordine (spec, punto 6); righe in attesa
  dentro una scheda vera con un proprio blocco pieno (spec, punto 7).
- Titoli dai dati: sempre `Skeleton` della stessa attesa del corpo (soglia e pausa), link
  indietro fuori dal sottoalbero nascosto.
- Codice e commenti in inglese, commit in italiano.
- Prove solo con il server di sviluppo o lo stack locale, mai la produzione (`AGENTS.md`).

## Attenzione in revisione

- Annidamento: un `LoadingArea` dentro un `LoadingScope` **senza** `gather` resta
  indipendente come oggi (il foglio «Cambia ricetta» dentro il Menu non deve cambiare);
  i test di W20 restano verdi senza modifiche (Task 1).
- Un solo status con «Caricamento…» nelle pagine con più letture (Membri da
  amministratore, Amministrazione, Ricettario da curatore), anche quando un'area finisce
  prima delle altre, e gli altri status intatti: conteggio delle ricette, «{nome}
  eliminato» in Amministrazione (Task 1, 4, 6, 7).
- Righe in attesa dentro schede vere (Utenti, Inviti, Agenti, Link, Ingressi): visibili
  come blocchi pieni dopo 200 ms, non trasparenti; controllo nei test (classe
  `skeleton-block` sul blocco esterno della riga) e a occhio nel browser (Task 2, 10).
- Passaggi intermedi: profilo → dettaglio → liste in Membri e Amministrazione senza
  spostamenti nel caso comune (Task 4, 6, 10).
- Non curatore e non amministratore: nessun blocco delle sezioni del ruolo in nessun
  istante, anche senza profilo salvato (Task 4, 7).
- `AdminAccessGate` durante la verifica dopo un rifiuto: skeleton, poi il contenuto o «Non
  hai accesso», mai i dati di prima (Task 6).
- `/password` offline: blocchi fermi, nessuna chiamata ad Auth, frammento invariato,
  nessuna operazione registrata come occupata; al ritorno della rete la verifica parte e i
  blocchi riprendono a pulsare (Task 9).
- Dimensioni nel caso comune verificate nel browser a 390 px (Task 10).

## Struttura dei file

- `web/src/components/Skeleton.tsx`: `gather` e `label` (Task 1).
- `web/src/components/PageSkeletons.tsx`: pezzi condivisi (Task 2).
- `web/src/test/holdCalls.ts`: aiuto dei test, spostato da `RecipesPage.skeleton.test.tsx`
  (Task 2).
- Pagine: un layout di attesa nello stesso file della pagina, come `ShoppingWaiting` e
  `RecipeLayout` in W20. Test di ogni pagina in `<Pagina>.skeleton.test.tsx` accanto.

## Matrice dei test di pagina

Per ogni pagina coperta (come in W20): **attesa → contenuto** (dopo
`vi.advanceTimersByTime(200)` o `waitFor`, `.skeleton[data-visible="true"]` presente, area
con `aria-busy`, esattamente uno status con testo «Caricamento…»
(`screen.getAllByRole('status').filter((s) => s.textContent === 'Caricamento…')` lungo 1),
gli altri status della pagina invariati; all'arrivo nessun `.skeleton` e nessuno status
«Caricamento…»), **titolo** dove viene dai dati (prima dei 200 ms `data-visible="false"`,
offline `data-paused="true"`, link indietro fuori da ogni `[aria-hidden="true"]`), **attesa → errore** dove la pagina ha un errore proprio (status vuoto, nessuno
skeleton), **copia salvata → contenuto subito** (nessun `.skeleton` mentre la nuova lettura
è trattenuta). Le letture si trattengono con `holdCalls(api, area, method)`; il profilo con
`holdCalls(api, 'profile', 'get')`; offline con `setOnline(false)` di `test/connectivity.ts`.

---

### Task 1: attesa che raccoglie e testo dell'annuncio

**File:**
- Modifica: `web/src/components/Skeleton.tsx`
- Test: `web/src/components/Skeleton.test.tsx`

**Interfacce prodotte:**
- `LoadingScope({ loading = false, paused = false, gather = false, label, children }: { loading?: boolean; paused?: boolean; gather?: boolean; label?: string; children: ReactNode })`.
  - **Radice** (nessun antenato con `gather`): attesa = `loading` oppure una qualsiasi attesa
    segnalata dai discendenti; in pausa quando ogni attesa attiva (la propria e quelle
    segnalate) è in pausa; `shown = useShowAfter(attesa)`; rende l'unico
    `<span role="status" className="visually-hidden">` con `label ?? t('common.loading')`
    quando `shown`.
  - **Dentro un antenato con `gather`**: non rende status; segnala `{ loading, paused }` al
    più vicino antenato con `gather` (che a sua volta, se non è radice, li inoltra alla
    radice: basta registrarsi sempre presso la radice); il suo contesto è
    `{ loading, shown: radice.shown && loading, paused: radice.paused && loading }`.
  - Senza antenato con `gather` un `LoadingScope` annidato resta indipendente (com'è oggi).
- `LoadingArea` accetta `label?: string` e lo passa al suo `LoadingScope`; dentro un
  antenato con `gather` si unisce a lui (conseguenza della regola sopra).
- `BusyArea` invariato: `aria-busy` dal `loading` del proprio contesto, quindi solo l'area
  che aspetta.
- Registrazione: lo scope con `gather` tiene le attese in uno stato (`Map` per id da
  `useId`); i figli si registrano in un `useEffect` che dipende da `loading` e `paused` e si
  tolgono nella pulizia. Dentro un'attesa già visibile i blocchi di un'area nuova compaiono
  subito (la soglia è quella della pagina).

- [ ] **Passo 1: test**, con timer finti, nel file esistente:
  - `it('gathers the waits of inner areas into one status')`: `<LoadingScope gather>` con due
    `LoadingArea` (`loading` vero); dopo 200 ms un solo `getAllByRole('status')` con
    «Caricamento…» ed entrambi gli `.skeleton` con `data-visible="true"`.
  - `it('shows an inner area as soon as its data arrives')`: la prima area finisce → il suo
    contenuto c'è, il suo `BusyArea` non ha `aria-busy`, l'altra è ancora `aria-busy` e lo
    status dice ancora «Caricamento…»; finita anche la seconda, status vuoto.
  - `it('pauses the gathered wait only when every wait is paused')`: una in pausa e una no →
    nessun `data-paused`; entrambe in pausa → `data-paused="true"` su tutti gli skeleton.
  - `it('keeps a nested scope without gather independent')`: `LoadingScope loading` con dentro
    un `LoadingArea loading` → due status (comportamento di oggi).
  - `it('announces the given label')`: `LoadingArea label="Verifico il link…"` → dopo 200 ms
    lo status dice «Verifico il link…».
- [ ] **Passo 2:** `npx vitest run src/components/Skeleton.test.tsx` → i nuovi test falliscono.
- [ ] **Passo 3:** implementa in `Skeleton.tsx` come nelle interfacce, aggiornando il
  commento in testa.
- [ ] **Passo 4:** `npx vitest run src/components/Skeleton.test.tsx` e `npm test` → tutto verde
  (i test di W20 invariati).
- [ ] **Passo 5:** commit «Skeleton: attesa che raccoglie le aree interne e testo dell'annuncio».

### Task 2: pezzi condivisi e aiuto dei test

**File:**
- Modifica: `web/src/components/PageSkeletons.tsx`
- Crea: `web/src/test/holdCalls.ts` (sposta `gate` e `holdCalls` da
  `web/src/routes/RecipesPage.skeleton.test.tsx`, che li importa da qui)
- Test: `web/src/components/PageSkeletons.test.tsx`

**Interfacce prodotte.** Due tipi di pezzi (spec, punto 7):
- **righe** (`SkeletonRows`), che vanno o dentro una scheda tutta a blocchi (righe vuote:
  il blocco è la scheda) o direttamente dentro una scheda vera (`filled`: ogni riga ha i
  suoi blocchi pieni). In entrambi i casi stanno dentro un `Skeleton` (che le nasconde e
  applica soglia e pausa);
- **schede, campi, pulsanti e titoli**, che compongono il layout nell'ordine del contenuto
  vero: nessun pezzo impone un ordine ai figli.

- `SkeletonRows({ count, small = true, chip = false, link = false, lead = false, trail = false, filled = false, action, className }: { count: number; small?: boolean; chip?: boolean; link?: boolean; lead?: boolean; trail?: boolean; filled?: boolean; action?: ReactNode; className?: string })`:
  `<ul className="row-list">` con `count` `<li>`. Ogni `li` contiene: con `link` uno
  `<span className={`row-link ${className ?? ''}`}>` (struttura delle righe-collegamento
  di Profilo e Utenti) con, se `lead`, un `<svg className="icon" />` iniziale, il testo e,
  se `trail`, un `<svg className="icon" />` finale; senza `link` il testo direttamente e
  `className` va sul `li` (righe con `styles.wrap`, `styles.link`, …); il testo è `<span className="row-main"><span className="skeleton-line" />{small && <small className="skeleton-line" />}</span>`;
  con `chip` uno `<span className="label-chip">` con ` `; in fondo `action`. Con
  `filled` la `row-main` ha anche `skeleton-block` (blocco pieno arrotondato che pulsa,
  alto quanto il testo della riga dentro l'altezza minima di 52 px del `li`), e `action`
  deve essere un `ButtonSkeleton`, che è già un blocco.
- `SettingsCardSkeleton({ title = true, className, children }: { title?: boolean; className?: string; children?: ReactNode })`:
  `<section className={`settings-card skeleton-card ${className ?? ''}`}>` con
  `<h2 className="skeleton-line" />` se `title`, poi `children` nell'ordine dato (righe,
  campi, testi, pulsanti).
- `TextSkeleton({ as = 'p', className, lines = 1 }: { as?: ElementType; className?: string; lines?: number })`:
  l'elemento con la classe del testo vero (`meta-line`, `description`, …) e `lines`
  `skeleton-line`: per suggerimenti e note statiche dentro schede a blocchi.
- `FieldSkeleton()`: `<div className="field">` con una `skeleton-line` per l'etichetta e un
  `<span className="skeleton-block" style={{ height: 44 }} />` per il campo (min-height dei
  campi in `global.css`).
- `ButtonSkeleton({ wide = false, className }: { wide?: boolean; className?: string })`:
  `<span className={`text-button skeleton-block ${wide ? 'wide' : ''} ${className ?? ''}`}>{' '}</span>`:
  stesse misure e margini del pulsante vero (`text-button`, eventuale classe del modulo).
- `TitleSkeleton({ width = '60%', height = '1lh', className = 'skeleton-block' }: { width?: string; height?: string; className?: string })`:
  `<Skeleton as="span" className={className} style={{ width, height }} />`. È un `Skeleton`,
  quindi legge l'attesa della pagina: va dentro lo stesso `LoadingScope` del corpo, dentro
  l'`h1` vero (`PageHeader title={<TitleSkeleton />} titleHidden`, oppure l'`h1` della
  pagina con `aria-hidden` durante l'attesa). Il link indietro resta fuori dall'`h1`.
  `height: '2lh'` per un titolo su due righe (Autorizzazione).

- [ ] **Passo 1: test** in `PageSkeletons.test.tsx`, con timer finti:
  - `it('builds cards in the given order with the page classes')`: dentro
    `<LoadingScope loading><Skeleton><SettingsCardSkeleton><FieldSkeleton /><SkeletonRows count={3} /></SettingsCardSkeleton></Skeleton></LoadingScope>`
    la `.settings-card.skeleton-card` ha come figli in ordine `h2`, `.field`, `ul.row-list`;
    tre `li` con `.row-main .skeleton-line`; nessun elemento focalizzabile
    (`button, a, input, select, [tabindex]` assenti).
  - `it('fills each row inside a real card')`: `<SkeletonRows count={2} filled action={<ButtonSkeleton />} />`
    in un `Skeleton` → ogni `li` ha `.row-main.skeleton-block` e `.text-button.skeleton-block`;
    senza `filled` nessun `.row-main.skeleton-block`.
  - `it('builds link rows like the profile')`: `link lead trail` → `li > .row-link > svg.icon + .row-main + svg.icon`; `link` senza icone → `li > .row-link > .row-main`.
  - `it('holds the title back for the delay and stops it offline')`:
    `<LoadingScope loading paused><h1><TitleSkeleton /></h1></LoadingScope>` → prima dei
    200 ms `data-visible="false"`, dopo `true`, `data-paused="true"`; con `height="2lh"` lo
    stile ha `height: 2lh`.
- [ ] **Passo 2:** `npx vitest run src/components/PageSkeletons.test.tsx` → fallisce.
- [ ] **Passo 3:** implementa; sposta `gate`/`holdCalls` in `test/holdCalls.ts` (export
  `gate`, `holdCalls`).
- [ ] **Passo 4:** `npx vitest run src/components/PageSkeletons.test.tsx src/routes/RecipesPage.skeleton.test.tsx` → verde.
- [ ] **Passo 5:** commit «Skeleton: righe, schede, campi, pulsanti e titoli condivisi».

### Task 3: Esclusioni e Impostazioni

**File:**
- Modifica: `web/src/routes/profile/ExclusionsPage.tsx`, `web/src/routes/profile/SettingsPage.tsx`
- Test: `web/src/routes/profile/ExclusionsPage.skeleton.test.tsx`,
  `web/src/routes/profile/SettingsPage.skeleton.test.tsx`

**Interfacce:**
- Consuma: Task 1-2. `FamilyGate` resta com'è (con `waiting` facoltativo) fino al Task 4.
- In ogni pagina un `XLayout({ loading, paused, children })` con `secondary-view`,
  `page-column`, `PageHeader` vero e, in attesa, `LoadingScope` + `BusyArea` + `Skeleton`;
  lo usano sia `waiting` del controllo sia la pagina mentre la lettura non ha dati.

- [ ] **Passo 1: test** (matrice dei test di pagina) per `/profile/family/exclusions` e
  `/profile/family/settings`, più:
  - `it('exclusions: header and three rows while the profile and the list load')`: profilo
    trattenuto → un solo `h1` con il testo di `profile.exclusions`, link indietro al Profilo
    vero, tre `.row-list > li` nello skeleton; profilo libero e lista trattenuta → stesso
    `h1`, ancora tre righe a blocchi.
  - `it('exclusions: an empty list replaces the skeleton with the notice')`.
  - `it('settings: intro, name, diners and rules cards while loading')`: nello skeleton in
    ordine la riga `styles.intro`, una scheda con `.field`, una scheda con `h2`,
    `.meta-line` e una tabella di 7 righe da 2 celle (classe `cell` di
    `DinersGrid.module.css`), una scheda con `h2` e due righe.
  - `it('settings: the saving status is not the loading announcement')`: con le
    impostazioni caricate e una scrittura delle regole trattenuta, lo status «Salvataggio…»
    c'è e nessuno status dice «Caricamento…».
- [ ] **Passo 2:** esegui i due file → falliscono.
- [ ] **Passo 3:** implementa:
  - Esclusioni: `SettingsCardSkeleton title={false}` con
    `SkeletonRows count={3} className={styles.wrap} action={<ButtonSkeleton className={styles.small} />}`
    (la scheda vera non ha `h2`; righe con `styles.wrap` come le vere).
  - Impostazioni: `TextSkeleton className={`meta-line ${styles.intro}`}` fuori dalle schede
    come `Skeleton` a blocco (`skeleton-block`, `width: '70%'`); scheda del nome con
    `FieldSkeleton`; scheda dei commensali con `TextSkeleton className="meta-line"` e una
    `<table className={dinersStyles.diners}>` con intestazione vuota e 7 righe da 2 celle
    `<span className={dinersStyles.cell} />` (importa `DinersGrid.module.css` nella
    pagina); scheda delle regole con `SkeletonRows count={2} small={false}`.
- [ ] **Passo 4:** i due file e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: Esclusioni e Impostazioni».

### Task 4: Membri, `FamilyGate` senza `Loading`

**File:**
- Modifica: `web/src/routes/profile/MembersPage.tsx`, `web/src/components/FamilyGate.tsx`
- Test: `web/src/routes/profile/MembersPage.skeleton.test.tsx`, `web/src/components/FamilyGate.test.tsx`

**Interfacce:**
- Consuma: Task 1-3. Il ruolo è `family.role` della `FamilyView` (dal profilo), noto prima
  del dettaglio.
- `MembersLayout` con `<LoadingScope gather>` attorno al contenuto della colonna; il
  contenuto ha la stessa struttura in ogni momento dopo il profilo, e solo le aree cambiano:
  - scheda dei membri: `LoadingArea` con `SettingsCardSkeleton` contenente
    `SkeletonRows count={3} chip` e, per un `member`, `TextSkeleton className="meta-line"`
    («Chiedi a …»), finché `detail` non ha dati e non ha errore bloccante;
  - solo con `family.role === 'family_admin'`: `LinksCard` e `JoinsCard` **vere dal primo
    istante** (titolo, suggerimento, pulsante «Crea un link»). Cambiano firma:
    `LinksCard({ familyId, timeZone, links, onCreate, onRevoke }: { familyId: string; timeZone: string | null; links: UseQueryResult<…>; onCreate: (() => void) | null; onRevoke: … })`
    con il pulsante spento quando `onCreate` è `null` (dettaglio non arrivato: il foglio
    vuole il nome della famiglia) e
    `JoinsCard({ familyId, timeZone }: { familyId: string; timeZone: string | null })`;
    le query usano `familyId` (lo stesso id del dettaglio). In ciascuna `Loading` diventa
    un `LoadingArea` con `SkeletonRows count={1} filled` (link: `action={<ButtonSkeleton className={styles.small} />}`,
    `className={styles.link}`; ingressi: `className={styles.join}`) finché manca la lista
    o `timeZone` (righe formattate nel fuso della famiglia), senza errore bloccante;
  - «Lascia la famiglia»: nella `danger.dangerZone`, `Skeleton` con
    `ButtonSkeleton wide className={danger.dangerOutline}` finché manca il dettaglio;
  - in attesa del profilo (`waiting` del controllo) il ruolo non è noto: solo scheda dei
    membri (senza la riga «Chiedi a …») e pulsante.
- Dopo Membri, `FamilyGate` prende `waiting: (paused: boolean) => ReactNode`
  **obbligatorio** e perde il ramo `Loading`: prima controlla con
  `grep -rn "<FamilyGate" web/src` che ogni uso (Menu, Spesa, Ricetta, Ricettario,
  Membri, Impostazioni, Esclusioni) lo passi, poi `npm run typecheck`.

- [ ] **Passo 1: test**, matrice più:
  - `it('members: admin cards are real from the start for an administrator')`: profilo in
    copia, dettaglio trattenuto, utente `family_admin` → titoli «Link d'invito» e
    «Ingressi» veri, «Crea un link» spento, una riga a blocchi pieni in ciascuna
    (`.row-main.skeleton-block`), scheda dei membri a blocchi; un solo «Caricamento…».
  - `it('members: a member never sees the admin cards')`: utente `member`, dettaglio
    trattenuto → una sola scheda a blocchi; a dati arrivati nessuno skeleton.
  - `it('members: one announcement while links and joins load after the detail')`:
    dettaglio libero, `familyInvitations.list` e `listJoins` trattenuti → scheda dei
    membri vera, «Crea un link» acceso, un solo status «Caricamento…», `aria-busy` solo
    nelle due aree delle liste; liberati, nessuno status «Caricamento…».
  - `it('members: no admin cards while the profile is unknown')`: profilo trattenuto →
    una sola scheda a blocchi, nessun titolo «Link d'invito».
  - In `FamilyGate.test.tsx` togli o adatta il caso che si aspetta `Loading` senza
    `waiting`.
- [ ] **Passo 2:** esegui → fallisce.
- [ ] **Passo 3:** implementa Membri, poi `FamilyGate`.
- [ ] **Passo 4:** `npm run typecheck`, il file, `MembersPage.test.tsx`, `FamilyGate.test.tsx`
  e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: Membri e controllo della famiglia senza Caricamento».

### Task 5: Profilo, Preferenze, Agenti

**File:**
- Modifica: `web/src/routes/ProfilePage.tsx`, `web/src/routes/profile/PreferencesPage.tsx`,
  `web/src/features/agents/AgentsPage.tsx`
- Test: `web/src/routes/ProfilePage.skeleton.test.tsx`,
  `web/src/routes/profile/PreferencesPage.skeleton.test.tsx`,
  `web/src/features/agents/AgentsPage.skeleton.test.tsx`

**Interfacce:** Consuma Task 1-2. Attesa = `!blocked && !read.data` (profilo), in pausa con
`read.fetchStatus === 'paused'`.

- Profilo: un `LoadingScope` per tutta la colonna. Intestazione: l'`h1` di `styles.name`
  con `aria-hidden` durante l'attesa contiene `<TitleSkeleton width="50%" />`; la riga
  dell'email è `<Skeleton as="p" className={`${styles.email} skeleton-block`} style={{ width: '40%', height: '1lh' }} />`.
  Poi `BusyArea` con due schede nell'ordine vero:
  - famiglia: `SettingsCardSkeleton` con `SkeletonRows count={3} link lead trail small={false}`
    (righe `row-link` con icona, testo, freccia; i conteggi arrivano dopo senza skeleton:
    la riga resta alta 52 px, spec, censimento);
  - Famiglie: `SettingsCardSkeleton` con `SkeletonRows count={1} link className={styles.family}`
    (testo e ruolo) e `TextSkeleton as="span" className="link-inline"` per «Crea un'altra
    famiglia».
  La scheda Account resta vera, fuori da ogni `Skeleton`.
- Preferenze: al posto di `{profile && …}` in attesa un `LoadingArea` con
  `SettingsCardSkeleton title={false}` contenente `FieldSkeleton` e
  `<p className={styles.static}><span className="skeleton-line" /><div className="skeleton-line" /></p>`
  (etichetta con la dimensione di `.static span`, valore con quella del paragrafo, distanza
  6 px della griglia; usa `div` per il valore perché il selettore `.static span` non lo
  tocchi, e quindi `p` diventa un `div` con la stessa classe). Le altre schede vere.
- Agenti: nella scheda «Agenti collegati» `Loading` diventa `LoadingArea` con
  `SkeletonRows count={1} filled className={styles.agent} action={<ButtonSkeleton />}`;
  `paused` dal `fetchStatus` di `agents`.

- [ ] **Passo 1: test**, matrice per le tre pagine (titolo compreso per il Profilo), più:
  - `it('profile: the account card is real and usable while the profile loads')`: profilo
    trattenuto → il link «Preferenze» è presente fuori dagli `.skeleton` e porta a
    `/profile/preferences`.
  - `it('profile: rows have the link structure of the real rows')`: righe dello skeleton
    con `li > .row-link > .row-main`.
  - `it('agents: the waiting row is a filled block inside the real card')`:
    `.row-main.skeleton-block` dentro la scheda vera «Agenti collegati».
  - `it('agents: the disconnected notice is not the loading announcement')`: dopo uno
    scollegamento, con la lista di nuovo trattenuta da zero (`removeQueries`), lo status
    «… scollegato» resta e c'è un solo «Caricamento…».
- [ ] **Passo 2:** esegui → falliscono.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** i tre file, i test esistenti delle tre pagine e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: Profilo, Preferenze e Agenti».

### Task 6: amministrazione

**File:**
- Modifica: `web/src/features/admin/AdminAccess.tsx`, `AdminPage.tsx`, `UsersSection.tsx`,
  `InvitationsSection.tsx`, `UserPage.tsx`, `UserDeletePage.tsx`
- Test: `web/src/features/admin/AdminPage.skeleton.test.tsx`,
  `web/src/features/admin/UserPage.skeleton.test.tsx`,
  `web/src/features/admin/UserDeletePage.skeleton.test.tsx`

**Interfacce:**
- `AdminAccessGate({ fallbackHeader, waiting, children }: { fallbackHeader?: ReactNode; waiting: (paused: boolean) => ReactNode; children: ReactNode })`:
  `fallbackHeader` resta per errore e «Non hai accesso»; durante `checking` e durante la
  lettura del profilo (`state.status === 'profile' && !profile.data && !profile.isError`)
  rende `waiting(paused)`, con `paused = profile.fetchStatus === 'paused'` (in `checking`
  `false`). Tutti e tre i chiamanti lo passano nello stesso task.
- `/admin`: `AdminPage` avvolge `AdminAccessGate` in `<LoadingScope gather>`; lo status
  «{nome} eliminato» resta fuori dallo scope e invariato. `waiting` rende, in un
  `LoadingArea loading`, nell'ordine vero:
  - scheda Utenti: `SettingsCardSkeleton` con, in ordine,
    `<span className={`${styles.search} skeleton-block`} style={{ height: 44 }} />` e
    `SkeletonRows count={3} link trail` (nome ed email);
  - scheda Inviti: `SettingsCardSkeleton title={false}` con `<div className={styles.heading}>`
    (`h2` come `skeleton-line` e `ButtonSkeleton className="primary"`) e `<ul className={styles.list}>`
    con due `<li className={styles.item}>` di quattro `skeleton-line` (email, ruoli, stato,
    autore).
  Nelle sezioni vere `Loading` diventa un `LoadingArea`, sotto il campo e sotto
  l'intestazione come oggi: `SkeletonRows count={3} link trail filled` per gli utenti; due
  `<li className={styles.item}>` con un `<span className="skeleton-block">` di quattro
  `skeleton-line` per gli inviti. Si uniscono all'attesa della pagina.
- Dettaglio utente: `waiting` e attesa del dettaglio rendono, dentro un `LoadingScope`
  (radice della pagina, che contiene anche l'intestazione),
  `PageHeader back={back} title={<TitleSkeleton />} titleHidden`, la riga dell'email
  (`Skeleton as="p"` con `meta-line ${styles.userEmail} skeleton-block`), una
  `SettingsCardSkeleton` con due `<label className={styles.switch}>` di due
  `skeleton-line` (ruoli), una `SettingsCardSkeleton` con `SkeletonRows count={1}` e
  `TextSkeleton className="meta-line"` (famiglie), e nella `danger.dangerZone`
  `ButtonSkeleton wide className={danger.dangerOutline}`.
- Eliminazione utente: link indietro vero «Utenti», titolo `TitleSkeleton` nello stesso
  scope, riga dell'email, `h2` di `styles.sectionTitle` come `skeleton-line`, una scheda
  famiglia `DeletionFamilySkeleton` (in `features/account/DeletionFamilies.tsx`:
  `settings-card ${styles.card} skeleton-card` con `h3` e `p` di una `skeleton-line`; la
  riusa il Task 8) e la scheda «Cosa sparisce» (`settings-card ${styles.card} skeleton-card`
  con `h2.${styles.cardTitle}`, `p` di due righe, `p.meta-line` e
  `ButtonSkeleton wide className={styles.confirm}`).

- [ ] **Passo 1: test**, matrice più:
  - `it('admin: one announcement through the access check and the two lists')`: profilo
    trattenuto → due schede a blocchi, nella scheda Utenti il campo prima delle righe, un
    solo «Caricamento…»; profilo libero, `users.list` e `appInvitations.list` trattenuti →
    campo di ricerca vero, righe a blocchi pieni (`.row-main.skeleton-block`) sotto il
    campo, un solo «Caricamento…»; liberati → nessuno skeleton né «Caricamento…».
  - `it('admin: the deleted notice stays next to the loading announcement')`: apertura con
    `state.userDeleted` e liste trattenute → lo status «… eliminato» c'è e c'è un solo
    «Caricamento…».
  - `it('admin: the check after a forbidden shows the skeleton, then the outcome')`: come i
    test esistenti di `AdminPage.test.tsx` per il rifiuto, con la lettura del profilo della
    verifica trattenuta → skeleton e nessuna riga utente; liberata con un profilo senza
    `app_admin` → «Non hai accesso a questa pagina», nessuno skeleton.
  - `it('user: the title is a hidden block until the name arrives')`: un solo `h1`, con
    `aria-hidden`, senza testo, il cui blocco ha `data-visible="false"` prima dei 200 ms e
    `data-paused="true"` offline; link indietro «Amministrazione» fuori da ogni
    `[aria-hidden="true"]`; poi il nome.
- [ ] **Passo 2:** esegui → falliscono.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** `npm run typecheck`, i nuovi file, `AdminPage.test.tsx`,
  `UsersSection.test.tsx`, `UserPage.test.tsx`, `UserDeletePage.test.tsx` e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: amministrazione».

### Task 7: sezioni dei curatori e bozza

**File:**
- Modifica: `web/src/routes/RecipesPage.tsx`, `web/src/features/catalogue/CatalogueDraftsSection.tsx`,
  `ArchivedRecipesSection.tsx`, `queries.ts`, `DraftPage.tsx`
- Test: `web/src/routes/RecipesPage.skeleton.test.tsx` (si aggiunge),
  `web/src/features/catalogue/DraftPage.skeleton.test.tsx`

**Interfacce:**
- `RecipesPage`: la colonna (sotto `RecipeFilters`) in `<LoadingScope gather>`; i
  `LoadingArea` dei risultati restano e si uniscono. L'albero resta lo stesso in ogni stato
  (vincolo di W20: titolo e filtri mai rimontati). Il conteggio «N ricette» resta il suo
  status.
- In `features/catalogue/queries.ts`:
  `useCachedOverviewCounts(): { drafts: number; archived: number } | null`: fra i
  riepiloghi in memoria (`queryClient.getQueriesData<OverviewView>({ queryKey: ['catalogue', 'overview'] })`,
  di qualunque lingua) il primo con dati; `null` se nessuno. Spec, sezione 3: in pratica
  quello di un'altra lingua.
- `CatalogueDraftsSection`: con `isCurator` e riepilogo in attesa (`query.isPending`, non
  `blocked`) il numero di schede è `min(3, counts.drafts)` se `counts` c'è, altrimenti 1;
  con 0 rende `null` (non c'è sezione da riservare). Rende
  `LoadingArea loading paused={query.fetchStatus === 'paused'}` con
  `<section className={styles.section}>`: `h2.${styles.heading}` con
  `<span className={`${styles.toggle} skeleton-block`} style={{ width: '30%' }} />` (alto
  44 px dalla classe) e `<ul className={styles.cards}>` con N `<li><span className={`${styles.card} skeleton-card`}>`
  contenenti `styles.top`, `styles.title` e `styles.state`, ciascuno con una
  `skeleton-line`. Senza curatore `null` come oggi.
- `ArchivedRecipesSection`: con `isCurator` e riepilogo in attesa, se `counts` dice 0
  archiviate `null`, altrimenti `<section className={`${styles.section} ${styles.archived}`}>`
  con il titolo a blocco come sopra, in un `LoadingArea`.
- `DraftPage`: un `DraftLayout({ loading, paused, children })` con un `LoadingScope` che
  contiene `PageHeader back title={loading ? <TitleSkeleton /> : …} titleHidden={loading}`,
  usato sia durante la lettura del profilo sia durante quella della bozza e, con i dati,
  dalla vista; in attesa: etichetta (`styles.kind` con un `label-chip` di ` `),
  `TextSkeleton className="description" lines={2}`, `TextSkeleton className="meal-meta"`,
  `section.${styles.block} skeleton-card` con `h2.${styles.blockHeading}` e quattro `li` di
  `styles.lines`, `section.${styles.block} skeleton-card` con `h2` e `dl.${styles.attributes}`
  di quattro coppie `dt`/`dd` di una `skeleton-line`. Gli stati «non disponibile», rifiuto
  ed errore usano lo stesso `PageHeader` con il solo link indietro (come oggi).

- [ ] **Passo 1: test**, in `RecipesPage.skeleton.test.tsx`, con una fixture del caso comune
  (una bozza, nome su una riga, una riga di mancanze; un'archiviata):
  - `it('curator: one draft card and the archived title while the overview loads')`:
    profilo con `recipe_curator` (come `RecipesPage.catalogue.test.tsx`), `catalogue.overview`
    trattenuto, nessun riepilogo in memoria → una sezione con una `.skeleton-card` sopra i
    risultati e il titolo a blocco delle archiviate dopo i risultati.
  - `it('curator: the count of a cached overview in another language')`: riepilogo con due
    bozze in memoria per `en-GB`, pagina in italiano con l'overview trattenuta → due schede;
    con zero bozze in memoria → nessuna sezione Bozze a blocchi.
  - `it('curator: the recipe count and one loading announcement')`: ricette libere,
    overview trattenuta → lo status «N ricette» c'è e c'è un solo «Caricamento…»; liberata,
    nessun «Caricamento…».
  - `it('curator: sections replace their blocks')`: overview della fixture → sezioni vere,
    nessuno skeleton. Il confronto del `top` dei risultati si fa nel browser (Task 10): qui
    basta che la sezione Bozze vera abbia lo stesso numero di schede dello skeleton.
  - `it('curator: no drafts removes the section on arrival')`: overview `{ drafts: [], archived: [] }`
    → nessuna sezione, nessuno skeleton.
  - `it('role arrives during the wait: blocks join, filters stay')`: profilo e overview
    trattenuti → nessun blocco delle sezioni; profilo liberato come curatore, overview
    ancora trattenuta → compare la sezione Bozze a blocchi, il nodo del campo dei filtri è
    lo stesso di prima (`toBe`), un solo «Caricamento…».
  - `it('not a curator: never a block of the sections')`: profilo senza ruolo, ricette
    trattenute → nessun `.skeleton` fuori dall'area dei risultati in nessun momento
    (controlla subito, dopo 200 ms e all'arrivo); con profilo trattenuto e poi liberato
    senza ruolo, idem.
  - `it('curator: no section blocks with the overview cached')`.
  - Aggiorna il test esistente di W20 che verifica «niente skeleton nelle sezioni dei
    curatori», se c'è: ora i blocchi ci sono (cerca `curator` in
    `RecipesPage.skeleton.test.tsx` e `RecipesPage.catalogue.test.tsx`).
  - In `DraftPage.skeleton.test.tsx`: matrice (titolo compreso), più «profilo trattenuto →
    skeleton della bozza; liberato senza ruolo → "Bozza non disponibile" e nessuno skeleton».
- [ ] **Passo 2:** esegui → falliscono.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** i file, `RecipesPage.catalogue.test.tsx`, `CatalogueDraftsSection.test.tsx`,
  `ArchivedRecipesSection.test.tsx`, `DraftPage.test.tsx` e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: sezioni dei curatori e bozza».

### Task 8: eliminazioni di famiglia e account

**File:**
- Modifica: `web/src/features/family-delete/FamilyDeletePage.tsx`,
  `web/src/features/account/AccountDeletePage.tsx`
- Test: `FamilyDeletePage.skeleton.test.tsx`, `AccountDeletePage.skeleton.test.tsx` accanto

**Interfacce:** i due `Loading` diventano `LoadingArea` (pausa dal `fetchStatus` della
lettura in corso: profilo o riepilogo per la famiglia, piano per l'account).
- Famiglia: `section.settings-card.skeleton-card` con `h2` e `p` di una `skeleton-line`,
  `ul.${styles.facts}` con due `li` vuoti alti una riga, `p.meta-line` con una riga e
  `ButtonSkeleton wide className={styles.confirm}`.
- Account: `h2.${styles.sectionTitle}` come `skeleton-line`, `DeletionFamilySkeleton`
  (Task 6) e la scheda «Cosa sparisce» come nell'eliminazione utente (Task 6), con il
  pulsante a blocco.

- [ ] **Passo 1: test**: matrice per le due pagine.
- [ ] **Passo 2:** esegui → falliscono.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** i file, i test esistenti delle due pagine e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: eliminazioni di famiglia e account».

### Task 9: pagine pubbliche: inviti, autorizzazione, `/password`

**File:**
- Modifica: `web/src/features/app-invitations/InvitePage.tsx`,
  `web/src/features/family-invitations/InvitePage.tsx`,
  `web/src/features/agents/AuthorizePage.tsx`,
  `web/src/features/password/ChoosePasswordPage.tsx`
- Test: si aggiungono casi nei file `*.test.tsx` esistenti delle quattro pagine, con il
  modo in cui già trattengono le chiamate (client degli inviti, `backend.getAuthorization`,
  verifica del link)

**Interfacce:** la fase `loading` diventa `LoadingArea loading` (nessuna pausa: sono chiamate
dirette), con blocchi fuori dalle schede (`entry-page` non ha schede, quindi i
`skeleton-block` sono visibili). Qui il titolo sta dentro l'area in attesa (la pagina non
ha intestazione propria oltre a marchio e lingue, che restano veri), quindi è un semplice
`<span className="entry-title skeleton-block" style={{ width: '70%', height: '1lh' }} />`
dentro lo `Skeleton` del `LoadingArea`, non un `TitleSkeleton` (che è a sua volta uno
`Skeleton`):
- Invito all'app: il titolo a blocco, un `p` con `skeleton-line`, e se
  `state.status === 'signedIn'` un `p` e `ButtonSkeleton wide`, altrimenti due
  `FieldSkeleton` con una riga di suggerimento (`styles.help` con `skeleton-line`), un
  `p.${styles.help}` e `ButtonSkeleton wide`.
- Invito alla famiglia: come sopra, scelto da `identity`; senza accesso in più il `p`
  «Hai già un account?» come `skeleton-line`.
- Autorizzazione: titolo a blocco con `entry-title ${styles.title}` alto due righe
  (`height: '2lh'`), `p.meta-line`, `div.${styles.account}` con tre `skeleton-line`,
  `h2.${styles.heading}` e due `p`, come blocchi. «Leggo i tuoi ruoli…» invariato.
- `/password`: `Waiting` diventa `LoadingArea loading paused={!online} label={online ? t('password.choose.verifying') : undefined}`
  (offline l'annuncio è «Caricamento…»: nulla viene verificato, spec) con il titolo a
  blocco, un `p`, due `FieldSkeleton` (il primo con la riga di suggerimento), `p.meta-line`
  e `ButtonSkeleton wide`; offline non ritorna più `null`. Nessun cambiamento a
  `startVerification`, a `useBusyCheck` né all'effetto che legge il frammento.

- [ ] **Passo 1: test**:
  - per ogni pagina: chiamata trattenuta → dopo 200 ms skeleton visibile e status
    «Caricamento…» (per `/password` «Verifico il link…»); liberata → contenuto, nessuno
    skeleton; errore → messaggio di oggi, nessuno skeleton.
  - Aggiorna `it('before the verification (offline) the page is free and the fragment stays')`
    in `ChoosePasswordPage.test.tsx`: l'asserzione «nessun `[aria-busy="true"]`» diventa
    «l'area in attesa ha `aria-busy` e i blocchi `data-paused="true"`», e restano tutte le
    altre: `server.calls` lungo 0, `registeredBusy()` falso, frammento
    `#token_hash=hash-1&type=recovery` invariato, nessun testo «Verifico il link…» (né
    visibile né nello status, che dopo 200 ms dice «Caricamento…»).
  - `it('password: back online the verification starts and the blocks pulse')`:
    `setOnline(true)` → una chiamata di verifica, `data-paused` assente, status «Verifico il
    link…» dopo 200 ms.
  - `it('family invite: the form blocks without an account, the join button with one')`.
- [ ] **Passo 2:** esegui → falliscono.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** i quattro file di test e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: inviti, autorizzazione e verifica del link».

### Task 10: `design/design.md`, verifica finale

**File:**
- Modifica: `design/design.md`, sezione «Caricamenti (skeleton)» (delega del brief): testo
  della spec, sezione 6.

- [ ] **Passo 1:** aggiorna `design/design.md` come nella spec, sezione 6.
- [ ] **Passo 2:** da `web/`: `npm run typecheck`, `npm test`, `npm run build` con le
  variabili dello stack locale (`AGENTS.md`) → tutto verde.
- [ ] **Passo 3:** con la skill agent-browser, sul server di sviluppo con dati finti
  (`npm run dev`, modalità fake), a 390 × 844 e 320 px: per Profilo, Membri (da
  amministratore), Impostazioni, Esclusioni, Ricettario da curatore, Amministrazione e
  `/password`, con le risposte rallentate come nel Task 8 di W20 (in locale, senza commit,
  alza `latencyMs` dei `fakeClients` in `web/src/main.tsx` da 150 a 2000 ms; per `/password`
  la verifica del link finto), dopo aver svuotato i dati del sito: confronta coordinate e
  dimensioni di intestazione, prima scheda e controlli sotto **in ogni passaggio** (attesa
  del profilo → attesa del dettaglio → attesa delle liste → contenuto; in Amministrazione
  controllo dell'accesso → liste → contenuto), non solo all'inizio e alla fine; controlla
  a occhio che le righe in attesa dentro le schede vere (Utenti, Inviti, Agenti, Link,
  Ingressi) siano blocchi pieni che pulsano. Ricettario da curatore: il finto ha due
  bozze, quindi apri prima il Ricettario in inglese (riepilogo in memoria con due bozze),
  passa all'italiano con l'overview rallentata e misura il `top` del primo risultato con lo
  skeleton e dopo l'arrivo: deve essere uguale; poi, dopo aver svuotato i dati, annota lo
  spostamento atteso con una scheda di skeleton e due bozze vere. Annota gli spostamenti
  residui e la loro causa (contenuto diverso dal caso comune). Riporta `latencyMs` a 150
  prima del commit.
- [ ] **Passo 4:** commit «Design: skeleton anche nelle pagine rare e nelle sezioni dei curatori».
- [ ] **Passo 5:** push e PR verso `main` (descrizione in italiano: cosa fa, come è stato
  verificato, cosa resta da provare sull'iPhone dalla spec, sezione 7; sezioni della
  specifica realizzate: 14), poi `STATO: PR_APERTA <url>`.
