# App Famiglia: design

Data: 29 settembre 2026
Stato: spec approvata dall'utente il 29 settembre 2026
Repository: `fedfol-powa/meal_planner_2` (privato)
Progetto di origine: `fedfol-powa/meal_planner` (resta attivo, vedi "Convivenza")

Questa spec descrive **comportamenti e dati**, non superfici. Forma, posizione e tipo di
elemento dell'interfaccia (barre, icone, pulsanti, schermate, gesti) si decidono in una fase
dedicata di design delle superfici, prima di implementare le viste. Dove il testo cita
un'interazione ("si vota", "si segnala"), definisce cosa deve essere possibile, non come
appare.

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
- **Chiunque può iscriversi** e creare la propria Famiglia.
- **Il curatore del ricettario** (Federico) aggiunge le ricette nuove, con l'aiuto dell'AI.
  Le famiglie usano il ricettario ma non lo modificano.

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

**Mercoledì sera** l'app prepara la bozza del menu della settimana che comincia il lunedì
dopo: dodici pasti circa, con i pasti liberi già segnati (per esempio "sabato sera fuori",
"domenica pizza").

**Da giovedì a domenica** tutti i membri della Famiglia possono rivedere la bozza:

- cambiare un piatto scegliendo tra cinque suggerimenti o cercando nel ricettario;
- chiedere "proponimene un altro";
- cambiare il numero di porzioni;
- scambiare due pasti tra loro o segnarne uno come libero;
- scrivere una nota;
- dire "non proporre più" per un piatto che non si vuole rivedere.

Ogni piatto mostra chi l'ha cambiato per ultimo e quando ("cambiato da Anna, venerdì
21:30"), così si sa sempre a chi chiedere.

**Durante la settimana** si possono ancora cambiare i pasti che non sono ancora arrivati.
Se un pasto passato non è stato cucinato, lo si segna.

**Il mercoledì dopo** l'app chiude la settimana precedente (fino ad allora si può ancora
segnare un pasto come non cucinato) e prepara la bozza successiva. Il ciclo ricomincia.

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

### Cosa l'app non fa (per ora)

- Non inventa ricette e non usa l'AI per scegliere i piatti. L'AI, se attiva, fa solo da
  giudice tra settimane già valide.
- Non permette alle famiglie di aggiungere ricette.
- Non tiene uno storico completo delle modifiche visibile nell'app (solo l'ultima).
- Non manda notifiche.

---

## Parte 2: design tecnico

### 1. Architettura

```
meal_planner_2/
├── ricettario/ricette.yaml       catalogo curato (git, pull request)
├── ricettario/ingredienti.yaml   anagrafica ingredienti canonici
├── pianificatore/                modulo TypeScript puro: regole, punteggio, scalatura, lista
├── app/                          SvelteKit, mobile-first, installabile (PWA)
├── supabase/migrations/          schema SQL e policy RLS
├── supabase/functions/           Edge Function del job settimanale
├── scripts/                      validazione e sync del ricettario, import iniziale
└── progetto/                     spec, piani, regole di progetto
```

- **Hosting app: Netlify** (adapter SvelteKit ufficiale). Serve l'app e poche funzioni
  server: generazione della lista, pagina temporanea per Bring!.
- **Supabase**: Postgres, Auth, RLS, `pg_cron`, Edge Functions. Il repository è già
  collegato all'organizzazione Supabase tramite l'integrazione GitHub: nel M1 si verifica
  come applica le migrazioni (branch di produzione, cartella) e ci si allinea.
- **Il modulo `pianificatore/`** è TypeScript senza dipendenze di runtime, così lo importano
  sia l'Edge Function (Deno) sia l'app (Node): una sola implementazione per bozza,
  suggerimenti, avvisi, scalatura e lista.
- **Motivazioni delle scelte** (decise in conversazione il 28-29 settembre 2026):
  - Supabase invece di Django o Firebase: login, inviti e isolamento tra famiglie garantito
    dal database (RLS); il modello è relazionale.
  - SvelteKit invece di Next.js: meno JavaScript sul telefono, meno complessità, neutrale
    tra host.
  - Netlify invece di Vercel: il piano Hobby di Vercel è solo per uso personale non
    commerciale e i suoi cron girano al massimo una volta al giorno con un'ora di
    tolleranza. Il job sta comunque in Supabase, quindi l'host serve solo l'app.

### 2. Modello dei dati

**Catalogo** (lettura per gli utenti autenticati, scrittura solo dalla sync):

| Tabella | Campi principali |
|---|---|
| `ricette` | slug, nome, descrizione, tipo (`web`/`youtube`/`libro`/`casa`), url, libro (id, pagine), tempo_min, porzioni_base, proteina, carboidrato, verdure (bool), categoria, pasto (`pranzo`/`cena`/`entrambi`), stagioni, pesante (bool), tag, archiviata. Tutte le ricette sono globali: non esistono ricette private di una famiglia. `casa` indica una ricetta senza fonte esterna, visibile a tutti come le altre |
| `ingredienti` | slug, nome, reparto, dispensa (bool), sinonimi |
| `ricetta_ingredienti` | ricetta, ingrediente, quantita (numero o null), unita, testo originale, opzionale, principale (bool) |
| `libri` | id, titolo |

**Per famiglia** (RLS: si vede e si scrive solo nella propria famiglia):

| Tabella | Campi principali |
|---|---|
| `famiglie` | nome, impostazioni (vedi sotto), creata_il |
| `membri` | famiglia, utente, ruolo (`admin`/`membro`), entrato_il |
| `inviti` | token casuale, famiglia, creato_da, scade_il (7 giorni), revocato |
| `famiglia_libri` | famiglia, libro: i libri posseduti |
| `esclusioni` | famiglia, ricetta, motivo, creata_da, creata_il: "non proporre più" |
| `ingredienti_famiglia` | famiglia, ingrediente, livello (`evita`/`limita`), max_settimana |
| `settimane` | famiglia, inizio (lunedì), generata_il, chiusa_il. Unica per (famiglia, inizio) |
| `slot` | settimana, giorno, pasto, ricetta o testo libero, porzioni, nota, cucinata (`true`/`false`/null), modificato_da (null = app), modificato_il |
| `modifiche_slot` | slot, autore, prima (jsonb), dopo (jsonb), il: registro append-only |
| `voti` | utente, ricetta, stelle (1-5), il. Unico per (utente, ricetta) |
| `job_settimanali` | famiglia, settimana_target, stato, tentativi, errore, aggiornato_il |
| `liste_temporanee` | token casuale, voci (jsonb), scade_il (30 minuti) |

**Viste:**

- `punteggio_famiglia`: media delle stelle dei membri attuali per ricetta;
- `punteggio_globale`: media anonima su tutte le famiglie, usata solo per l'avvio a freddo.

**Stato della settimana**, derivato dalle date più `chiusa_il`:

- `bozza` prima del lunedì;
- `in_corso` dal lunedì alla domenica;
- `da_chiudere` dal lunedì al mercoledì successivi;
- `chiusa` dopo `chiusa_il`.

Alla chiusura gli slot con `cucinata = null` diventano `true`.

**Impostazioni della famiglia** (`famiglie.impostazioni`, jsonb validato):

- matrice commensali per giorno e pasto, con porzioni di default;
- slot fissi (`libero` con testo, per esempio sabato cena e domenica pranzo);
- limiti di tempo per slot (per esempio lunedì e mercoledì cena al massimo 15 minuti);
- regole di pasto: pasta solo a pranzo; pesce almeno una volta il venerdì; niente pesce
  fresco il lunedì;
- quota note/nuove (default 7/5 ± 1 su 12 pasti);
- intervalli settimanali per gruppo alimentare (sezione 3);
- pesi del punteggio.

**Ruoli:**

- `membro`: legge la famiglia, modifica gli slot, vota, gestisce le esclusioni;
- `admin`: in più gestisce inviti, membri e impostazioni. L'ultimo admin non può uscire
  senza nominarne un altro;
- nessun utente scrive nel catalogo.

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
- ingrediente `evita` come ingrediente non opzionale;
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
- **ingredienti `limita`**: penalità, e al massimo `max_settimana` volte.

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
- **Fornitore intercambiabile.** Un'interfaccia `Giudice` (candidate → punteggi) con
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
- **Dispatcher**: crea in modo idempotente una riga in `job_settimanali` per ogni famiglia
  e per il lunedì successivo.
- **Worker**: invoca l'Edge Function **una volta per famiglia**, perché i limiti di Supabase
  sono 2 secondi di CPU per richiesta e 150 secondi di durata sul piano Free. Per ogni
  famiglia, in un'unica transazione:
  1. chiude la settimana precedente (`chiusa_il`, e `cucinata` null → true);
  2. genera la bozza, se la settimana non esiste già. Con il giudice attivo genera le
     candidate e chiama il giudice fuori dalla transazione: l'attesa della risposta è I/O e
     non consuma i 2 secondi di CPU.
- **Errori**: un errore riguarda solo la sua famiglia. Si ritenta all'esecuzione successiva
  fino all'ultima finestra utile. Alla fine arriva un'email al curatore con le famiglie
  ancora senza bozza.
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
  all'`url` della fonte, che si apre fuori dall'app senza passare il referrer (come fa oggi
  il sito del progetto di origine con `Referrer-Policy: no-referrer`). Per `libro` si
  mostrano titolo e pagine; per `casa` nessun collegamento. Per gli slot liberi, il testo.

- **Cosa è modificabile**:
  - la bozza, per intero;
  - la settimana in corso, solo per i pasti non ancora passati;
  - dopo il pasto, solo "non cucinata" (fino alla chiusura della settimana).
- **Azioni sullo slot**: cambia ricetta (suggerimenti o ricerca con filtri), proponimene un
  altro, cambia porzioni, scambia con un altro slot, segna libero con testo, nota, non proporre
  più, vota.
- **Voto**: è sulla ricetta (`voti`: utente × ricetta), non sullo slot. È sempre possibile,
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
- **Tracciabilità**: ogni scrittura aggiorna `modificato_da` e `modificato_il` e aggiunge
  una riga a `modifiche_slot`. L'interfaccia mostra solo l'ultima modifica.
- **Concorrenza**: blocco ottimistico su `modificato_il`. Se lo slot è cambiato nel
  frattempo si mostra la versione nuova con l'autore, e si sceglie se sovrascrivere. Niente
  realtime in v1: aggiornamento all'apertura e a richiesta dell'utente.
- **Offline**: l'ultima settimana caricata resta consultabile in sola lettura.

### 6. Scalatura e lista della spesa

- **Scalatura**: quantità × porzioni dello slot ÷ `porzioni_base`. Arrotondamenti:
  - grammi alla decina (a 5 g sotto i 50 g);
  - ml come i grammi;
  - pezzi e spicchi al mezzo superiore;
  - cucchiai e cucchiaini al mezzo.
- **Unità**:
  - scalabili: `g`, `kg`, `ml`, `l`, `pz`, `spicchio`, `cucchiaio`, `cucchiaino`;
  - solo elencate: `mazzetto`, `pizzico`, `q.b.`.
- **Generazione della lista**:
  1. si parte dagli slot selezionati;
  2. si scalano gli ingredienti;
  3. si consolida per ingrediente canonico, convertendo g↔kg e ml↔l; le unità
     incompatibili restano sulla stessa voce ("2 pz + 300 g");
  4. si escludono gli ingredienti `dispensa` e quelli `evita` della famiglia, che vengono
     segnalati a parte;
  5. si segnano gli opzionali;
  6. si raggruppa per reparto nell'ordine standard;
  7. le ricette senza ingredienti vanno in "Ingredienti non registrati".
- **Scorciatoie di selezione**: "da oggi a domenica", "tutta la prossima settimana". "Solo
  quelli non ancora in lista" usa soltanto memoria locale del browser.
- **Effimera**: la lista non si salva in database, tranne nel caso di Bring!. Si possono
  togliere voci prima di esportare.
- **Esportazioni**:
  - PDF di una pagina;
  - Web Share API, con testo semplice;
  - Bring!: si salva in `liste_temporanee` con un token casuale e si apre
    `https://api.getbring.com/rest/bringrecipes/deeplink?url=<app>/spesa/<token>&source=web`.
    La pagina `/spesa/<token>` è pubblica e `noindex`, e contiene solo il JSON-LD
    `schema.org/Recipe` con `recipeIngredient` nel formato "quantità nome", senza nome della
    famiglia né giorni. Scade dopo 30 minuti; un cron la pulisce. È lo stesso meccanismo
    di `scripts/sito_lib.py` nel progetto di origine.

### 7. Account, Famiglia, inviti

- **Supabase Auth**: magic link via email e Google. Iscrizione aperta.
- **SMTP personalizzato** (per esempio Resend): il servizio email di default di Supabase
  manda al massimo 2 email all'ora ed è solo per le prove. Con un SMTP personalizzato il
  limite parte da 30 all'ora ed è configurabile.
- **Inviti**:
  - link `/invito/<token>`, valido 7 giorni, riusabile fino alla scadenza, revocabile;
  - chi lo apre si iscrive se non ha un account ed entra nella famiglia; se ne fa già parte,
    non cambia niente;
  - token scaduto o revocato: messaggio chiaro con l'invito a chiedere un link nuovo
    all'admin.
- **Wizard della famiglia nuova**:
  - nome;
  - matrice commensali;
  - slot fissi;
  - ingredienti da evitare o limitare;
  - libri posseduti;
  - obiettivi, con i default CREA;
  - "Genera la prima settimana adesso".
- **Rimozione di un membro**: i suoi voti escono dalla media; le tracce diventano "ex
  membro".
- **Cancellazione dell'account**: rimuove voti e dati personali.
- **Privacy**: informativa, dati minimi (email, nome visualizzato, dati della famiglia).
- **Limiti di frequenza**: iscrizioni (rate limit di Supabase Auth) e generazioni su
  richiesta.

### 8. Ricettario: formato, validazione, sync

- `ricettario/ingredienti.yaml`: slug, nome, reparto, dispensa, sinonimi (per esempio
  "ceci lessati" e "ceci già cotti" → `ceci-cotti`).
- `ricettario/ricette.yaml`: le schede con gli attributi strutturati della sezione 2. Gli
  ingredienti hanno la forma
  `{ingrediente: ceci-cotti, quantita: 200, unita: g, testo: "Ceci già cotti 200 g"}`.
  Resta la regola del progetto di origine: ingredienti solo se verificati sulla fonte o
  forniti dal curatore, trascritti per `porzioni_base`, mai dedotti.
- **Validazione in CI** (bloccante sulla pull request):
  - schema e slug unici;
  - ingredienti presenti nell'anagrafica e unità ammesse;
  - `porzioni_base` presente quando ci sono ingredienti;
  - attributi del pianificatore completi;
  - `url` presente e valido per `web` e `youtube`.

  Una scheda tolta dal YAML non si cancella mai dal database: la sync la archivia, così i
  menu che la usano restano leggibili.
- **Sync**: GitHub Action al merge su `main`. Esegue un upsert idempotente in una sola
  transazione, con la service key tenuta nei secret di GitHub. Le schede sparite dal YAML
  diventano `archiviata`. Se qualcosa fallisce il database resta com'era.
- **Import iniziale**:
  1. lo script legge `../meal_planner/ricettario/ricette.yaml`;
  2. mappa i nomi degli ingredienti sull'anagrafica e interpreta numero e unità;
  3. produce la bozza nel nuovo formato più un **report di ciò che non sa interpretare con
     sicurezza**, che non si inventa;
  4. il report si rivede a mano, curatore e AI.

  Voti B, `storico` ed esclusioni nelle `note` diventano i **dati della famiglia del
  curatore**, in un seed separato che non entra mai nel catalogo. Conversione dei voti:
  B=1, BB=3, BBB=4, BBBB=5 stelle, come voto del curatore.
- **Ricette nuove**: stesso flusso di oggi con Claude Code, ma su questo repository. Si
  legge la fonte, si trascrive, si mappa sull'anagrafica (aggiungendo gli ingredienti
  nuovi), si compilano gli attributi, si valida, si apre la pull request, si fa il merge.

### 9. Test

- **Pianificatore**:
  - test unitari per regola su un catalogo di prova;
  - test di proprietà: su centinaia di semi, zero violazioni dei vincoli rigidi e ogni slot
    pieno o segnato "nessuna ricetta adatta";
  - **report di qualità**: `scripts/report-pianificatore` genera 20 settimane con i dati
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
- **Scalatura e lista**: casi tabellari su unità, arrotondamenti, non scalabili, sinonimi,
  unità incompatibili, `dispensa` ed `evita`.
- **RLS**: test contro il Supabase locale. Un membro della famiglia A non legge né scrive
  niente della famiglia B; nessun utente scrive nel catalogo; un membro non admin non
  gestisce inviti e impostazioni.
- **Ricettario**: validazione con casi validi e non validi; import con i casi presi dal
  ricettario attuale.
- **End to end** (Playwright): iscrizione, creazione della famiglia, invito, modifica di uno
  slot, voto, generazione della lista con pagina Bring!.

### 10. Fasi di rilascio

Ogni fase ha il suo piano di implementazione in `progetto/superpowers/plans/`. Prima di
implementare le viste di una fase, a partire dalla prima vista di M1, si fa il design delle
superfici che quella fase introduce, e lo approva l'utente.

| Fase | Contenuto | Risultato |
|---|---|---|
| **M1 Fondamenta** | Repository, schema e RLS, Auth, Famiglia, inviti, formato del ricettario con validazione e sync, import iniziale con revisione del report, seed della famiglia del curatore, vista della settimana in sola lettura | Si entra, si vede il ricettario e lo storico della propria famiglia |
| **M2 Modifica e voti** | Azioni sugli slot, suggerimenti, avvisi, "cambiato da", stelline e media, "non proporre più", creazione manuale di una settimana | La famiglia del curatore pianifica nell'app a mano con i suggerimenti |
| **M3 Pianificatore** | Algoritmo, report di qualità, job del mercoledì (chiusura e bozza), generazione su richiesta. Poi, come esperimento separato, giudice AI opzionale con valutazione | La bozza arriva da sola; il giudice si accende solo se vince la valutazione |
| **M4 Lista della spesa** | Selezione, consolidamento, PDF, condivisione, Bring! | Si fa la spesa dall'app |
| **M5 Apertura** | Wizard, avvio a freddo, privacy, SMTP, limiti di frequenza | Altre famiglie possono iscriversi |

### 11. Convivenza con il progetto di origine

- `meal_planner` resta com'è: YAML, PDF e sito Netlify pubblicato da `main`. Questa app è
  separata, con il suo repository, il suo sito Netlify e il suo progetto Supabase.
- Il ricettario del progetto di origine è la fonte dell'import iniziale. Fino allo
  spegnimento del vecchio flusso, lo script di import è **rilanciabile**: importa come
  bozza le schede nuove per slug e non tocca quelle già importate. Così una ricetta aggiunta
  nel vecchio repository può arrivare anche qui, passando dallo stesso report.
- Quando spegnere il vecchio flusso lo decide l'utente, dopo M4.
