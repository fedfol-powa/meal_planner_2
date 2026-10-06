# App Famiglia: requisiti e design

Creato: 29 settembre 2026
Ultimo aggiornamento: 6 ottobre 2026
Stato: base approvata il 29 settembre; requisiti integrati dalle decisioni del 3 ottobre;
linguaggio visivo definitivo approvato il 4 ottobre e conservato in `design/`.
Il prossimo artefatto è il prototipo completo, da costruire e approvare per giri
usando il linguaggio visivo scelto; metodo, ordine dei percorsi e architettura del
prototipo concordati il 6 ottobre in `design/percorsi.md`.
Review avversariale indipendente del 3 ottobre: adatto a un prototipo esplorativo,
non ancora pronto per l'implementazione; rilievi e decisioni conseguenti nella sezione 17.
Repository: `fedfol-powa/meal_planner_2` (privato)
Progetto di origine: `fedfol-powa/meal_planner` (resta attivo, vedi "Convivenza")

## Come usare e aggiornare questo documento

Questo è il **documento unico di riferimento per i requisiti e il design completo**,
versionato in Git. Ogni scelta concordata durante brainstorming, prototipazione, design
di dettaglio o implementazione aggiorna le sezioni interessate di questo documento.
Le decisioni superate si ritrovano nella cronologia Git, non in requisiti contraddittori
lasciati attivi nel testo.

`AGENTS.md` contiene il metodo di lavoro e rimanda qui per il prodotto. Piani, prototipo
e documenti di approfondimento devono essere coerenti con questa specifica e non possono
diventare fonti alternative delle decisioni. Ogni piano indica quali sezioni realizza;
la revisione verifica sia il risultato sia l'allineamento della specifica.

La Parte 1 descrive l'app per chi la usa; la Parte 2 descrive dati, comportamenti e
architettura. Il linguaggio visivo approvato è definito nella sezione 14 e reso operativo
in `design/design.md`. Le ulteriori decisioni sui flussi entreranno in questa specifica
dopo la review del prototipo. Gli aspetti ancora da concordare sono elencati nella
sezione 15 e non vanno trattati come decisioni approvate.

**Decisioni confermate il 3 ottobre 2026:**

- unità della famiglia: metrico oppure imperiale britannico, con conversioni;
- lingua dell'utente: italiano oppure inglese britannico, dalla prima versione;
- ricette pubblicabili solo con i testi richiesti disponibili in entrambe le lingue;
  se manca una traduzione la ricetta resta in bozza;
- ingredienti verificati, quantità e unità quando applicabili e porzioni di riferimento
  obbligatori per pubblicare, anche per le ricette importate; ammesse indicazioni
  esplicite come "q.b.", senza usarle per sostituire dati mancanti;
- operazioni dell'app disponibili anche tramite MCP, con l'eccezione dell'eliminazione
  di una famiglia: esecuzione solo nell'app web e risposta MCP con URL alla pagina
  dedicata. Browser previsto anche per collegare l'account e riautenticarsi;
- client MCP obiettivo della prima versione: Codex CLI, Claude Code, ChatGPT e Claude
  Desktop, con istruzioni dedicate e compatibilità da verificare nel design tecnico;
- ruolo di curatore del ricettario, con aggiunta guidata tramite il proprio agente MCP
  e pubblicazione della ricetta solo quando le informazioni richieste sono complete;
- bozze persistenti, riprendibili e visibili anche in una sezione dell'app, separate
  dal catalogo pubblicato, condivise e modificabili da tutti i curatori;
- percorso manuale web per creare, modificare, verificare e pubblicare ricette,
  comprese quelle in bozza, senza funzionalità AI. Priorità bassa: da implementare
  dopo le altre funzionalità; eventuale caricamento da file da definire;
- ogni curatore può modificare l'intero ricettario, comprese le ricette degli altri
  curatori; occorre gestire backup e ripristino per recuperare errori imprevisti;
- ripristino di una singola ricetta accessibile ai curatori; ripristino dell'intero
  catalogo da backup riservato agli amministratori dell'app;
- database come fonte di verità del ricettario; YAML per importazione ed esportazione;
- pagina web di istruzioni MCP, con comandi o configurazioni copiabili;
- amministratore dell'app, inizialmente Federico, con possibilità di aggiungerne altri
  e pagina per gestire ruoli, inviti e cancellazione degli utenti;
- ruoli globali di curatore e amministratore separati e cumulabili; l'amministratore
  può assegnarli entrambi, senza ottenere accesso ai contenuti delle altre famiglie;
- l'amministratore di una famiglia può eliminare la famiglia che amministra solo
  dall'app web; questa operazione non cancella gli account dei membri;
- l'ultimo amministratore dell'app non può essere cancellato o retrocesso senza un
  successore. Prima di cancellare l'ultimo amministratore di una famiglia con altri
  membri occorre nominarne un altro; cancellando l'unico membro si elimina la famiglia;
- tutto il codice in inglese; conversazione e documentazione di progetto in italiano;
- prima prototipo nel repository e review con l'utente, poi verifica e adeguamento delle
  scelte funzionali e architetturali, quindi piani e implementazione dell'app.

L'approvazione dei requisiti non equivale all'approvazione di un piano di implementazione.

**Decisione confermata il 4 ottobre 2026:** il linguaggio visivo del riferimento
`design/index.html`, derivato dallo studio di HelloFresh e rivisto dall'utente su
iPhone, è quello definitivo da utilizzare nella progettazione e nello sviluppo del
prototipo. La guida `design/design.md` applica la decisione della sezione 14.

---

## Parte 1: cosa fa l'app (per tutti)

### In una frase

Un'app sul telefono che ogni settimana prepara da sola il menu di pranzi e cene della
famiglia, lo lascia rivedere a tutti per qualche giorno e, quando serve, trasforma i pasti
scelti in una lista della spesa.

### Il problema che risolve

Decidere ogni settimana cosa mangiare è faticoso: bisogna ricordarsi cosa è piaciuto, non
ripetere sempre gli stessi piatti, mangiare in modo vario ed equilibrato, rispettare le
serate in cui c'è poco tempo o qualcuno non c'è, e poi ricavare la spesa. Oggi lo facciamo
parlando con un assistente AI una volta a settimana. L'app toglie questo passaggio: il menu
arriva già pronto, e la famiglia lo aggiusta insieme.

### Chi la usa

- **La Famiglia.** È il gruppo di persone che mangia insieme e condivide il menu. Chi crea
  la Famiglia la amministra e invia agli altri un link d'invito (anche su WhatsApp). Una
  persona può far parte di più Famiglie, per esempio dei nonni o di genitori separati.
- **L'amministratore della famiglia** gestisce membri, inviti e impostazioni di quella
  famiglia e può eliminarla dall'app web. Eliminare una famiglia rimuove i suoi dati
  per tutti i membri, ma conserva gli account delle persone e le altre famiglie a cui
  appartengono.
- **Chiunque può iscriversi** e creare la propria Famiglia.
- **Il curatore del ricettario** è un ruolo assegnabile a un utente. Può collegare il
  proprio agente tramite MCP e aggiungere ricette con un percorso guidato. Essere membro
  o amministratore di una famiglia, da solo, non abilita questa funzione.
- **L'amministratore dell'app** gestisce utenti, ruoli e inviti a livello dell'intera
  applicazione. Inizialmente è Federico; il sistema deve permettere di aggiungerne altri.
  È distinto dall'amministratore di una singola famiglia.

### Quando apri l'app

L'app si apre sui **pasti di oggi**, perché è l'uso più comune: sapere cosa si mangia a
pranzo e a cena. Se oggi non c'è niente di pianificato, mostra i prossimi pasti in
programma.

Per ogni pasto si vedono:

- il nome del piatto e la sua descrizione breve;
- le porzioni;
- il voto;
- gli ingredienti, già calcolati per quelle porzioni.

Se la ricetta ha una fonte esterna (una pagina web o un video YouTube), da lì si apre la
ricetta completa, come oggi dal sito e dal QR del PDF. Per le ricette da libro si vedono
titolo del libro e pagine. I pasti liberi mostrano il loro testo ("pizza", "cena fuori").

Da qui si passa al resto della settimana, alla bozza della prossima e alla lista della
spesa.

### Una settimana tipo

**Mercoledì sera** l'app prepara il menu della settimana che comincia il lunedì
dopo: dodici pasti circa, con i pasti liberi già segnati (per esempio "sabato sera fuori",
"domenica pizza").

Da quel momento tutti i membri della Famiglia possono rivederlo e cambiarlo. Non ci sono
finestre o vincoli per settimana: si può intervenire allo stesso modo sulla settimana
appena preparata, su quella in corso e su quelle passate, per esempio per correggere
cosa si è mangiato o rifare la spesa di un menu vecchio. Su qualsiasi pasto si può:

- cambiare un piatto scegliendo tra cinque suggerimenti o cercando nel ricettario;
- chiedere "proponimene un altro";
- cambiare il numero di porzioni;
- scambiare due pasti tra loro o segnarne uno come libero;
- scrivere una nota;
- dire "non proporre più" per un piatto che non si vuole rivedere.

Ogni piatto mostra chi l'ha cambiato per ultimo e quando ("cambiato da Anna, venerdì
21:30"), così si sa sempre a chi chiedere.

Un pasto passato conta come cucinato, a meno che qualcuno non lo segni come non
cucinato; lo si può fare in qualsiasi momento. Il mercoledì successivo l'app prepara la
settimana dopo e il ciclo ricomincia.

### Come sceglie i piatti

A comporre il menu sono regole chiare e le preferenze della Famiglia, non l'intelligenza
artificiale. In via sperimentale, e solo se si dimostra utile, un modello AI può fare da
**giudice**: l'app prepara alcune settimane diverse, tutte già valide, e il giudice indica
la più riuscita nel complesso. Il giudice non sceglie i singoli piatti e non può infrangere
le regole.

- **Equilibrio.** Punta a una settimana varia e sana secondo le linee guida italiane per
  una sana alimentazione (CREA): pesce un paio di volte, legumi circa tre volte, carne rossa
  al massimo una, verdure a ogni pasto, pochi fritti.
- **Niente cose troppo simili troppo vicine.** Non solo lo stesso piatto: evita anche due
  pasti di fila con lo stesso ingrediente principale (salmone, ceci, pollo) o lo stesso tipo
  di piatto (due wok, due torte salate), anche a cavallo tra una settimana e l'altra.
- **Gusti.** Preferisce i piatti con più stelline in Famiglia e alterna piatti già
  conosciuti (circa 60%) a piatti nuovi da provare (circa 40%).
- **Regole di casa.** Rispetta gli ingredienti da evitare o da limitare, i piatti "da non
  proporre più", i pasti liberi, i tempi massimi di certe serate e le regole della Famiglia
  (per esempio "venerdì pesce", "niente pasta a cena").

Quando un membro cambia un piatto a mano l'app non blocca niente: segnala soltanto cosa non
torna nella settimana ("venerdì senza pesce", "legumi solo una volta").

### Le stelline

Il voto è legato al piatto, non a un pasto: ogni membro può dare da una a cinque stelle a
qualsiasi piatto in qualsiasi momento, dalla scheda del piatto o da un pasto del menu, e
può cambiare idea quando vuole. Il voto della Famiglia su un piatto è la media dei voti dei
suoi membri. È quello che l'app usa per scegliere.

Il voto si vede sempre, ovunque compaia un piatto: nel menu, nei suggerimenti, nella ricerca
e nella scheda del piatto. Si vedono la media della Famiglia e il proprio voto. Da lì si vota,
o si cambia il proprio voto, direttamente.

### La lista della spesa

Gli ingredienti di ogni pasto sono sempre visibili, già calcolati per le porzioni di quel
pasto. Quando si va a fare la spesa:

1. si scelgono i pasti per cui comprare, anche solo alcuni ("da oggi a domenica");
2. si tocca "Genera lista": l'app somma gli ingredienti uguali, li divide per reparto e
   lascia fuori olio, sale e spezie;
3. si tolgono le cose che si hanno già in casa;
4. si esporta: PDF, condivisione (WhatsApp, Note…) oppure invio a Bring!.

La lista non viene salvata: una volta esportata sparisce. Se serve di nuovo, si rigenera.

### Il ricettario

È unico per tutta l'app. Contiene le ricette da siti web, video YouTube e libri, con
ingredienti verificati sulla fonte. Le ricette di un libro vengono proposte solo alle
famiglie che dichiarano di avere quel libro. Non ci sono ricette private di una famiglia:
un piatto o è nel ricettario, e lo vedono tutti, o non c'è.

Il catalogo aggiornato vive nel database. Un curatore può chiedere al proprio agente di
aggiungere una ricetta: l'agente raccoglie le informazioni e fa le domande necessarie.
La ricetta entra nel catalogo solo quando il servizio verifica che tutti i dati richiesti
sono presenti e validi, compresi i testi in italiano e inglese britannico. Gli ingredienti
non vengono mai dedotti dal nome del piatto. Elenco verificato degli ingredienti,
quantità e unità quando applicabili e porzioni di riferimento sono necessari anche per
pubblicare una ricetta importata dal vecchio progetto. Le indicazioni esplicite come
"q.b." restano ammesse.

Il lavoro incompleto può essere **salvato come bozza** e ripreso in seguito. Le bozze
sono visibili anche in una sezione dell'app dedicata alla curatela e non vengono proposte
nei menu né usate per la spesa finché non sono pubblicate. Sono condivise e modificabili
da tutti i curatori, mostrando autore e ultima modifica.

È previsto anche un **percorso manuale nell'app**, da realizzare per ultimo: un curatore
può compilare una ricetta, salvare o modificare una bozza, far verificare i dati,
correggere i problemi segnalati e pubblicare quando tutti i requisiti sono soddisfatti.
Questo percorso non usa AI: il sistema controlla i dati inseriti. È da valutare anche
un caricamento da file. La consultazione delle bozze nell'app resta prevista già nel
percorso iniziale di curatela MCP.

Ogni curatore può modificare **tutto il ricettario**, anche le ricette inserite da altri.
Il sistema deve consentire il recupero dagli errori tramite backup e ripristino; il
curatore può tornare a una versione precedente di una ricetta, mentre il recupero
dell'intero catalogo è riservato agli amministratori dell'app (sezione 8).

### Lingua e unità di misura

Ogni persona sceglie la propria lingua: **italiano o inglese britannico**. La scelta
riguarda l'esperienza dell'app, comprese le informazioni del ricettario e della spesa;
il trattamento dei testi liberi della famiglia è da concordare (sezione 12).

Ogni famiglia sceglie il **sistema metrico o quello imperiale britannico**. Le quantità
devono essere convertite di conseguenza nei pasti, nella spesa e nelle esportazioni.
La lingua e le unità sono indipendenti: si può usare l'inglese con misure metriche.

### Usare l'app attraverso il proprio agente

Un utente può collegare un agente compatibile tramite MCP e usare le operazioni
dell'app attraverso di esso: consultazione, modifiche, voti, spesa, impostazioni e
gestione della famiglia. Curatori e amministratori dell'app accedono anche alle
operazioni previste per i loro ruoli. I permessi sono gli stessi dell'accesso web.

**Eccezione confermata:** eliminare una famiglia richiede l'app web. Se lo chiede
all'agente, MCP non esegue l'eliminazione e restituisce un URL per aprire la pagina
appropriata e confermare esplicitamente l'operazione. Aprire il link non cancella nulla.
La stessa regola vale quando cancellare un account comporterebbe l'eliminazione di
una famiglia di cui la persona è l'unico membro.

Il browser può servire per collegare l'account o autenticarsi nuovamente; l'uso quotidiano
deve poter avvenire tramite l'agente. Una pagina dell'app spiega il collegamento per i
client supportati, con istruzioni e comandi o configurazioni da copiare.

### Amministrare l'app

Una pagina riservata agli amministratori dell'app permette di gestire **gli utenti e
gli inviti di tutta l'applicazione**: invitare persone, cambiare ruoli e cancellare
utenti. Deve comprendere l'assegnazione del ruolo di curatore e la possibilità di
nominare altri amministratori dell'app. Le stesse operazioni sono disponibili via MCP,
salvo le cancellazioni di account che eliminerebbero anche una famiglia: in quel caso
MCP rimanda alla pagina dell'app, senza eseguire la cancellazione.

Gli amministratori dell'app possono inoltre ripristinare l'intero ricettario da backup.
Questo recupero riguarda il catalogo, senza ripristinare i dati privati delle famiglie.

Gli inviti all'app e quelli a una famiglia hanno scopi distinti. Le regole precise di
assegnazione dei ruoli, cancellazione e protezione dell'ultimo amministratore saranno
verificate nel design di questo percorso e riportate qui (sezioni 7 e 15).

### Cosa l'app non fa (per ora)

- Non inventa ingredienti o ricette. Nella generazione automatica del menu l'AI, se
  attiva, fa solo da giudice tra settimane già valide. Questo vincolo non impedisce
  all'agente dell'utente di aiutarlo nelle modifiche manuali o nella cura del ricettario.
- Non permette di aggiungere ricette senza il ruolo di curatore.
- Non espone uno storico completo delle modifiche ai pasti (si mostra solo l'ultima).
- Non manda notifiche sui menu; restano i messaggi previsti per accesso, inviti e
  segnalazione degli errori del job all'operatore del servizio.

---

## Parte 2: design tecnico

### 1. Architettura

Lo stack di riferimento resta SvelteKit, Netlify, Supabase e TypeScript. L'aumento delle
operazioni server e l'introduzione di MCP vanno verificati dopo il prototipo, prima di
confermare la distribuzione dei componenti e scrivere i nuovi piani.

**Struttura logica proposta**, da precisare nei piani successivi al prototipo:

```
meal_planner_2/
├── prototype/                    prototipo da costruire, conservato nel repository
├── planner/                      modulo TypeScript puro: regole, punteggio, scalatura, lista
├── application/                  operazioni condivise da app web e MCP
├── catalog/                      schema, validazione e gestione del ricettario
├── mcp/                          accesso MCP alle operazioni applicative
├── app/                          SvelteKit, mobile-first, installabile (PWA)
├── supabase/migrations/          schema SQL e policy RLS
├── supabase/functions/           Edge Function del job settimanale
├── scripts/                      importazione, esportazione e verifiche
└── progetto/                     spec, piani, regole di progetto
```

- **Hosting app: Netlify** (adapter SvelteKit ufficiale), come scelta di riferimento.
  Il backend deve coprire anche catalogo, operazioni condivise, amministrazione e accesso
  MCP. Trasporto e collocazione del server MCP si decidono dopo la verifica architetturale.
- **Supabase**: Postgres, Auth, RLS, `pg_cron`, Edge Functions. Il repository è già
  collegato all'organizzazione Supabase tramite l'integrazione GitHub: nel M1 si verifica
  come applica le migrazioni (branch di produzione, cartella) e ci si allinea.
- **Il modulo `planner/`** è TypeScript senza dipendenze di runtime, così lo importano
  sia l'Edge Function (Deno) sia l'app (Node): una sola implementazione per bozza,
  suggerimenti, avvisi, scalatura e lista.
- **Il database è la fonte di verità del catalogo.** Le scritture avvengono attraverso
  operazioni autorizzate e validate sul server. Importazioni ed esportazioni YAML non
  costituiscono una seconda copia modificabile da sincronizzare automaticamente.
- **App e MCP condividono le operazioni di dominio.** Permessi, validazione, limiti,
  conflitti e attribuzione delle modifiche devono avere lo stesso comportamento.
- **Lingua del codice:** identificatori, nomi tecnici di file e directory, tabelle,
  colonne, enum, API, strumenti MCP, commenti e test in inglese. Le etichette visibili
  sono localizzate; il nome visualizzato di una ricetta o di un ingrediente non è un
  identificatore tecnico. I nomi inglesi proposti qui saranno confermati nei piani.
- **Motivazioni delle scelte** (decise in conversazione il 28-29 settembre 2026):
  - Supabase invece di Django o Firebase: login, inviti e isolamento tra famiglie garantito
    dal database (RLS); il modello è relazionale.
  - SvelteKit invece di Next.js: meno JavaScript sul telefono, meno complessità, neutrale
    tra host.
  - Netlify invece di Vercel: il piano Hobby di Vercel è solo per uso personale non
    commerciale e i suoi cron girano al massimo una volta al giorno con un'ora di
    tolleranza. Il job sta comunque in Supabase, quindi l'host serve solo l'app.

### 2. Modello dei dati

Il modello seguente conserva i concetti approvati e usa nomi tecnici inglesi. I nuovi
dettagli di schema sono una proposta da verificare dopo il prototipo; il piano M1a
precedente non è una migrazione pronta da applicare.

**Catalogo** (lettura delle ricette pubblicate per gli utenti autenticati; aggiunta e
modifica dell'intero ricettario tramite operazioni autorizzate ai curatori e validate
sul server; bozze escluse dall'accesso ordinario al catalogo):

| Tabella | Campi principali |
|---|---|
| `recipes` | `id`, `slug`, `source_type` (`web`/`youtube`/`book`/`home`), `source_url`, `book_id`, `book_pages`, `duration_minutes`, `base_servings`, `protein_group`, `carbohydrate_group`, `has_vegetables`, `category`, `meal_type` (`lunch`/`dinner`/`both`), `seasons`, `is_heavy`, `tags`, `archived_at`, `created_by`, `created_at`, `updated_by`, `updated_at`. Tutte le ricette sono globali; `created_at` serve anche all'ordinamento "aggiunte di recente" del ricettario. `home` indica una ricetta senza fonte esterna |
| `recipe_translations` | `recipe_id`, `locale`, `name`, `description`: stessa ricetta e stessi attributi di classificazione, testi nelle lingue supportate |
| `ingredients` | `id`, `slug`, `department`, `is_pantry`: identità unica dell'ingrediente, indipendente dalla lingua |
| `ingredient_translations` | `ingredient_id`, `locale`, `name`, `synonyms` |
| `recipe_ingredients` | `recipe_id`, `ingredient_id`, `quantity` (numero o null quando la quantità non è numerica), `unit`, `source_text`, `is_optional`, `is_primary`; conservazione della quantità e dell'unità della fonte da precisare nel design delle conversioni |
| `books` | `id`, `title`: titolo bibliografico originale |
| `recipe_drafts` | Proposta: `id`, `created_by`, `updated_by`, `updated_at`, dati parziali e riferimento opzionale alla ricetta pubblicata da modificare. Bozze persistenti separate dal catalogo, condivise e modificabili da tutti i curatori |
| `recipe_revisions` | Proposta: `recipe_id`, `version`, contenuto completo della versione, autore, data e canale; base per confrontare e ripristinare una ricetta senza perdere lo storico |
| Backup del catalogo | Copie recuperabili del ricettario e delle sue dipendenze; frequenza, conservazione, collocazione e procedura da definire nel design operativo |

**Utenti, ruoli globali e amministrazione:**

| Tabella o concetto | Campi principali / responsabilità |
|---|---|
| `profiles` | `user_id`, `display_name`, `locale` (`it-IT`/`en-GB`) |
| `user_roles` | `user_id`, `role`: permessi globali separati e cumulabili, curatore (`recipe_curator`) e amministratore dell'app (`app_admin`) |
| `app_invitations` | Inviti gestiti dall'amministrazione dell'app: destinatario, autore, stato e regole di accettazione da definire; distinti dagli inviti a una famiglia |
| Tracciamento del catalogo e dell'amministrazione | Proposta: autore, data, operazione e canale (`web`/`mcp`/`import`), con regole di conservazione da definire |

**Per famiglia** (RLS: si vede e si scrive solo nella propria famiglia):

| Tabella | Campi principali |
|---|---|
| `families` | `name`, `settings` (vedi sotto), `created_at` |
| `family_members` | `family_id`, `user_id`, `role` (`family_admin`/`member`), `joined_at` |
| `family_invitations` | `token`, `family_id`, `created_by`, `expires_at` (7 giorni), `revoked_at` |
| `family_books` | `family_id`, `book_id`: libri posseduti |
| `recipe_exclusions` | `family_id`, `recipe_id`, `reason`, `created_by`, `created_at`: "non proporre più" |
| `family_ingredients` | `family_id`, `ingredient_id`, `restriction` (`avoid`/`limit`), `weekly_max` |
| `weeks` | `family_id`, `starts_on` (lunedì), `generated_at`. Unica per (`family_id`, `starts_on`) |
| `meal_slots` | `week_id`, `date`, `meal_type`, `recipe_id` o `free_text`, `servings`, `note`, `cooked` (`true`/`false`/null), `updated_by` (null = app), `updated_at` |
| `meal_changes` | `meal_slot_id`, `actor_id`, `before` (jsonb), `after` (jsonb), `created_at`: registro append-only |
| `ratings` | `user_id`, `recipe_id`, `stars` (1-5), `updated_at`. Unico per (`user_id`, `recipe_id`); il voto è personale e contribuisce alle medie delle famiglie di cui l'utente fa parte |
| `weekly_jobs` | `family_id`, `target_week`, `status`, `attempts`, `error`, `updated_at` |
| `temporary_lists` | `token`, `items` (jsonb), `expires_at` (30 minuti), per l'esportazione Bring! |

**Viste:**

- `family_scores`: media delle stelle dei membri attuali per ricetta;
- `global_scores`: media anonima su tutte le famiglie, usata solo per l'avvio a freddo.

**Nessuno stato della settimana, deciso il 6 ottobre 2026.** Le settimane non hanno
fasi (bozza, in corso, da chiudere, chiusa) né chiusura: ogni settimana si consulta e si
modifica allo stesso modo. `cooked` vale `false` solo quando un membro segna il pasto
come non cucinato; per un pasto passato `null` equivale a cucinato, anche nello storico
usato dal pianificatore. Una settimana generata è visibile da `generated_at`.

**Impostazioni della famiglia** (`families.settings`, jsonb validato):

- matrice commensali per giorno e pasto, con porzioni di default;
- slot fissi (`free` con testo, per esempio sabato cena e domenica pranzo);
- limiti di tempo per slot (per esempio lunedì e mercoledì cena al massimo 15 minuti);
- regole di pasto: pasta solo a pranzo; pesce almeno una volta il venerdì; niente pesce
  fresco il lunedì;
- quota note/nuove (default 7/5 ± 1 su 12 pasti);
- intervalli settimanali per gruppo alimentare (sezione 3);
- pesi del punteggio;
- sistema di misura (`measurement_system`): `metric` oppure `uk_imperial`.

**Preferenze personali** (`profiles`): lingua `it-IT` oppure `en-GB`, indipendente dalla
famiglia e dal suo sistema di misura. Rilevamento iniziale e valori predefiniti da definire
nel percorso di primo accesso.

**Ruoli nella famiglia:**

- `member`: legge la propria famiglia, modifica gli slot, vota, gestisce le esclusioni;
- `family_admin`: in più gestisce inviti, membri e impostazioni di quella famiglia e
  può eliminarla esclusivamente dall'app web; MCP fornisce il collegamento alla pagina
  dedicata. Finché la famiglia resta attiva, l'ultimo amministratore non può uscire
  o perdere il ruolo senza nominarne un altro. Se è
  l'unico membro, può eliminare la famiglia; la cancellazione del suo account la
  elimina insieme ai relativi dati, secondo le regole della sezione 7.

**Ruoli globali:**

- `recipe_curator`: salva e riprende bozze, pubblica ricette complete e modifica l'intero
  ricettario, anche le ricette e le bozze inserite da altri. Le bozze hanno una sezione
  nell'app; il percorso guidato è disponibile tramite MCP e il percorso manuale web
  viene realizzato nell'ultima fase. Può ripristinare una versione precedente di una
  singola ricetta;
- `app_admin`: gestisce utenti, ruoli e inviti dell'app, inclusa la nomina di altri
  amministratori e la cancellazione degli utenti; può ripristinare l'intero catalogo
  da backup. Inizialmente assegnato a Federico.

**Separazione confermata:** il ruolo di amministratore di famiglia non concede ruoli
globali. `recipe_curator` e `app_admin` sono indipendenti e cumulabili; un amministratore
dell'app può assegnare entrambi. Essere `app_admin` non concede automaticamente i permessi
del curatore né accesso a menu, note e contenuti delle altre famiglie. Per operare sui
contenuti di una famiglia occorre esserne membro, con i relativi permessi. La gestione
globale degli account e degli inviti deve rispettare questo confine.

In qualunque canale le operazioni verificano i permessi sul server, non soltanto la
visibilità dei comandi nell'interfaccia. I controlli di accesso ai dati familiari devono
valere anche per le operazioni eseguite da amministratori dell'app.

### 3. Pianificatore

**Ingresso:**

- impostazioni della famiglia;
- catalogo visibile alla famiglia: ricette non archiviate, escluse quelle da libri che la
  famiglia non possiede;
- esclusioni e ingredienti da evitare o limitare;
- punteggi;
- storico degli slot delle settimane precedenti e della settimana in corso;
- stagione.

**Vincoli rigidi** (filtrano, mai violati dalla generazione):

- limiti dello slot: tempo, pasto adatto, niente pesce fresco il lunedì, niente pasta a cena;
- esclusioni, ricette archiviate, libri non posseduti;
- ingrediente con restrizione `avoid` come ingrediente non opzionale;
- stessa ricetta usata nelle ultime 2 settimane;
- punteggio famiglia ≤ 2 stelle, salvo mancanza di alternative.

**Punteggio** (vincoli morbidi):

- **gradimento**: punteggio della famiglia, oppure quello globale nell'avvio a freddo;
- **tempo dall'ultima volta** che la famiglia l'ha cucinata;
- **stagione**;
- **equilibrio**: distanza dagli intervalli settimanali per gruppo alimentare;
- **somiglianza**: penalità per pasti vicini che condividono proteina principale,
  carboidrato principale, ingrediente principale o categoria. Il peso decresce con la
  distanza in pasti. La finestra è mobile e attraversa le settimane;
- **quota note/nuove**: "nota" vuol dire cucinata da questa famiglia almeno una volta. La
  quota si applica da quando la famiglia ha almeno 10 ricette cucinate;
- **ingredienti con restrizione `limit`**: penalità, e al massimo `weekly_max` volte.

**Intervalli di default per gruppo alimentare** sui pasti pianificati della settimana.
Sono derivati dalle frequenze CREA 2018 per l'adulto, pensate per 14 pasti, e adattati ai
circa 12 pasti pianificati. Sono impostazioni modificabili.

| Gruppo | Frequenza CREA | Default dell'app |
|---|---|---|
| Pesce | 2 volte a settimana | 2-3 |
| Legumi | 3 volte a settimana | 2-4 |
| Carne bianca | 2 volte a settimana | 1-3 |
| Carne rossa | 1 volta a settimana | massimo 1 |
| Salumi | 1 volta a settimana (occasionale) | massimo 1 |
| Uova | 3 volte a settimana | 1-2 come proteina principale (le uova compaiono anche in altre ricette) |
| Formaggi | 3 volte a settimana | massimo 2 come proteina principale |
| Patate | 2 volte a settimana | massimo 2 come carboidrato principale |
| Verdure | 2 porzioni e mezza al giorno | bonus per le verdure a ogni pasto |
| Fritti o piatti pesanti | non indicata | massimo 1 |

Fonte: CREA, "Le giuste porzioni e le frequenze di consumo consigliate"
(sapermangiare.an.crea.gov.it/493/le-giuste-porzioni.html), consultata il 29 settembre
2026.

**Algoritmo:**

1. prepara gli slot dalla matrice, con porzioni e slot fissi;
2. ordina gli slot da riempire dal più vincolato (cene veloci, venerdì pesce);
3. per ogni slot calcola il punteggio dei candidati nel contesto della settimana e ne sceglie
   uno a caso tra i migliori 3-5, pesando la scelta sul punteggio;
4. controlla le regole di settimana (venerdì pesce, quota, intervalli) e le ripara con
   scambi locali;
5. se uno slot non ha candidati validi resta vuoto, segnato "nessuna ricetta adatta".

Il seme casuale è derivato da famiglia e settimana: a parità di ingresso la settimana è la
stessa, e quindi testabile. Il perché di una scelta non viene salvato né mostrato: non è un
requisito.

**Riuso durante la revisione:**

- **suggerimenti**: lo stesso punteggio con gli altri slot fissati, i migliori 5;
- **"proponimene un altro"**: il miglior candidato successivo;
- **avvisi di settimana**: le stesse regole, applicate come controlli.

**Giudice AI (opzionale, sperimentale).** È l'unico ruolo dell'AI nella pianificazione.

- **Cosa fa.** Il pianificatore genera da 3 a 5 settimane candidate con semi diversi, tutte
  conformi ai vincoli rigidi. Il giudice le riceve e restituisce un punteggio per ciascuna.
  Si tiene la migliore. Serve a cogliere ciò che le regole, un criterio alla volta, non
  vedono: per esempio tre piatti pesanti di fila anche dentro gli intervalli, o una
  settimana monotona per colori, consistenze e tipi di piatto.
- **Cosa non fa.** Non propone né sostituisce piatti, non tocca singoli slot, non
  interviene su suggerimenti, "proponimene un altro" e avvisi (restano solo a regole). Non
  può rendere valida una settimana che viola un vincolo: vede solo candidate già valide.
- **Dati inviati.** Solo dati anonimi della settimana: per ogni pasto giorno, pasto, nome
  del piatto, gruppi alimentari, categoria, tempo e porzioni; più il riassunto delle ultime
  2 settimane per la somiglianza. Niente nome della famiglia, membri, note, né quali pasti
  sono liberi.
- **Ricaduta.** Se il giudice è spento, non risponde entro il timeout (per esempio 10
  secondi), fallisce o restituisce qualcosa di non valido, si tiene la candidata con il
  punteggio a regole più alto. La bozza non dipende mai dal giudice.
- **Fornitore intercambiabile.** Un'interfaccia `Judge` (candidate → punteggi) con
  un'implementazione per fornitore, scelta da configurazione. I candidati da provare sono
  Jev (jevmodel.org, API di scoring a $0,042 per milione di token in ingresso, pubblica dal
  21 settembre 2026, multilingue in beta) e un modello piccolo ospitato come Claude Haiku
  4.5. Modelli locali esclusi: le Edge Functions non li possono eseguire (256 MB, 2 s di
  CPU) e un server dedicato va contro l'impostazione a gestione minima.
- **Attivazione.** C'è un interruttore globale, spento di default, più uno per famiglia per
  il test alla cieca. Si accende in produzione solo se la valutazione (sezione 9) mostra un
  vantaggio chiaro.

### 4. Job settimanale

- `pg_cron` in Supabase lavora in UTC. Il job è pianificato ogni ora il mercoledì tra le
  17:00 e le 22:00 UTC. Il codice controlla di essere dopo le 20:00 Europe/Rome, così l'ora
  legale non richiede di cambiare il cron.
- **Dispatcher**: crea in modo idempotente una riga in `weekly_jobs` per ogni famiglia
  e per il lunedì successivo.
- **Worker**: invoca l'Edge Function **una volta per famiglia**, perché i limiti di Supabase
  sono 2 secondi di CPU per richiesta e 150 secondi di durata sul piano Free. Per ogni
  famiglia genera la settimana successiva in un'unica transazione, se non esiste già.
  Con il giudice attivo genera le candidate e chiama il giudice fuori dalla transazione:
  l'attesa della risposta è I/O e non consuma i 2 secondi di CPU. Non c'è chiusura della
  settimana precedente (decisione del 6 ottobre 2026, sezione 2).
- **Errori**: un errore riguarda solo la sua famiglia. Si ritenta all'esecuzione successiva
  fino all'ultima finestra utile. Alla fine arriva un'email al referente operativo del
  servizio con le famiglie ancora senza bozza. Questo destinatario va configurato
  esplicitamente: assegnare il nuovo ruolo di curatore non abilita a ricevere segnalazioni
  sulle altre famiglie. Contenuti e accessi operativi devono rispettare la separazione
  dei ruoli della sezione 2.
- **Generazione su richiesta** (wizard della famiglia nuova, oppure "rigenera" se la bozza
  manca): stessa funzione, al massimo 3 volte a settimana per famiglia.

### 5. Revisione e modifiche

- **Vista di apertura**: dopo il login e a ogni apertura l'app mostra i pasti di oggi della
  famiglia corrente. Se oggi non ci sono slot con contenuto, mostra il primo giorno futuro
  che ne ha. Se non c'è nessuna settimana (famiglia nuova), porta alla generazione della
  prima settimana.
- **Contenuto di un pasto**, in ogni vista che lo mostra: nome e descrizione breve della
  ricetta, porzioni,
  voto (sotto), ingredienti scalati. Se la ricetta è `web` o `youtube` c'è il collegamento
  al `source_url` della fonte, che si apre fuori dall'app senza passare il referrer
  (come fa oggi il sito del progetto di origine con `Referrer-Policy: no-referrer`).
  Per `book` si mostrano titolo e pagine; per `home` nessun collegamento. Per gli slot
  liberi, il testo.

- **Cosa è modificabile, deciso il 6 ottobre 2026:** tutto, in ogni settimana visibile,
  passata, in corso o futura. Nessuna azione dipende dalla settimana. "Non cucinato" ha
  senso solo per i pasti passati ed è disponibile in qualsiasi momento.
  - **Istante in cui un pasto diventa passato, confermato il 6 ottobre 2026:** il
    pranzo alle 15:30 e la cena alle 23:00, nell'ora locale della famiglia
    (Europe/Rome nei dati demo). Serve solo a stabilire quando un pasto conta come
    cucinato e quando si può segnare "non cucinato"; non blocca modifiche. Fuso orario
    della famiglia ed eventuale personalizzazione degli orari da valutare nel percorso
    Famiglia e account.
- **Navigazione fra i giorni:** sopra il selettore dei sette giorni il mese e un'icona
  aprono un calendario per scegliere qualunque giorno che abbia un menu, anche passato; i giorni
  senza menu non sono selezionabili.
- **Azioni sullo slot**: cambia ricetta (suggerimenti o ricerca con filtri), proponimene un
  altro, cambia porzioni, scambia con un altro slot, segna libero con testo, nota, non proporre
  più, vota.
- **Voto**: è sulla ricetta (`ratings`: utente × ricetta), non sullo slot. È sempre possibile,
  dallo slot di qualsiasi settimana o dalla scheda della ricetta nel catalogo, e non dipende
  dallo stato della settimana. Votare non segna nessuno slot come cucinato.
- **Voto sempre visibile**: ogni volta che l'interfaccia mostra una ricetta (slot,
  suggerimenti, risultati di ricerca, scheda della ricetta) mostra anche le stelline
  con:
  - la media della famiglia e il numero di voti (per esempio "4,3 · 3 voti"), oppure
    "nessun voto";
  - il voto dell'utente corrente, distinto dalla media, oppure "non hai votato".

  Dal voto mostrato si vota o si cambia il proprio voto direttamente, senza passare da
  un'altra schermata (da 1 a 5, più "togli il mio voto"). Il salvataggio aggiorna subito
  media e proprio voto in quella vista. È un unico componente riusato in tutte le viste; la
  sua forma si decide nel design delle superfici.
- **Tracciabilità**: ogni scrittura aggiorna `updated_by` e `updated_at` e aggiunge
  una riga a `meal_changes`, anche quando arriva da MCP. L'interfaccia mostra solo
  l'ultima modifica. È proposta l'indicazione del canale web o MCP insieme all'autore.
- **Concorrenza**: blocco ottimistico su `updated_at`. Se lo slot è cambiato nel
  frattempo si mostra la versione nuova con l'autore, e si sceglie se sovrascrivere. Niente
  realtime in v1: aggiornamento all'apertura e a richiesta dell'utente.
- **Offline**: l'ultima settimana caricata resta consultabile in sola lettura.

### 6. Scalatura e lista della spesa

- **Scalatura**: quantità × porzioni dello slot ÷ `base_servings`.
- **Sistema scelto dalla famiglia**: metrico oppure imperiale britannico, anche nei
  risultati MCP. La lingua dell'utente non cambia il sistema di misura.
- **Conversioni**: masse tra g/kg e once/libbre; volumi tra ml/l e misure imperiali
  britanniche. Le unità britanniche devono essere identificate senza confonderle con
  quelle statunitensi. L'elenco esatto, i fattori e gli arrotondamenti saranno verificati
  su fonti di riferimento e confermati nel design delle conversioni.
- **Proposta per i calcoli**: conservare i valori della fonte e usare una rappresentazione
  comune per scalare e sommare quantità compatibili. Convertire e arrotondare solo per
  la presentazione, dopo il consolidamento della spesa. Cambiare la preferenza non
  modifica i dati della ricetta e non introduce conversioni ripetute sui valori salvati.
- **Dimensioni diverse**: non convertire massa in volume senza un'equivalenza verificata
  per quello specifico ingrediente. Conteggi, unità domestiche ambigue e quantità non
  numeriche mantengono il loro significato; la traduzione dell'etichetta non basta a
  stabilire una conversione. Il trattamento di cucchiai, cucchiaini, bicchieri e
  confezioni sarà esplicitato nel design prima dell'importazione.
- **Arrotondamenti metrici della base approvata**, da verificare nel prototipo insieme
  alla nuova pipeline di calcolo: grammi alla decina (a 5 g sotto i 50 g), ml come i
  grammi, pezzi e spicchi al mezzo superiore, cucchiai e cucchiaini al mezzo. La regola
  si applica alla presentazione, non ai valori intermedi da sommare.
- **Codici delle unità**: in inglese o simboli standard; etichette localizzate. Il
  vecchio elenco italiano e quello esteso del piano M1a vanno sostituiti con un elenco
  unico validato, comprendente le unità effettivamente usate dalle fonti.
- **Generazione della lista**:
  1. si parte dagli slot selezionati;
  2. si scalano gli ingredienti;
  3. si consolida per ingrediente canonico, convertendo le unità compatibili; le unità
     incompatibili restano sulla stessa voce ("2 pz + 300 g");
  4. si escludono gli ingredienti con `is_pantry` e quelli con restrizione `avoid`
     della famiglia, che vengono segnalati a parte;
  5. si segnano gli opzionali;
  6. si raggruppa per reparto nell'ordine standard;
  7. si presentano le quantità nel sistema della famiglia e i testi nella lingua
     dell'utente che genera la lista, con gli arrotondamenti concordati.
- **Scorciatoie di selezione**: "da oggi a domenica", "tutta la prossima settimana". "Solo
  quelli non ancora in lista" usa memoria temporanea del client. Il percorso MCP deve
  avere un equivalente esplicito per passare le selezioni precedenti; questa memoria
  non può dipendere esclusivamente dal browser.
- **Effimera**: la lista non si salva in database, tranne nel caso di Bring!. Si possono
  togliere voci prima di esportare.
- **Esportazioni**:
  - PDF di una pagina;
  - Web Share API, con testo semplice;
  - Bring!: si salva in `temporary_lists` con un token casuale e si apre
    `https://api.getbring.com/rest/bringrecipes/deeplink?url=<app>/shopping-lists/<token>&source=web`.
    La pagina `/shopping-lists/<token>` è pubblica e `noindex`, e contiene solo il JSON-LD
    `schema.org/Recipe` con `recipeIngredient` nel formato "quantità nome", senza nome della
    famiglia né giorni. Scade dopo 30 minuti; un cron la pulisce. È lo stesso meccanismo
    di `scripts/sito_lib.py` nel progetto di origine.

  Tramite MCP si devono ottenere gli stessi contenuti esportabili: PDF, testo e
  collegamento Bring!. La consegna di file e collegamenti dipende dalle capacità del
  client e verrà provata nel design MCP; il requisito non implica poter comandare
  direttamente l'interfaccia di condivisione del dispositivo da qualunque agente.

### 7. Account, Famiglia, inviti

- **Supabase Auth**: magic link via email e Google. Iscrizione aperta.
- **SMTP personalizzato** (per esempio Resend): il servizio email di default di Supabase
  manda al massimo 2 email all'ora ed è solo per le prove. Con un SMTP personalizzato il
  limite parte da 30 all'ora ed è configurabile.
- **Inviti alla famiglia**:
  - link `/invite/<token>`, valido 7 giorni, riusabile fino alla scadenza, revocabile;
  - chi lo apre si iscrive se non ha un account ed entra nella famiglia; se ne fa già parte,
    non cambia niente;
  - token scaduto o revocato: messaggio chiaro con l'invito a chiedere un link nuovo
    all'amministratore della famiglia.
- **Inviti all'app**: gestibili dagli amministratori dell'app nella pagina di
  amministrazione e tramite MCP. Permettono di invitare un utente al servizio; l'eventuale
  assegnazione di ruoli o appartenenza a una famiglia deve essere esplicita. Scadenza,
  riutilizzo, reinvio e revoca sono da definire nel design. L'iscrizione aperta della
  specifica di base resta prevista: aggiungere inviti non la rende automaticamente
  riservata ai soli invitati.
- **Amministrazione globale**: pagina riservata agli `app_admin` per consultare e gestire
  utenti e inviti, cambiare i ruoli degli utenti, assegnare il ruolo di curatore,
  nominare altri amministratori e cancellare utenti. Le operazioni devono essere
  disponibili anche via MCP. La nomina iniziale di Federico sarà prevista nella
  configurazione iniziale, con identità verificata; i dettagli si definiscono nel piano.
- **Recupero del ricettario**: il ripristino completo da backup è riservato agli
  amministratori dell'app. Il percorso dedicato deve essere rappresentato nel prototipo;
  i curatori hanno invece il ripristino della singola ricetta.
- **Wizard della famiglia nuova**:
  - nome;
  - matrice commensali;
  - slot fissi;
  - ingredienti da evitare o limitare;
  - libri posseduti;
  - sistema di misura della famiglia;
  - obiettivi, con i default CREA;
  - "Genera la prima settimana adesso".
- **Rimozione di un membro**: i suoi voti escono dalla media; le tracce diventano "ex
  membro".
- **Preferenze personali**: la lingua è modificabile dall'utente nelle proprie
  impostazioni e tramite MCP, indipendentemente dalle impostazioni della famiglia.
- **Cancellazione dell'account, regole confermate**: possibile da parte dell'utente
  stesso e degli amministratori dell'app. Rimuove dati personali e voti e revoca gli
  accessi dell'utente, compresi quelli MCP. Le ricette pubblicate restano nel catalogo.
  Per ciascuna famiglia in cui l'utente è l'ultimo amministratore e ci sono altri
  membri, occorre nominare un successore prima di cancellare l'account. Se è l'unico
  membro, la cancellazione elimina anche quella famiglia e i suoi dati. Una condizione
  non soddisfatta impedisce di completare la cancellazione; la procedura tecnica deve
  evitare cancellazioni parziali. Il trattamento delle attribuzioni, degli inviti
  ancora aperti e delle bozze condivise si completa nel design, senza cancellare
  implicitamente i contributi pubblicati dell'utente.
  Se la cancellazione comporta l'eliminazione di almeno una famiglia, una richiesta
  MCP restituisce soltanto il collegamento alla pagina appropriata dell'app e non
  effettua cancellazioni parziali o complete. La restrizione vale sia per l'utente
  che cancella il proprio account sia per l'amministratore che cancella un altro utente.
- **Ultimo amministratore dell'app, regola confermata**: non può essere cancellato o
  perdere il ruolo `app_admin` finché non viene nominato un successore. Il vincolo vale
  anche per la cancellazione del proprio account e per le operazioni via MCP.
- **Eliminazione della famiglia, permesso confermato**: un `family_admin` può eliminare
  la famiglia che amministra, anche se ha altri membri, **solo dall'app web**. Rimuove
  la famiglia e i suoi dati, compresi menu, note, impostazioni, appartenenze e inviti familiari; interrompe
  i relativi job e impedisce ulteriori accessi a quella famiglia da web e MCP.
  Gli account dei membri, i loro voti personali, le altre famiglie, il ricettario e i
  ruoli globali restano invariati. L'azione non richiede di nominare un successore,
  perché la famiglia cessa di esistere. Un semplice membro non può eseguirla; il solo
  ruolo di amministratore dell'app non conferisce questo permesso su qualunque famiglia.
  Resta distinta la cancellazione automatica di una famiglia rimasta senza membri
  quando si elimina il suo unico utente, descritta sopra.
  L'utente apre la pagina dedicata e conferma esplicitamente l'operazione. La pagina
  identifica la famiglia e chiarisce la rimozione dei dati per tutti i suoi membri.
  MCP restituisce un esito che richiede un'azione nell'app con il relativo URL, senza
  eseguire l'eliminazione. Il link è soltanto una navigazione: non contiene un comando
  che cancelli dati all'apertura. La pagina richiede l'accesso e verifica nuovamente
  i permessi al momento della conferma. La forma dell'interazione si rivede nel prototipo.
- **Privacy**: informativa, dati minimi (email, nome visualizzato, dati della famiglia).
- **Limiti di frequenza**: iscrizioni (rate limit di Supabase Auth) e generazioni su
  richiesta.

### 8. Ricettario: database, curatori, validazione e scambio dati

**Fonte di verità confermata:** il catalogo autorevole è nel database Supabase. Le
ricette nuove si salvano mediante operazioni applicative autorizzate, senza dover aprire
una pull request. Lo schema, i validatori e le migrazioni restano codice versionato in
Git. Un merge di codice non sostituisce il catalogo e non archivia ricette sulla base
della loro assenza da un file YAML.

**Aggiunta guidata tramite MCP:**

1. Il curatore collega il proprio agente e indica la ricetta e la sua fonte, oppure
   fornisce direttamente le informazioni per una ricetta di casa.
2. Il servizio espone i dati richiesti e i vincoli; l'agente raccoglie le informazioni e
   chiede quelle mancanti. La guida non deve dipendere dalla memoria di un singolo agente.
3. La validazione sul server restituisce campi mancanti e incoerenze in forma strutturata,
   così l'agente può proseguire con domande mirate.
   Le informazioni parziali possono essere salvate in una bozza persistente e recuperate
   in una sessione successiva; restano escluse dal catalogo pubblicato.
4. Proposta di interazione: prima del salvataggio l'agente presenta la scheda completa
   al curatore per la conferma, comprese le traduzioni predisposte.
5. Il server verifica nuovamente ruolo, completezza e validità al momento della
   pubblicazione e salva la ricetta con i suoi ingredienti e riferimenti in modo atomico.
   Un errore non deve lasciare una ricetta parzialmente inserita nel catalogo.

**Bozze persistenti confermate:** una bozza ammette informazioni incomplete e sopravvive
alla conversazione con l'agente. È consultabile nella sezione di curatela dell'app e
recuperabile tramite MCP. Dal 6 ottobre 2026 la sezione di curatela per la
consultazione è in testa al ricettario: una sezione "Bozze" collassabile, visibile
solo ai curatori, con i dati che mancano per pubblicare. Un pasto passato che usa una
ricetta in bozza mostra nome e descrizione; la scheda si apre solo ai curatori e il
voto non è disponibile finché la ricetta non è pubblicata. Tutti i curatori possono consultare e modificare le bozze
degli altri; autore e ultima modifica sono visibili. Salvare una bozza non pubblica
una ricetta: la completezza resta vincolante per l'ingresso nel catalogo utilizzato
dalle famiglie.

Il salvataggio di una bozza applica controlli sui dati forniti senza richiedere i campi
ancora mancanti. La pubblicazione applica invece l'intera validazione. Campi obbligatori
specifici per tipo di fonte vanno esplicitati prima dell'implementazione (sezione 15).
Sono già obbligatori per pubblicare ingredienti verificati, quantità e unità quando
applicabili, porzioni di riferimento e testi richiesti in italiano e inglese britannico.
La collaborazione fra curatori deve gestire i conflitti senza sovrascrivere
silenziosamente le modifiche altrui; il meccanismo sarà precisato nel design.

**Percorso manuale web confermato, a bassa priorità:**

1. Il curatore crea una ricetta da un modulo oppure apre una bozza esistente, anche
   iniziata tramite MCP o da un altro curatore.
2. Inserisce o modifica i dati e può salvare la bozza incompleta.
3. Richiede la verifica: il servizio controlla dati, completezza e coerenza e mostra
   campi mancanti ed errori, usando gli stessi validatori del percorso MCP.
4. Corregge i dati e può ripetere la verifica. Una modifica rende non più valido il
   precedente esito di verifica per la pubblicazione.
5. Pubblica la ricetta completa; il server riesegue sempre i controlli sull'ultima
   versione e verifica i permessi, indipendentemente da precedenti verifiche positive.

Non sono usate funzionalità AI nel percorso manuale: niente compilazione, classificazione
o traduzione automatica tramite modelli. I dati e le traduzioni richiesti sono inseriti
dal curatore. La verifica automatica applica regole deterministiche e non certifica
da sola che ingredienti e quantità siano stati trascritti correttamente dalla fonte.

**Caricamento da file, opzione da definire:** se incluso, deve leggere uno dei formati
concordati senza AI e portare i dati in una bozza verificabile e modificabile, applicando
gli stessi controlli del modulo. Formati, numero di ricette per file, errori di lettura
e duplicati saranno definiti nel design di questa funzione. L'upload non pubblica
direttamente nel catalogo e non sostituisce la verifica dei dati.

Il percorso manuale, inclusa la modifica web delle bozze e l'eventuale upload, viene
implementato dopo le altre funzionalità (M6). La sezione web per consultare le bozze e
il lavoro guidato tramite MCP restano parte della curatela iniziale. Una stessa bozza
deve poter passare da MCP al modulo manuale e viceversa, senza creare copie distinte.

**Ingredienti e fonti:** solo dati verificati sulla fonte o forniti dal curatore,
trascritti per `base_servings`, mai dedotti dal nome del piatto. Un validatore strutturale
non prova la correttezza della trascrizione: la provenienza e le verifiche devono far
parte del percorso di curatela. Ingredienti equivalenti si collegano alla stessa entità
canonica, anche se i nomi sono in lingue diverse.

**Completezza degli ingredienti confermata:** per pubblicare occorrono un elenco
verificato degli ingredienti, quantità e unità quando applicabili e `base_servings`
positivo, corrispondente alle porzioni per cui sono fornite le quantità. Questo vale
per ogni fonte, comprese le ricette da libro o di casa, e per l'importazione del
ricettario precedente. Se questi dati mancano, la ricetta resta in bozza.

Indicazioni non numeriche esplicite, come "q.b.", sono ammesse quando risultano dalla
fonte o dai dati forniti dal curatore: vengono elencate senza inventare una quantità
numerica. Una quantità ignota non può essere trasformata in "q.b." per superare la
validazione. La pubblicazione richiede anche entrambe le lingue (sezione 12).

**Validazione condivisa:** schema, identificatori unici, riferimenti a ingredienti e
libri esistenti, quantità e unità ammesse, porzioni di riferimento, attributi del
pianificatore e dati della fonte coerenti con il tipo. La stessa logica serve l'aggiunta
MCP, le operazioni manuali web del curatore e l'importazione. I test di questa logica
sono eseguiti in CI; la CI non sostituisce la validazione di ogni scrittura sul server.

**Modifica dell'intero ricettario confermata:** ogni curatore può modificare le ricette
di qualunque autore. Le modifiche pubblicate devono rispettare gli stessi controlli
di completezza, unità, riferimenti e fonti delle nuove ricette. È proposta una bozza di
revisione per lavorare su una ricetta pubblicata senza esporre dati incompleti alle
famiglie; gestione dei conflitti fra curatori e comportamento dei pasti pregressi
rispetto alle versioni successive sono da definire nel design.

**Archiviazione:** resta necessario conservare leggibili i menu che usano una ricetta.
La precedente archiviazione automatica per assenza dal YAML è eliminata; il percorso
esplicito di archiviazione è da definire. La cancellazione del curatore non implica
la cancellazione delle ricette che ha contribuito.

**Backup e ripristino richiesti:** il ricettario deve poter essere recuperato dopo
modifiche errate o eventi imprevisti. Il design deve coprire ricette, ingredienti,
traduzioni, fonti, riferimenti ai libri e bozze, mantenendo coerenti i collegamenti con
i pasti delle famiglie. Un export YAML occasionale non è da solo un piano di backup.

**Recupero su due livelli:** la divisione dei permessi è confermata. Il funzionamento
dettagliato seguente è la proposta da precisare nel design:

- **Singola ricetta:** mantenere versioni con autore e data, confrontarle e ripristinare
  quella scelta come nuova revisione. L'operazione non elimina le revisioni successive
  dallo storico e non modifica le altre ricette. Accessibile ai curatori.
- **Intero catalogo:** copie di backup recuperabili con procedura di ripristino,
  anteprima dell'impatto e verifica della coerenza. Il ripristino complessivo è riservato
  agli amministratori dell'app, perché può annullare modifiche di più
  curatori. Il recupero del catalogo non deve riavvolgere menu, voti, utenti o permessi
  delle famiglie e non concede accesso ai loro contenuti.

Storico delle revisioni e backup hanno scopi distinti: il primo permette di correggere
un contributo, il secondo deve coprire anche la perdita o il danneggiamento dei dati.
Frequenza e conservazione delle copie, perdita massima di lavoro accettabile, tempi di
recupero e modalità operative si definiscono prima dell'uso del catalogo in produzione.
La procedura dovrà essere provata con un ripristino in un ambiente di verifica.

Le azioni di recupero esposte nell'app devono essere disponibili anche via MCP con gli
stessi permessi e controlli. Il design distinguerà queste azioni dai compiti operativi
di backup dell'infrastruttura.

**YAML per importazione ed esportazione:** formato di scambio con chiavi tecniche in
inglese, da precisare nel piano. Un export rappresenta il catalogo a una certa data;
non viene risincronizzato automaticamente come seconda fonte di verità. L'import
iniziale legge `../meal_planner/ricettario/ricette.yaml`, mappa ingredienti e unità,
prepara schede da rivedere e un **report delle ambiguità**, senza inventare valori.
Solo le schede che soddisfano le regole concordate entrano nel catalogo. Le ricette
importate prive di ingredienti verificati, quantità e unità richieste, porzioni di
riferimento o testi in entrambe le lingue restano bozze da completare; non sono
pubblicate con una deroga per i dati pregressi.

Voti B, `storico` ed esclusioni nelle `note` del formato di origine diventano i **dati
della famiglia di Federico**, separati dal catalogo. Conversione dei voti: B=1, BB=3,
BBB=4, BBBB=5 stelle, come voto di Federico. I nomi italiani citati qui sono campi
dell'input preesistente, non nomi da usare nel nuovo codice.

### 9. Test

- **Pianificatore**:
  - test unitari per regola su un catalogo di prova;
  - test di proprietà: su centinaia di semi, zero violazioni dei vincoli rigidi e ogni slot
    pieno o segnato "nessuna ricetta adatta";
  - **report di qualità**: `scripts/planner-report` genera 20 settimane con i dati
    reali della famiglia del curatore e riporta violazioni, gruppi rispetto agli
    intervalli, quota note/nuove, coppie simili più vicine e ripetizioni. Va guardato prima
    di attivare il job.
- **Giudice** (solo se lo si sperimenta):
  - test unitari della ricaduta: spento, timeout, errore, risposta non valida portano sempre
    alla candidata migliore a regole;
  - test sui dati inviati: nessun campo identificativo della famiglia nel payload;
  - valutazione del valore: report di qualità con solo regole e con regole più giudice, poi
    un test alla cieca di qualche settimana sulla famiglia del curatore (due proposte senza
    sapere quale ha scelto il giudice). Se il giudice non vince in modo chiaro, resta
    spento.
- **Scalatura e lista**: casi tabellari su unità, arrotondamenti finali, non scalabili,
  sinonimi, unità incompatibili, `is_pantry` e `avoid`; conversioni metriche e imperiali
  britanniche, indipendenza dalla lingua, cambio di preferenza senza alterare i dati.
- **RLS**: test contro il Supabase locale. Un membro della famiglia A non legge né scrive
  niente della famiglia B; un utente senza ruolo di curatore non aggiunge ricette; un
  membro non amministratore non gestisce inviti e impostazioni della famiglia. I test
  dei privilegi globali seguiranno la matrice dei permessi concordata.
- **Ricettario**: validazione con casi validi, mancanti e incoerenti; mancata scrittura
  di schede incomplete nel catalogo pubblicato anche se l'agente prova a pubblicarle;
  blocco della pubblicazione senza ingredienti, quantità o unità richieste e porzioni
  di riferimento, anche per l'importazione; accettazione di "q.b." documentato e
  distinzione rispetto a una quantità ignota;
  salvataggio e ripresa delle bozze da MCP e consultazione dal web, senza renderle
  disponibili nei menu o nella spesa; modifica di ricette di altri curatori, con
  controllo dei conflitti; atomicità della pubblicazione;
  import con i casi presi dal ricettario attuale e nessuna sovrascrittura dei contributi
  già presenti. Cambi di codice ed esportazioni non devono sostituire il catalogo.
- **Curatela manuale (M6)**: creazione, modifica di bozze anche altrui, verifica ripetuta
  dopo una correzione e pubblicazione con gli stessi vincoli di MCP; nessuna chiamata a
  servizi AI; ripresa della stessa bozza fra web e MCP e gestione dei conflitti. Se
  previsto l'upload, file non validi e duplicati non devono provocare pubblicazioni
  parziali o sovrascritture implicite.
- **Recupero del catalogo**: ripristino di una singola ricetta e di un backup completo
  rispettivamente da curatori e amministratori dell'app, con rifiuto delle operazioni
  non autorizzate; coerenza fra ricette, ingredienti, traduzioni e bozze;
  conservazione dei riferimenti dai pasti e assenza di modifiche a dati e ruoli familiari.
  Il collaudo comprende l'effettivo recupero da una copia di backup, non solo la sua creazione.
- **Lingue**: copertura di italiano e inglese britannico, identità stabili del catalogo,
  formattazione e rifiuto della pubblicazione quando manca un testo richiesto in una
  delle due lingue, anche per importazione e percorso manuale. Una bozza può invece
  essere salvata e ripresa con traduzioni ancora mancanti.
- **MCP**: parità di operazioni, permessi, validazione, attribuzione, conflitti e limiti
  rispetto al web, salvo l'eliminazione delle famiglie riservata all'app; isolamento
  fra utenti e famiglie; riconnessione e accessi revocati;
  esportazioni effettivamente utilizzabili nei client supportati. Verifica del
  collegamento e dei percorsi previsti su ciascuno dei quattro client obiettivo:
  Codex CLI, Claude Code, ChatGPT e Claude Desktop, registrando versioni o modalità
  provate ed eventuali limitazioni emerse.
- **Amministrazione dell'app**: accesso alla pagina e agli strumenti MCP riservato al
  ruolo autorizzato; assegnazione e revoca di ruoli, nomina di altri amministratori,
  inviti e cancellazione di utenti; protezione dell'ultimo amministratore dell'app,
  trasferimento dell'amministrazione familiare prima della cancellazione quando ci
  sono altri membri, eliminazione della famiglia dell'unico membro e revoca degli
  accessi MCP dell'utente cancellato. Il catalogo pubblicato rimane disponibile.
- **Eliminazione della famiglia**: permesso limitato agli amministratori di quella
  famiglia ed esecuzione riservata all'app web, con controllo sul server; rimozione
  dei dati e degli accessi familiari senza cancellare account, voti personali o altre famiglie. Il solo ruolo
  `app_admin` e il ruolo `member` non autorizzano l'operazione diretta. Verificare anche
  famiglia con più membri e job in corso, senza lasciare una famiglia parzialmente attiva.
  Da MCP si ottiene soltanto l'URL, senza eliminazioni, anche tentando la cancellazione
  dell'account dell'unico membro. Aprire il link non ha effetti di scrittura; il
  completamento richiede autenticazione, permessi validi e conferma nella pagina web.
- **End to end** (Playwright): iscrizione, creazione della famiglia, invito, modifica di uno
  slot, voto, generazione della lista con pagina Bring!, cambio lingua e unità,
  collegamento MCP e operazioni di curatela e amministrazione.

### 10. Fasi di rilascio

**Ordine confermato il 3 ottobre:** prima costruire e concordare il prototipo dell'app,
salvato nel repository; poi verificare le scelte funzionali e architetturali alla luce
del prototipo; infine aggiornare e approvare i piani prima dell'implementazione dell'app.

Ogni fase ha il suo piano in `progetto/superpowers/plans/` e rimanda alle sezioni di questa
specifica. Il piano del 29 settembre per M1a è **superato nelle parti su Git come fonte
del catalogo, sincronizzazione, permessi e codice italiano** e non va eseguito come
scritto. M1b non è ancora stato scritto. La nuova ripartizione di M1 sarà definita dopo
il prototipo; la tabella seguente è il percorso aggiornato di riferimento.

| Fase | Contenuto | Risultato |
|---|---|---|
| **P0 Prototipo e revisione** | Prototipo nel repository, review dei flussi e delle superfici, riesame funzionale e architetturale, consolidamento della specifica e dei nuovi piani | Un'esperienza concordata guida l'implementazione |
| **M1 Fondamenta** | Schema e RLS, Auth, famiglie e inviti, catalogo nel database, import e revisione, dati iniziali di Federico, preferenze di lingua e unità, ruoli globali, accesso MCP e relativa guida. Ripartizione di curatela e amministrazione da precisare nel nuovo piano | Si entra e si consulta il ricettario e la propria famiglia; i percorsi autorizzati sono disponibili anche via MCP |
| **M2 Modifica e voti** | Azioni sugli slot, suggerimenti, avvisi, ultima modifica, stelline e media, esclusioni, creazione manuale di una settimana, con equivalenti MCP | La famiglia pianifica a mano dall'app o dall'agente |
| **M3 Pianificatore** | Algoritmo, report di qualità, job del mercoledì, generazione su richiesta anche via MCP. Poi, come esperimento separato, giudice AI opzionale | La bozza arriva da sola; il giudice si accende solo se vince la valutazione |
| **M4 Lista della spesa** | Selezione, consolidamento, conversioni, PDF, condivisione, Bring!, esportazioni MCP | Si prepara la spesa nella lingua personale e nelle unità della famiglia |
| **M5 Apertura** | Wizard, avvio a freddo, privacy, SMTP, limiti di frequenza | Altre famiglie possono iscriversi |
| **M6 Curatela manuale — ultima priorità** | Modulo web senza AI per creare, modificare, verificare e pubblicare ricette, modifica e nuova verifica delle bozze condivise; eventuale upload da file da definire | I curatori possono completare il lavoro manualmente nell'app, usando gli stessi dati e controlli di MCP |

Lingue, unità e accesso MCP sono requisiti trasversali: ogni funzione introdotta li
rispetta dalla sua prima versione, con l'eccezione esplicita dell'eliminazione delle
famiglie, per cui MCP restituisce il link all'app. La collocazione delle attività nella roadmap non
rinvia la progettazione delle relative dipendenze al termine dello sviluppo.
La priorità finale di M6 riguarda il modulo manuale e l'eventuale upload, non la
consultazione delle bozze nell'app, richiesta insieme alla curatela tramite MCP.

### 11. Convivenza con il progetto di origine

- `meal_planner` resta com'è: YAML, PDF e sito Netlify pubblicato da `main`. Questa app è
  separata, con il suo repository, il suo sito Netlify e il suo progetto Supabase.
- Il ricettario del progetto di origine è la fonte dell'import iniziale. Fino allo
  spegnimento del vecchio flusso, lo script di import è **rilanciabile**: prepara per la
  revisione solo le schede nuove, riconosciute tramite lo slug di origine, e non tocca
  quelle già importate o curate nel database. La corrispondenza con l'identità originale
  deve essere conservata anche se cambiano nome, lingua o identificatori nel nuovo
  catalogo. Una ricetta aggiunta nel vecchio repository può arrivare qui attraverso
  revisione e validazione, senza una sincronizzazione automatica che sovrascriva i dati.
- Quando spegnere il vecchio flusso lo decide l'utente, dopo M4.

### 12. Lingue e contenuti tradotti

**Confermato:** lingua scelta per utente, italiano e inglese britannico nella prima
versione. Il sistema di misura appartiene invece alla famiglia; nessuna scelta impone
automaticamente l'altra. Le nuove pagine di guida MCP e amministrazione fanno parte
dell'esperienza tradotta.

**Ambito del design proposto:**

- testi dell'interfaccia, messaggi di errore, avvisi, impostazioni, ruoli e reparti;
- nomi e descrizioni delle ricette, ingredienti e relativi sinonimi di ricerca;
- contenuti della lista della spesa ed esportazioni nella lingua di chi li genera;
- date, numeri, plurali e nomi delle unità coerenti con la lingua selezionata;
- identificatori e codici tecnici stabili in inglese, indipendenti dalle traduzioni,
  utilizzabili allo stesso modo dal web e da MCP.

Le stringhe dell'interfaccia possono vivere nel codice; le traduzioni del catalogo
seguono le ricette nel database autorevole. È proposta una preparazione e revisione
delle traduzioni durante la curatela, anche con l'aiuto dell'agente, anziché tradurre
nuovamente ogni volta che si apre una ricetta.

**Pubblicazione bilingue confermata:** i testi richiesti di una ricetta devono essere
disponibili sia in italiano sia in inglese britannico prima della pubblicazione.
Questo comprende nome e descrizione della ricetta, i nomi degli ingredienti collegati
e, dal 6 ottobre 2026, il testo delle quantità non numeriche (per esempio "1 mazzetto",
"3 matasse"), mostrato nella lingua dell'utente; le identità e le quantità numeriche
sono condivise fra le due lingue. La regola vale per nuove
ricette, modifiche e importazioni e viene verificata dal server in ogni canale.
Le traduzioni mancanti sono segnalate nella bozza e impediscono di pubblicarla: mostrare
l'originale italiano non è un'alternativa alla completezza del catalogo pubblicato.

Nel percorso MCP l'agente può aiutare a preparare le traduzioni; nel percorso manuale
il curatore le inserisce senza funzionalità AI dell'app. Le modalità di revisione delle
traduzioni suggerite restano da definire. Anche il trattamento dei testi liberi degli
utenti è da concordare: la proposta iniziale è conservarli come scritti. Questi testi,
le trascrizioni originali delle fonti e i titoli bibliografici sono distinti dai testi
localizzati obbligatori. I collegamenti alle fonti non diventano traduzioni dei siti o
dei libri.

### 13. MCP e guida al collegamento

**Requisito:** ogni operazione disponibile nell'app deve avere un equivalente MCP per
lo stesso utente e con gli stessi permessi, **tranne l'eliminazione di una famiglia**,
che MCP può soltanto indirizzare alla pagina dell'app. Il server espone operazioni applicative,
non accesso generico alle tabelle. È proposto un server remoto collegabile all'account;
protocollo di autenticazione, trasporto, hosting e compatibilità dei client saranno
verificati con la documentazione aggiornata prima dell'implementazione.

**Client obiettivo confermati per la prima versione:** Codex CLI, Claude Code, ChatGPT
e Claude Desktop. Questa scelta definisce il perimetro da supportare e documentare;
non attesta una compatibilità già verificata. Il design tecnico deve verificare per
ciascuno collegamento, autenticazione, operazioni di lettura e scrittura, rispetto dei
ruoli e consegna delle esportazioni. Le differenze emerse devono essere riportate nella
guida e risolte o concordate prima del rilascio, senza introdurre altre eccezioni
implicite alla copertura delle operazioni.

| Ambito | Operazioni da coprire tramite MCP |
|---|---|
| Accesso e contesto | Collegare l'account, elencare le proprie famiglie e indicare quella su cui operare |
| Pasti e ricettario | Consultare oggi e settimane, cercare e leggere ricette, ingredienti e voti |
| Revisione | Cambiare ricetta e porzioni, chiedere suggerimenti, scambiare pasti, segnare pasti liberi o non cucinati, note ed esclusioni |
| Voti e generazione | Dare, cambiare o togliere il proprio voto; richiedere la generazione nei limiti previsti |
| Spesa | Selezionare pasti, generare e rivedere la lista temporanea, ottenere PDF, testo e collegamento Bring! |
| Famiglia e account | Creare e gestire la famiglia, impostazioni e inviti secondo il ruolo; per eliminarla restituire solo l'URL della pagina web; preferenze personali e cancellazione del proprio account, rimandando all'app quando comporterebbe anche l'eliminazione di una famiglia |
| Curatela | Conoscere i requisiti, salvare e riprendere bozze, validare e pubblicare ricette complete, modificare ricette di qualunque autore e ripristinare una versione precedente di una singola ricetta |
| Amministrazione globale | Gestire utenti, ruoli, nomina di amministratori, inviti e ripristino dell'intero catalogo da backup; cancellare utenti con i vincoli previsti, restituendo solo un URL quando l'operazione eliminerebbe anche una famiglia |

Il server ricava l'identità dall'accesso autenticato e verifica il diritto di operare
sulla famiglia o sulla funzione globale richiesta. Il nome di un ruolo fornito
dall'agente non concede quel ruolo. Risultati ed errori devono permettere all'agente di
mostrare gli stessi avvisi e risolvere gli stessi conflitti previsti dal web.

**Eliminazione della famiglia: passaggio obbligatorio all'app.** Una richiesta MCP
non esegue né prepara una cancellazione automatica; restituisce un risultato
strutturato che spiega la necessità di aprire l'app e contiene l'URL della pagina
appropriata. L'utente deve aprirla, autenticarsi se necessario e confermare. La pagina
verifica i permessi, senza considerarli concessi dal possesso del link.

La restrizione deve essere applicata sul server e coprire anche le cancellazioni
indirette tramite eliminazione dell'account dell'unico membro. Nascondere un comando
nella lista degli strumenti non basta: il design deve distinguere il contesto di
accesso web da quello MCP in modo verificabile, senza fidarsi di un parametro con cui
l'agente dichiara il canale della richiesta. Le altre operazioni rimangono disponibili
via MCP secondo i ruoli già concordati.

Un agente può assistere il curatore o l'utente nelle operazioni manuali, ma il
pianificatore automatico resta il sistema a regole della sezione 3. L'app non impone
un modello o un fornitore AI al client MCP.

**Pagina web di istruzioni:**

- spiega cosa permette il collegamento e quali operazioni dipendono dal ruolo;
- offre percorsi distinti per Codex CLI, Claude Code, ChatGPT e Claude Desktop, con
  indirizzo MCP e comandi o configurazioni copiabili quando il client usa questa
  modalità, oppure passaggi nell'interfaccia quando previsti;
- spiega accesso e autorizzazione nel browser, ammessi dall'utente, ed eventuale
  riautenticazione;
- chiarisce che l'eliminazione delle famiglie si completa soltanto nell'app, tramite
  il collegamento restituito dall'agente;
- include un esempio per verificare il collegamento e un esempio del flusso del curatore;
- descrive come scollegare l'agente secondo il meccanismo di autorizzazione scelto.

I client iniziali sono scelti; comandi e modalità di collegamento effettivi vanno
verificati nel relativo design. La specifica non assume che tutti gli agenti abbiano
lo stesso comando o le stesse capacità di
gestione di file. Il prototipo distinguerà gli esempi dalle istruzioni operative finali.

### 14. Prototipo e consolidamento del design

**Confermato:** il primo artefatto da costruire è un prototipo dell'app conservato nel
repository e sottoposto a review dell'utente, prima dell'implementazione del prodotto.
La review deve poter cambiare sia funzionalità sia scelte architetturali. Il prototipo
non è ancora stato creato; la directory è `prototype/`.

**Metodo e percorsi, concordati il 6 ottobre 2026.** Il prototipo si costruisce per
giri, ciascuno con preparazione, piano approvato, sviluppo, review con l'utente e
consolidamento. L'ordine dei percorsi, il loro stato, l'architettura del prototipo e
il contenuto di ogni giro sono tracciati in `design/percorsi.md`, guida dei flussi da
seguire anche nello sviluppo dell'app. Le decisioni di prodotto emerse nelle review
restano registrate in questa specifica; il documento dei percorsi descrive come si
attraversano nelle schermate e vi rimanda.

- ordine: Fondamenta, Menu, Ricettario e voti, Revisione dei pasti, Spesa, Famiglia e
  account, Curatela, MCP, Amministrazione dell'app;
- primo giro: Fondamenta, Menu, Ricettario e voti insieme, con una tappa intermedia
  dopo Fondamenta e Menu; i giri successivi si compongono alla fine di ogni review;
- prototipo SvelteKit autonomo eseguito nel browser, con dati demo in `localStorage`,
  operazioni applicative simulate che abbozzano quelle condivise fra web e MCP e un
  pannello di prova per utente, ruoli, lingua, unità, data simulata e scenari;
- tracciamento nel repository: `design/percorsi.md` per il percorso complessivo, un
  piano per giro in `progetto/superpowers/plans/`, commit Git locali per la storia.

**Linguaggio visivo definitivo, approvato il 4 ottobre 2026.** L'utente ha scelto
il linguaggio del riferimento HTML derivato dallo studio di HelloFresh e verificato
su iPhone. Il materiale approvato è raccolto in `design/`:

- `design/design.md`: guida operativa di palette, font, gerarchie, spazi e componenti;
- `design/index.html`: riferimento interattivo approvato;
- `design/assets/`: font e fotografie usati dal riferimento;
- `design/references/hellofresh/`: screenshot approvati e provenienza degli asset.

La guida attua questa decisione e rimane subordinata ai requisiti di questa specifica.
Il piano e lo sviluppo del prototipo devono usarla esplicitamente; non è necessario
riaprire la scelta del linguaggio. Ogni variazione successiva richiede accordo con
l'utente e aggiornamento della specifica e della guida.

**Caratteri del linguaggio approvato:** fondo crema `#FAF8F3`, superfici bianche,
testo e pulsanti primari `#232323`, verde `#067A46` per gli accenti e stato attivo
della navbar; titoli dei piatti in Agrandir Regular, sezioni in Agrandir Tight Bold,
corpo e controlli in Roboto. Schede bianche con fotografia quando disponibile e
ombra leggera; pulsanti da 8 px di raggio e separatori sottili. File dei font,
dimensioni, pesi, spazi e stati sono definiti nella guida.

**Struttura del riferimento approvato:** il Menu si apre direttamente sul calendario,
senza header introduttivo o footer decorativo. I giorni restano in colonne da
scorrere lateralmente, con selettore superiore sincronizzato; il giorno attivo è
scuro con testo bianco. Nessuna ripetizione del numero del giorno o contatori nel
contenuto. Dal 6 ottobre 2026 la navbar inferiore mostra Menu, Ricettario e una voce
per famiglia, account, cambio di famiglia e funzioni dei ruoli (curatela,
amministrazione, istruzioni MCP), con etichetta «Tu» / «You» confermata nella review
del primo giro; la Spesa esce dalla navbar e il suo punto d'ingresso, probabilmente dal Menu, si
decide nel percorso Spesa. Sopra il selettore dei giorni una barra con il mese e le
icone di azione (calendario, in seguito spesa); la scheda del pasto ha un footer a icone
per scheda ricetta, voto, ingredienti e, sui pasti passati, "non cucinato"; foto in
banner basso 3:1 e fonte sulla riga del tempo, troncata. Le schede del ricettario usano
lo stesso componente; il ricettario ha ricerca, un'icona che apre filtri e
ordinamento (nome, voto, aggiunte di recente, mangiate di recente), con una freccia
per invertire l'ordine scelto; nessun filtro per stagione. Nella scheda
ricetta il titolo apre la fonte e sotto seguono voto, descrizione, porzioni e
ingredienti (dettagli in `design/design.md`).
La navbar mostra solo icone, con nomi accessibili,
rispettando l'area sicura dell'iPhone e senza coprire i contenuti. Gli ingredienti si
espandono nelle singole card. Questi elementi costituiscono la base delle relative
viste del prototipo; le altre funzioni vanno declinate nello stesso linguaggio.

**Ambito dell'approvazione:** l'HTML in `design/` è un riferimento visivo e di
interazione, non il prototipo completo o l'implementazione del prodotto. Il menu
fisso, il ricettario limitato alle ricette della settimana e la spesa del solo
giorno selezionato sono dimostrativi: non sostituiscono il catalogo globale e la
spesa consolidata delle sezioni 6 e 8. Il prototipo dovrà coprire i flussi, le lingue,
le unità, i ruoli e gli stati previsti dalla specifica. Il sito esterno documenta
l'origine dello stile; cambiamenti futuri di quel sito non alterano la scelta
consolidata nel repository.

**Perimetro proposto da concordare nel piano del prototipo:**

- navigazione provabile da telefono e desktop, con dati dimostrativi;
- pasti di oggi, settimana e revisione, ricerca e scheda ricetta, voti e lista della spesa;
- famiglia, membri e inviti, preferenze personali e della famiglia; eliminazione della
  famiglia da parte del suo amministratore solo nell'app, con passaggio dal link
  restituito da MCP; differenza rispetto alla cancellazione di un account, con i
  vincoli sull'ultimo amministratore e sull'eliminazione indiretta delle famiglie;
- cambio lingua e sistema di misura osservabile nei dati mostrati;
- pagina di collegamento MCP e rappresentazione del percorso guidato del curatore;
- sezione bozze nell'app, ripresa del lavoro e pubblicazione; modifica di una ricetta
  di un altro curatore e rappresentazione del recupero da errore;
- rappresentazione del futuro percorso manuale senza AI, con modifica, verifica e
  correzione di una bozza condivisa; la sua presenza nel prototipo non anticipa la
  priorità di implementazione M6;
- pagina di amministrazione dell'app, con elenco utenti, ruoli, inviti, cancellazione
  e percorso di ripristino dell'intero catalogo;
- stati significativi: dati mancanti, nessun risultato, permessi insufficienti e conflitti.

Proposta: simulare le integrazioni per rivedere l'esperienza prima di collegare servizi
reali. La review del prototipo non certifica la compatibilità di un client MCP, il
funzionamento dell'autenticazione o l'applicazione dei permessi: questi richiedono le
successive verifiche tecniche.

**Criterio di passaggio all'implementazione:** review del prototipo, decisioni riportate
nelle sezioni pertinenti di questo documento, verifica dell'architettura risultante,
piani aggiornati e approvati, scelta del metodo di esecuzione. Il linguaggio visivo
è già approvato; le ulteriori decisioni sulle superfici e sui flussi entreranno qui
insieme ai riferimenti ai file del prototipo completo.

### 15. Decisioni da completare nel design

Questa sezione è parte della specifica di lavoro: rende visibili le scelte ancora aperte,
non autorizza a risolverle implicitamente durante l'implementazione. Quando una scelta
viene concordata, si aggiorna la relativa sezione e si chiude la voce qui.

| Tema | Decisione da concordare | Dove confluisce |
|---|---|---|
| Utenti e inviti | Regole degli inviti all'app, ruoli eventualmente assegnati all'accettazione, gestione degli inviti familiari da parte dell'amministrazione globale; possibilità di rientro di un membro rimosso usando un invito ancora valido (review R2) | Sezione 7 |
| Cancellazione | Forma della conferma e del passaggio da MCP al web, dettagli tecnici della cancellazione e della revoca degli accessi, attribuzioni, inviti pendenti e bozze condivise. Già confermate protezione dell'ultimo amministratore, successione familiare ed eliminazione della famiglia solo nell'app, anche quando conseguente alla cancellazione di un account | Sezioni 2, 7 e 13 |
| Completezza delle ricette | Campi specifici per ogni fonte e momento della conferma del curatore; ingredienti, quantità e unità applicabili, porzioni ed entrambe le lingue già obbligatori per pubblicare. Rappresentazione nello storico importato delle ricette ancora in bozza, senza esporre le bozze alle famiglie | Sezioni 8, 11 e 12 |
| Ciclo di curatela | Revisione delle ricette già pubblicate, archiviazione e gestione di contributi simultanei; versione della ricetta associata ai pasti già scelti (review R1). Condivisione delle bozze e percorso manuale web già confermati | Sezioni 2, 5 e 8 |
| Caricamento da file | Inclusione dell'upload opzionale, formati, singola ricetta o caricamento multiplo, errori e duplicati; priorità M6 | Sezioni 8 e 10 |
| Backup e ripristino | Dettagli dello storico delle versioni, effetti sui pasti pregressi, frequenza e conservazione dei backup, perdita di lavoro tollerata e procedura di recupero; permessi già confermati | Sezioni 2, 8, 9 e 13 |
| Lingue | Revisione delle traduzioni suggerite, testi liberi, impostazione iniziale della lingua e ricerca multilingue; traduzioni mancanti bloccano già la pubblicazione | Sezione 12 |
| Misure | Elenco dei codici, unità domestiche ambigue, fattori verificati, arrotondamenti imperiali e comportamento su quantità piccole | Sezione 6 |
| MCP | Verifica dei quattro client scelti, autenticazione e revoca, trasporto e hosting, consegna delle esportazioni e comportamento dei ritentativi | Sezioni 1 e 13 |
| Prototipo | Flussi, stati e componenti di ciascun percorso, da chiudere giro per giro; linguaggio visivo, metodo, ordine dei percorsi e architettura del prototipo già concordati (`design/percorsi.md`) | Sezione 14 |
| Implementazione | Revisione dello stack rispetto al prototipo, nuovi confini di M1a/M1b, flusso Git e configurazione dell'integrazione Supabase | Sezioni 1 e 10 |
| Calendario | Settimana iniziale di una famiglia nuova; fuso orario della famiglia (istante in cui un pasto diventa passato confermato nella sezione 5); generazione su richiesta rispetto al job del mercoledì (review R3; le chiusure sono state eliminate) | Sezioni 2, 4 e 5 |
| Importazione | Familiarità iniziale distinta dallo storico datato e mappatura delle ricette di casa con URL, senza perdita di provenienza (review R4) | Sezioni 3, 8 e 11 |
| Pianificatore e giudice | Classificazione univoca dei vincoli e degli esiti quando non soddisfacibili; chiarire se il giudice può conoscere la posizione dei pasti liberi (review R5) | Sezioni 3 e 9 |

### 16. Registro delle revisioni

| Data | Decisioni consolidate |
|---|---|
| 29 settembre 2026 | Approvata la base funzionale e tecnica dell'app, con pianificatore a regole e rilascio per fasi |
| 3 ottobre 2026 | Aggiunti unità metriche/imperiali britanniche, lingua personale italiano/inglese britannico, parità MCP, ruolo di curatore e inserimento guidato, catalogo autorevole nel database, guida MCP, amministrazione globale degli utenti e codice in inglese. Confermati ruoli globali cumulabili senza accesso automatico ai contenuti familiari. Stabiliti prototipo prima dell'implementazione e questo documento come riferimento unico aggiornato a ogni nuova scelta |
| 3 ottobre 2026, prosecuzione | Confermate bozze persistenti visibili in una sezione dell'app, possibilità per ogni curatore di modificare l'intero ricettario e necessità di backup e ripristino. La completezza è richiesta per pubblicare nel catalogo, mentre le bozze possono essere incomplete. Il ripristino della singola ricetta spetta ai curatori, quello dell'intero catalogo agli amministratori dell'app |
| 3 ottobre 2026, curatela manuale | Confermate bozze condivise e modificabili da tutti i curatori. Aggiunto il percorso manuale web senza AI per creare, modificare, verificare nuovamente e pubblicare ricette; ultima priorità di implementazione (M6). Upload da file registrato come opzione da definire |
| 3 ottobre 2026, traduzioni | Confermati italiano e inglese britannico entrambi obbligatori per pubblicare una ricetta; traduzioni mancanti mantengono la scheda in bozza, anche per l'importazione |
| 3 ottobre 2026, ingredienti | Confermati elenco verificato degli ingredienti, quantità e unità quando applicabili e porzioni di riferimento come requisiti di pubblicazione anche per le ricette pregresse. Ammessi "q.b." espliciti; i dati mancanti mantengono la ricetta in bozza |
| 3 ottobre 2026, client MCP | Scelti Codex CLI, Claude Code, ChatGPT e Claude Desktop come client obiettivo della prima versione, con guida dedicata e verifica tecnica per ciascuno |
| 3 ottobre 2026, cancellazioni | Confermate le regole per cancellare utenti: protezione dell'ultimo amministratore dell'app, successore nelle famiglie con altri membri, eliminazione della famiglia dell'unico membro, conservazione delle ricette pubblicate e revoca degli accessi. Aggiunto al ruolo di amministratore della famiglia il diritto di eliminarla senza cancellare gli account dei membri |
| 3 ottobre 2026, eccezione MCP | Eliminazione delle famiglie riservata all'app web: MCP restituisce un URL e l'utente completa l'operazione nella pagina dedicata. La restrizione copre anche la cancellazione di account che comporterebbe l'eliminazione di una famiglia |
| 3 ottobre 2026, review avversariale | Riesame indipendente della revisione `e473472`: direzione di prodotto adatta al prototipo esplorativo, implementazione ancora subordinata alle decisioni e correzioni della sezione 17. Nessuna soluzione proposta dal revisore è automaticamente una decisione approvata |
| 4 ottobre 2026, linguaggio visivo definitivo | Approvato il linguaggio derivato dallo studio HelloFresh e rappresentato in `design/index.html`: guida vincolante in `design/design.md`, istruzioni per gli agenti e materiale approvato consolidato in `design/`. Il futuro prototipo deve riusare questa base; flussi e servizi restano soggetti alla specifica e ai piani successivi |
| 6 ottobre 2026, percorsi del prototipo | Concordati metodo per giri, ordine dei nove percorsi, primo giro su Fondamenta, Menu e Ricettario con tappa intermedia, prototipo SvelteKit con dati e operazioni simulate, tracciamento in `design/percorsi.md` e nei piani di giro |
| 6 ottobre 2026, preparazione del primo giro | Pasto passato alle 15:30 (pranzo) e alle 23:00 (cena); quarta voce della navbar per famiglia, account e ruoli; due varianti del componente voto da confrontare nella review |
| 6 ottobre 2026, tappa intermedia del prototipo | Eliminati stati e chiusura delle settimane: ogni settimana è modificabile, i pasti passati contano come cucinati salvo "non cucinato", il job genera soltanto. Calendario per scegliere qualunque giorno con menu; Spesa fuori dalla navbar, ingresso da decidere nel percorso Spesa |
| 6 ottobre 2026, review del primo giro (in corso) | Barra con mese e icone sopra i giorni; schede con footer a icone, foto 3:1 e fonte troncata sulla riga del tempo; stesso componente nel ricettario; voto in riga; scheda ricetta con titolo collegato alla fonte; filtri richiudibili con ordinamento invertibile e senza stagione; quantità non numeriche tradotte e obbligatorie per pubblicare; etichetta «Tu» confermata; bozze in testa al ricettario solo per i curatori; navbar con sole icone |

### 17. Review avversariale del 3 ottobre 2026

**Perimetro:** revisore indipendente con contesto nuovo, senza la conversazione di
progettazione; lettura integrale della specifica alla revisione
`e47347200045f1a82ad5b296fad4b95ead45f6f9`, confronto con la base `0ff8a66`, AGENTS,
README e dati pertinenti del progetto di origine. Il revisore ha lavorato in sola
lettura. I rilievi sostanziali sono stati ricontrollati nel testo e negli esempi
dell'origine prima di essere registrati qui.

**Verdetto:** pronto per un **prototipo esplorativo**, non pronto per l'implementazione.
La review non ha dimostrato incompatibilità che impongano di cambiare stack o rinunciare
a MCP. Il prototipo può servire proprio a confrontare le alternative ancora aperte;
non deve presentare come definitivi comportamenti che non sono stati concordati.

**Ripresa concordata con l'utente:** al termine della review del 3 ottobre è confermato
che il prossimo passo sarà iniziare dal prototipo. I casi emersi dalla review guideranno
la sua progettazione e le decisioni ancora aperte, prima dei nuovi piani del prodotto.

I rilievi seguenti sono **aperti**. Le raccomandazioni sono proposte di revisione e non
sostituiscono i requisiti confermati finché non viene concordata e integrata la soluzione.

**R1 — Impatto alto: versioni delle ricette e significato del ripristino.**
Sezioni 2, 5 e 8. Uno slot che conserva solo l'identità della ricetta potrebbe mostrare
ingredienti e dosi nuovi dopo una modifica del curatore, anche quando la famiglia ha
già fatto la spesa. Inoltre un backup precedente alla creazione di una ricetta non può
sostituire semplicemente il catalogo se menu e voti ormai la referenziano. Ripristinare
traduzioni o dati di ingredienti condivisi potrebbe cambiare altre ricette, mentre il
recupero singolo promette di non farlo. È una decisione di prodotto ancora aperta,
non un'impossibilità tecnica dimostrata. Occorre scegliere la versione usata dai pasti,
il destino delle ricette successive al backup e l'ambito delle dipendenze ripristinate.
**Quando:** rappresentare i casi in P0, chiudere la semantica prima dello schema M1.

**R2 — Impatto alto sul controllo degli accessi: rientro dopo rimozione.**
Sezione 7. Gli inviti familiari sono riutilizzabili per sette giorni: secondo il flusso
descritto, un membro rimosso potrebbe riaprire un invito ancora valido e rientrare.
L'esistenza di questo percorso deriva dalle regole scritte; l'aspettativa che la
rimozione debba impedirlo è un'inferenza da confermare con l'utente. Va deciso se la
rimozione richieda una nuova autorizzazione esplicita per tornare, anche in presenza di
più inviti validi. **Quando:** scenario in P0 e regola chiusa prima di M1.

**R3 — Impatto medio: generazione su richiesta e chiusura delle settimane.**
Sezioni 2, 4 e 5. Il worker chiude la settimana precedente e la generazione su richiesta
usa la stessa funzione: eseguire letteralmente questo flusso il lunedì può anticipare
la chiusura rispetto al mercoledì previsto. Se tutte le esecuzioni di un mercoledì
falliscono, manca inoltre una regola per chiudere le settimane scadute più vecchie e
per rappresentarne lo stato. Raccomandazione: distinguere generazione richiesta e
chiusura di tutte le settimane effettivamente scadute, con condizioni proprie. Sono
da precisare anche il target della prima generazione e l'istante in cui un pasto passa.
**Quando:** comportamento visibile in P0; orchestrazione e recupero prima di M3.
**Aggiornamento del 6 ottobre 2026:** le chiusure delle settimane sono state eliminate
(sezione 2) e l'istante del pasto passato è deciso (sezione 5); resta aperta solo la
parte su generazione su richiesta e prima generazione.

**R4 — Impatto medio: mappature dell'import che i dati reali richiedono.**
Sezioni 3, 8 e 11. Nell'origine `pasta-tonno` e `lenticchie-comidista` risultano
`collaudata: true` senza apparizioni in `storico`; esistono inoltre ricette `casa` con
URL, mentre il nuovo tipo `home` indica assenza di fonte esterna. Conservare soltanto
voti, storico ed esclusioni perderebbe la familiarità iniziale; copiare il tipo senza
analizzarne la provenienza potrebbe perdere collegamenti. Il report delle ambiguità
deve coprire questi casi, senza inventare pasti passati o cambiare la fonte degli
ingredienti. Non è un errore di un import già implementato: è un requisito da precisare
nel contratto di import. **Quando:** prima dell'importazione M1; non blocca P0.

**R5 — Impatto basso, solo per il giudice opzionale: pasti liberi deducibili.**
Sezione 3. Trasmettere giorno e tipo di pasto di ogni ricetta permette di dedurre gli
slot liberi mancanti in una settimana completa, mentre il testo promette di non inviare
quali pasti sono liberi. Va chiarito se il divieto riguardi il testo libero oppure
anche la posizione degli slot; nel secondo caso occorre adeguare il payload.
**Quando:** prima dell'esperimento del giudice in M3; non blocca P0 o M1.

**Verifiche tecniche da portare nei piani, senza nuove decisioni implicite:**

- La revoca degli accessi richiesta dalla sezione 7 deve coprire anche token già
  emessi, letture del catalogo e sessioni MCP. La documentazione Supabase consultata
  dal revisore tramite Context7 precisa che eliminare un utente non invalida subito
  tutti i suoi JWT: la cancellazione dell'account non basta da sola a realizzare il
  requisito. [Gestione utenti Supabase](https://supabase.com/docs/guides/auth/managing-user-data).
- Il recupero applicativo del catalogo deve essere distinto dal ripristino dell'intero
  database, per rispettare l'indipendenza dei dati familiari richiesta in R1.
  [Backup Supabase](https://supabase.com/docs/guides/platform/backups).
- Prima di M3 serve una classificazione unica di vincoli rigidi, obiettivi e deroghe:
  `weekly_max`, massimi degli intervalli e venerdì pesce devono avere esiti verificabili
  quando non soddisfacibili. I limiti di runtime dichiarati non sostituiscono la misura
  del carico reale del pianificatore.
- Restano da verificare effettivamente i quattro client MCP, il contesto web richiesto
  per eliminare famiglie, le esportazioni e i ritentativi. Il prototipo simulato non
  dimostra questi comportamenti tecnici.

**Aspetti risultati coerenti:** fonte unica dei requisiti; database autorevole;
separazione fra bozze e pubblicato; nuova validazione al momento della pubblicazione;
ruoli globali distinti da quelli familiari; eccezione MCP estesa alle cancellazioni
indirette; conversioni senza arrotondamenti cumulativi né equivalenze massa/volume
inventate; implementazione manuale differita deliberatamente a M6.

**Limiti della review:** nessuna implementazione o integrazione reale eseguita; nessuna
certificazione della compatibilità MCP o del deploy. Non sono stati rivalidati criteri
nutrizionali o prezzi dei fornitori AI. Le decisioni già elencate come aperte nella
sezione 15 non sono state automaticamente classificate come difetti.
