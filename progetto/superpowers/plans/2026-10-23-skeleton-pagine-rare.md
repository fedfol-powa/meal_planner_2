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
- Ciò che dipende da un ruolo ha blocchi solo a ruolo noto (spec, sezione 2 punto 3).
- Codice e commenti in inglese, commit in italiano.
- Prove solo con il server di sviluppo o lo stack locale, mai la produzione (`AGENTS.md`).

## Attenzione in revisione

- Annidamento: un `LoadingArea` dentro un `LoadingScope` **senza** `gather` resta
  indipendente come oggi (il foglio «Cambia ricetta» dentro il Menu non deve cambiare);
  i test di W20 restano verdi senza modifiche (Task 1).
- Una sola `role="status"` con testo nelle pagine con più letture (Membri da
  amministratore, Amministrazione, Ricettario da curatore), anche quando un'area finisce
  prima delle altre (Task 1, 4, 6, 7).
- Non curatore e non amministratore: nessun blocco delle sezioni del ruolo in nessun
  istante, anche senza profilo salvato (Task 4, 7).
- `AdminAccessGate` durante la verifica dopo un rifiuto: skeleton, poi il contenuto o «Non
  hai accesso», mai i dati di prima (Task 6).
- `/password` offline: blocchi fermi, nessuna verifica partita; al ritorno della rete la
  verifica parte e i blocchi riprendono a pulsare (Task 9).
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
con `aria-busy`, un solo status «Caricamento…»; all'arrivo nessun `.skeleton` e status
vuoto), **attesa → errore** dove la pagina ha un errore proprio (status vuoto, nessuno
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

**Interfacce prodotte** (vanno dentro un `Skeleton`, che li nasconde):
- `SkeletonRows({ count, small = true, chip = false, action }: { count: number; small?: boolean; chip?: boolean; action?: ReactNode })`:
  `<ul className="row-list">` con `count` `<li>`, ognuno con
  `<span className="row-main"><span className="skeleton-line" />{small && <small className="skeleton-line" />}</span>`,
  con `chip` uno `<span className="label-chip">` con ` `, e `action` (per esempio un
  `ButtonSkeleton`) in fondo.
- `SettingsCardSkeleton({ title = true, rows = 0, small, chip, children }: { title?: boolean; rows?: number; small?: boolean; chip?: boolean; children?: ReactNode })`:
  `<section className="settings-card skeleton-card">` con `<h2 className="skeleton-line" />`
  se `title`, poi `SkeletonRows` se `rows > 0`, poi `children`.
- `FieldSkeleton()`: `<div className="field">` con una `skeleton-line` per l'etichetta e un
  `<span className="skeleton-block" style={{ height: 44 }} />` per il campo (min-height dei
  campi in `global.css`).
- `ButtonSkeleton({ wide = false, className }: { wide?: boolean; className?: string })`:
  `<span className={`text-button skeleton-block ${wide ? 'wide' : ''} ${className ?? ''}`}>{' '}</span>`:
  stesse misure e margini del pulsante vero (`text-button`, eventuale classe del modulo).
- `TitleSkeleton({ width = '60%', className = 'page-title' }: { width?: string; className?: string })`:
  `<span className={`${className} skeleton-block`} style={{ width, height: '1lh' }} />` per i
  titoli che vengono dai dati, da usare con `PageHeader` e `titleHidden` come nella Ricetta.

- [ ] **Passo 1: test** `it('builds rows, cards, fields and buttons with the page classes')`:
  dentro `<LoadingScope loading><Skeleton>…</Skeleton></LoadingScope>`, `SettingsCardSkeleton
  rows={3}` ha `.settings-card.skeleton-card`, tre `.row-list > li` con `.row-main
  .skeleton-line`; `FieldSkeleton` ha `.field .skeleton-block`; `ButtonSkeleton wide` ha
  `.text-button.wide.skeleton-block`; nessun elemento focalizzabile
  (`button, a, input, select, [tabindex]` assenti).
- [ ] **Passo 2:** `npx vitest run src/components/PageSkeletons.test.tsx` → fallisce.
- [ ] **Passo 3:** implementa; sposta `gate`/`holdCalls` in `test/holdCalls.ts` (export
  `gate`, `holdCalls`).
- [ ] **Passo 4:** `npx vitest run src/components/PageSkeletons.test.tsx src/routes/RecipesPage.skeleton.test.tsx` → verde.
- [ ] **Passo 5:** commit «Skeleton: righe, schede, campi e pulsanti condivisi».

### Task 3: Esclusioni e Impostazioni, `FamilyGate` senza `Loading`

**File:**
- Modifica: `web/src/components/FamilyGate.tsx`, `web/src/routes/profile/ExclusionsPage.tsx`,
  `web/src/routes/profile/SettingsPage.tsx`
- Test: `web/src/routes/profile/ExclusionsPage.skeleton.test.tsx`,
  `web/src/routes/profile/SettingsPage.skeleton.test.tsx`

**Interfacce:**
- Consuma: Task 1-2.
- Produce: `FamilyGate` con `waiting: (paused: boolean) => ReactNode` **obbligatorio**; il ramo
  `Loading` sparisce (tutte le pagine dietro il controllo hanno un layout di attesa dopo i
  Task 3-4; Menu, Spesa, Ricetta e Ricettario lo passano già). Verifica con `grep -rn
  "<FamilyGate" web/src` che ogni uso lo passi.
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
  - `it('settings: intro, name, diners and rules cards while loading')`: skeleton con
    `.settings-card.skeleton-card` ≥ 3 e una tabella con 7 righe di celle (classe `cell`
    del modulo `DinersGrid.module.css`).
- [ ] **Passo 2:** esegui i due file → falliscono.
- [ ] **Passo 3:** implementa:
  - Esclusioni: `SettingsCardSkeleton title={false} rows={3}` (la scheda vera non ha `h2`)
    e `action={<ButtonSkeleton className={styles.small} />}`.
  - Impostazioni: `meta-line` dell'introduzione come `skeleton-block` (`width: '70%'`,
    `height: '1lh'`, classe `styles.intro`); scheda del nome con `FieldSkeleton`; scheda dei
    commensali con `h2` e `meta-line` come `skeleton-line` e una `<table className={dinersStyles.diners}>`
    con intestazione vuota e 7 righe da 2 celle `<span className={dinersStyles.cell} />`
    (esporta lo stile da `DinersGrid.module.css` importandolo nella pagina); scheda delle
    regole `SettingsCardSkeleton rows={2} small={false}`.
- [ ] **Passo 4:** i due file e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: Esclusioni e Impostazioni».

### Task 4: Membri

**File:**
- Modifica: `web/src/routes/profile/MembersPage.tsx`
- Test: `web/src/routes/profile/MembersPage.skeleton.test.tsx`

**Interfacce:**
- Consuma: Task 1-3. Il ruolo è `family.role` della `FamilyView` (dal profilo), noto prima
  del dettaglio.
- `MembersLayout` con `<LoadingScope gather>` attorno al contenuto della colonna. Tre aree:
  - scheda dei membri: `LoadingArea` con `SettingsCardSkeleton rows={3} chip` finché
    `detail` non ha dati e non ha errore bloccante;
  - solo con `family.role === 'family_admin'`: schede «Link d'invito» e «Ingressi» come
    `SettingsCardSkeleton rows={1}` finché manca il dettaglio; poi le schede vere, in cui
    `Loading` diventa un `LoadingArea` con `SkeletonRows count={1}` (link: con il pulsante
    `ButtonSkeleton className={styles.small}`), finché `links`/`joins` non hanno dati né
    errore;
  - «Lascia la famiglia»: `ButtonSkeleton wide` nella `danger.dangerZone` finché manca il
    dettaglio.
  - In attesa del profilo (`waiting` del controllo) il ruolo non è noto: solo scheda dei
    membri e pulsante, nessuna scheda degli amministratori.

- [ ] **Passo 1: test**, matrice più:
  - `it('members: admin cards are blocks from the start for an administrator')`: profilo in
    copia, dettaglio trattenuto, utente `family_admin` → tre `.settings-card.skeleton-card`.
  - `it('members: a member never sees the admin cards blocks')`: utente `member`, dettaglio
    trattenuto → una sola scheda a blocchi; a dati arrivati nessuno skeleton.
  - `it('members: one status while links and joins load after the detail')`: dettaglio
    libero, `familyInvitations.list` e `listJoins` trattenuti → la scheda dei membri è vera,
    una sola `role="status"` con «Caricamento…», `aria-busy` solo nelle due schede; liberati,
    status vuoto.
  - `it('members: no admin blocks while the profile is unknown')`: profilo trattenuto →
    una sola scheda a blocchi.
- [ ] **Passo 2:** esegui → fallisce.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** il file, `MembersPage.test.tsx` e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: Membri».

### Task 5: Profilo, Preferenze, Agenti

**File:**
- Modifica: `web/src/routes/ProfilePage.tsx`, `web/src/routes/profile/PreferencesPage.tsx`,
  `web/src/features/agents/AgentsPage.tsx`
- Test: `web/src/routes/ProfilePage.skeleton.test.tsx`,
  `web/src/routes/profile/PreferencesPage.skeleton.test.tsx`,
  `web/src/features/agents/AgentsPage.skeleton.test.tsx`

**Interfacce:** Consuma Task 1-2. Attesa = `!blocked && !read.data` (profilo), in pausa con
`read.fetchStatus === 'paused'`.

- Profilo: un `LoadingScope` per la pagina. Intestazione: `h1` di `styles.name` che contiene
  `<Skeleton as="span" className="skeleton-block" style={{ width: '50%', height: '1lh' }} />`
  (nascosto ai lettori con `aria-hidden` dello Skeleton; l'`h1` resta per la struttura) e la
  riga `styles.email` come `Skeleton as="p"` a blocco (`width: '40%'`, `height: '1lh'`); poi
  `BusyArea` con `SettingsCardSkeleton rows={3} small={false}` (famiglia) e
  `SettingsCardSkeleton rows={1} small>` con una riga `skeleton-line` per il link
  (Famiglie); la scheda Account resta vera, fuori dallo Skeleton.
- Preferenze: al posto di `{profile && …}` in attesa un `LoadingArea` con una
  `settings-card skeleton-card` contenente `FieldSkeleton` e un `<p className={styles.static}>`
  con `skeleton-line`; le altre schede vere.
- Agenti: nella scheda «Agenti collegati» `Loading` diventa `LoadingArea` con
  `SkeletonRows count={1}` e un `ButtonSkeleton` per riga; `paused` dal
  `fetchStatus` di `agents`.

- [ ] **Passo 1: test**, matrice per le tre pagine, più
  `it('profile: the account card is real and usable while the profile loads')`: profilo
  trattenuto → il link «Preferenze» è presente e cliccabile fuori dagli `.skeleton`.
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
- `AdminAccessGate({ waiting, children }: { waiting: (paused: boolean) => ReactNode; children: ReactNode })`:
  `fallbackHeader` resta per errore e «Non hai accesso»; durante `checking` e durante la
  lettura del profilo (`state.status === 'profile' && !profile.data && !profile.isError`) rende
  `waiting(paused)`, con `paused = profile.fetchStatus === 'paused'` (in `checking` `false`).
- `/admin`: `AdminPage` avvolge `AdminAccessGate` in `<LoadingScope gather>`. `waiting` rende
  una scheda Utenti (`SettingsCardSkeleton rows={3}` con un `FieldSkeleton`-blocco per la
  ricerca: usa un `<span className={`${styles.search} skeleton-block`} style={{ height: 44 }} />`)
  e una scheda Inviti (`SettingsCardSkeleton` con due voci `styles.item` di tre
  `skeleton-line`) dentro un `LoadingArea loading`. Nelle sezioni vere `Loading` diventa
  `LoadingArea` (`SkeletonRows count={3}` per gli utenti, due voci per gli inviti) che si
  unisce all'attesa della pagina.
- Dettaglio utente: `waiting` e attesa del dettaglio rendono `PageHeader back title={<TitleSkeleton />} titleHidden`,
  riga dell'email (`skeleton-block`, `styles.userEmail`), `SettingsCardSkeleton` con due
  righe `styles.switch` (ruoli), `SettingsCardSkeleton rows={1}` con una `meta-line`
  (famiglie), `ButtonSkeleton wide` nella zona rossa. `fallbackHeader` non serve più per
  l'attesa.
- Eliminazione utente: link indietro vero «Utenti», titolo `TitleSkeleton`, riga
  dell'email, `h2` di `styles.sectionTitle` come `skeleton-line`, una scheda famiglia
  (`settings-card ${styles.card}` con `h3` e `p` vuoti) e la scheda «Cosa sparisce» con
  `ButtonSkeleton wide className={styles.confirm}`.

- [ ] **Passo 1: test**, matrice più:
  - `it('admin: one status while the access check and the two lists load')`: profilo
    trattenuto → due schede a blocchi, un solo status; profilo libero, `users.list` e
    `appInvitations.list` trattenuti → campo di ricerca vero, un solo status; liberati →
    status vuoto, nessuno skeleton.
  - `it('admin: the check after a forbidden shows the skeleton, then the outcome')`: come i
    test esistenti di `AdminPage.test.tsx` per il rifiuto, con la lettura del profilo della
    verifica trattenuta → skeleton e nessuna riga utente; liberata con un profilo senza
    `app_admin` → «Non hai accesso a questa pagina», nessuno skeleton.
  - `it('user: the title is a hidden block until the name arrives')`: un solo `h1`, nessun
    testo «Utenti» nel titolo durante l'attesa; poi il nome.
- [ ] **Passo 2:** esegui → falliscono.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** i nuovi file, `AdminPage.test.tsx`, `UsersSection.test.tsx`,
  `UserPage.test.tsx`, `UserDeletePage.test.tsx` e `npm test` → verde.
- [ ] **Passo 5:** commit «Skeleton: amministrazione».

### Task 7: sezioni dei curatori e bozza

**File:**
- Modifica: `web/src/routes/RecipesPage.tsx`, `web/src/features/catalogue/CatalogueDraftsSection.tsx`,
  `ArchivedRecipesSection.tsx`, `DraftPage.tsx`
- Test: `web/src/routes/RecipesPage.skeleton.test.tsx` (si aggiunge),
  `web/src/features/catalogue/DraftPage.skeleton.test.tsx`

**Interfacce:**
- `RecipesPage`: la colonna (sotto `RecipeFilters`) in `<LoadingScope gather>`; i
  `LoadingArea` dei risultati restano e si uniscono. L'albero resta lo stesso in ogni stato
  (vincolo di W20: titolo e filtri mai rimontati).
- `CatalogueDraftsSection`: con `isCurator` e `!data && !blocked` (`query.isPending`) rende
  `LoadingArea loading paused={query.fetchStatus === 'paused'}` con
  `<section className={styles.section}>`: `h2.${styles.heading}` con
  `<span className={`${styles.toggle} skeleton-block`} style={{ width: '30%' }} />` (alto
  44 px dalla classe) e `<ul className={styles.cards}>` con due `<li><span className={`${styles.card} skeleton-card`}>`
  contenenti `styles.top` (una `skeleton-line`), `styles.title` (una `skeleton-line`) e
  `styles.state` (una `skeleton-line`). Senza curatore `null` come oggi.
- `ArchivedRecipesSection`: con `isCurator` e riepilogo in attesa,
  `<section className={`${styles.section} ${styles.archived}`}>` con il titolo a blocco
  come sopra, in un `LoadingArea`.
- `DraftPage`: un `DraftLayout({ loading, paused, children })` con `PageHeader back
  title={loading ? <TitleSkeleton /> : …} titleHidden={loading}` usato sia durante la
  lettura del profilo sia durante quella della bozza e, con i dati, dalla vista; in attesa:
  etichetta (`styles.kind` con un `label-chip` di ` `), `p.description` con due
  `skeleton-line`, `p.meal-meta` con una `skeleton-line`, `section.${styles.block}
  skeleton-card` con `h2` e quattro `li` di `styles.lines`, `section.${styles.block}
  skeleton-card` con `h2` e `dl.${styles.attributes}` di quattro coppie vuote. Gli stati
  «non disponibile», rifiuto ed errore usano lo stesso `PageHeader` con il solo link
  indietro (come oggi).

- [ ] **Passo 1: test**, in `RecipesPage.skeleton.test.tsx`:
  - `it('curator: drafts and archived sections are blocks while the overview loads')`:
    profilo con `recipe_curator` (come `RecipesPage.catalogue.test.tsx`), `catalogue.overview`
    trattenuto → un `section` con due `.skeleton-card` delle bozze sopra i risultati e uno
    con il titolo a blocco dopo i risultati; un solo status «Caricamento…» anche con le
    ricette già arrivate.
  - `it('curator: sections replace their blocks, results keep their place')`: overview
    libera con una bozza e un'archiviata → sezioni vere, nessuno skeleton.
  - `it('curator: no drafts removes the section on arrival')`: overview `{ drafts: [], archived: [] }`
    → nessuna sezione, nessuno skeleton.
  - `it('not a curator: never a block of the sections')`: profilo senza ruolo, ricette
    trattenute → nessun `.skeleton` fuori dall'area dei risultati in nessun momento
    (controlla dopo 200 ms e all'arrivo); con profilo trattenuto, idem.
  - `it('curator: no section blocks with the overview cached')`.
  - Aggiorna il test esistente di W20 che verifica «niente skeleton nelle sezioni dei
    curatori», se c'è: ora i blocchi ci sono (cerca `curator` in
    `RecipesPage.skeleton.test.tsx` e `RecipesPage.catalogue.test.tsx`).
  - In `DraftPage.skeleton.test.tsx`: matrice, più «profilo trattenuto → skeleton della
    bozza; liberato senza ruolo → "Bozza non disponibile" e nessuno skeleton».
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
- Account: `h2.${styles.sectionTitle}` come `skeleton-line`, una scheda famiglia come
  nell'eliminazione utente (Task 6; se serve, estrai `DeletionFamilySkeleton` in
  `features/account/DeletionFamilies.tsx` e riusalo), scheda «Cosa sparisce» con il
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
`skeleton-block` sono visibili):
- Invito all'app: `TitleSkeleton className="entry-title"`, un `p` con `skeleton-line`, e se
  `state.status === 'signedIn'` un `p` e `ButtonSkeleton wide`, altrimenti due
  `FieldSkeleton` con una riga di suggerimento (`styles.help` con `skeleton-line`), un
  `p.${styles.help}` e `ButtonSkeleton wide`.
- Invito alla famiglia: come sopra, scelto da `identity`; senza accesso in più il `p`
  «Hai già un account?» come `skeleton-line`.
- Autorizzazione: `TitleSkeleton className={`entry-title ${styles.title}`}` alto due righe
  (`height: '2lh'`), `p.meta-line`, `div.${styles.account}` con tre `skeleton-line`,
  `h2.${styles.heading}` e due `p`, come blocchi. «Leggo i tuoi ruoli…» invariato.
- `/password`: `Waiting` diventa `LoadingArea loading paused={!online} label={t('password.choose.verifying')}`
  con `TitleSkeleton className="entry-title"`, un `p`, due `FieldSkeleton` (il primo con la
  riga di suggerimento), `p.meta-line` e `ButtonSkeleton wide`; offline non ritorna più
  `null`.

- [ ] **Passo 1: test**:
  - per ogni pagina: chiamata trattenuta → dopo 200 ms skeleton visibile e status
    «Caricamento…» (per `/password` «Verifico il link…»); liberata → contenuto, nessuno
    skeleton; errore → messaggio di oggi, nessuno skeleton.
  - `it('password: offline the form blocks stand still and nothing is verified')`:
    `setOnline(false)` → `.skeleton[data-paused="true"]`, nessuna chiamata di verifica;
    `setOnline(true)` → verifica partita, `data-paused` assente.
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
  dimensioni di intestazione, prima scheda e controlli sotto prima e dopo l'arrivo; annota
  gli spostamenti residui e la loro causa (contenuto diverso dal caso comune). Riporta
  `latencyMs` a 150 prima del commit.
- [ ] **Passo 4:** commit «Design: skeleton anche nelle pagine rare e nelle sezioni dei curatori».
- [ ] **Passo 5:** push e PR verso `main` (descrizione in italiano: cosa fa, come è stato
  verificato, cosa resta da provare sull'iPhone dalla spec, sezione 7; sezioni della
  specifica realizzate: 14), poi `STATO: PR_APERTA <url>`.
