# Spec W22: skeleton nelle pagine rare e nelle sezioni dei curatori (issue #49, seguito)

Brief `progetto/coordinamento/brief/w22-skeleton-pagine-rare.md`. Estende la spec di W20
`progetto/superpowers/specs/2026-10-18-skeleton.md` (e il suo piano), che resta valida in
tutto ciò che qui non cambia. Specifica principale, sezioni 14 e 15; `design/design.md`,
sezione «Caricamenti (skeleton)».

## Perché

W20 ha messo lo skeleton nelle pagine frequenti e ha lasciato le pagine rare con
`Loading` («Caricamento…»), nulla o messaggi propri; nel Ricettario le sezioni dei curatori
compaiono dopo e spostano i risultati. Il 23/10/2026 l'utente chiede lo stesso
comportamento ovunque: mentre i dati arrivano la pagina ha già la forma finale e non si
sposta all'arrivo. Niente prototipo: la variante B (pulsazione lenta) è già scelta.

## 1. Censimento (app web, 23/10/2026)

Misure ricavate dal CSS (righe di `row-list` da 52 px più 12 di padding, `settings-card`
con 16 px di padding e 20 di margine, `Loading` circa 72 px con i margini), da verificare
nel browser nel caso comune. «Sposta» dice cosa si muove all'arrivo dei dati. Profilo,
famiglia e quasi tutte le letture sono salvati sul telefono per 7 giorni (W20): l'attesa
si vede alla prima apertura di una chiave, dopo un'uscita o con la copia scaduta.

| # | Pagina (file) | Oggi durante l'attesa | All'arrivo | Sposta | Errore / vuoto |
|---|---|---|---|---|---|
| 1 | Profilo `/profile` (`routes/ProfilePage.tsx`) | Titolo con l'email, poi `Loading`; la scheda Account (sempre vera) sotto | Titolo con il nome e riga dell'email, scheda della famiglia (3 righe), scheda Famiglie (righe e link) | Il titolo cambia testo e cresce di una riga; la scheda Account scende di circa 400 px. Poi due letture secondarie (dettaglio della famiglia ed esclusioni) aggiungono i conteggi «N membri» e «N ricette» sotto le righe: dal CSS la riga resta alta 52 px (`row-link`, testo e conteggio circa 44 px), quindi nessuno spostamento, da verificare nel browser | `QueryError`; senza famiglia mancano le due schede |
| 2 | Preferenze `/profile/preferences` (`PreferencesPage.tsx`) | Nulla al posto della scheda del nome | Scheda con campo del nome e riga dell'email | Scheda Lingua, «Esci» ed «Elimina account» scendono di circa 170 px | `QueryError` |
| 3 | Membri `/profile/family` (`MembersPage.tsx`) | `FamilyGate` con `Loading` senza intestazione, poi intestazione e `Loading` | Scheda dei membri; per gli amministratori schede «Link d'invito» e «Ingressi» con un proprio `Loading` ciascuna, poi le righe; «Lascia la famiglia» in fondo | Intestazione che compare; pagina intera; per gli amministratori due attese in più, ognuna sposta ciò che segue | `QueryError` della pagina o della scheda; «nessun ingresso» è una `meta-line` |
| 4 | Impostazioni `/profile/family/settings` (`SettingsPage.tsx`) | `FamilyGate` con `Loading`, poi intestazione e `Loading` | Introduzione, nome, commensali (griglia 7 × 2), regole, ingredienti, libri, unità, avanzate, zona rossa | Intestazione che compare; pagina intera (oltre 1500 px) | `QueryError` |
| 5 | Esclusioni `/profile/family/exclusions` (`ExclusionsPage.tsx`) | `FamilyGate` con `Loading`, poi intestazione e `Loading` | Scheda con una riga per ricetta (nome, autore, motivo, «Riproponi») | Intestazione che compare; la scheda | `QueryError`; vuota: `StateNotice` |
| 6 | Agenti `/profile/agents` (`features/agents/AgentsPage.tsx`) | Schede statiche vere; nella scheda «Agenti collegati», l'ultima, `Loading` | Righe degli agenti e nota del rinnovo, o «Nessun agente» | Solo la fine della pagina; l'esempio dei curatori nella scheda «Prova» compare con il profilo | `QueryError` nella scheda; `meta-line` se vuota |
| 7 | Amministrazione `/admin` (`features/admin/AdminPage.tsx`, `AdminAccess.tsx`, `UsersSection.tsx`, `InvitationsSection.tsx`) | Intestazione vera; `AdminAccessGate` con `Loading` (profilo, o verifica dopo un rifiuto); poi Utenti con campo vero e `Loading`, Inviti con intestazione vera e `Loading` | Righe degli utenti; voci degli inviti | Tre attese in fila, ognuna sposta ciò che segue | `QueryError` del controllo o della sezione; «Nessun utente»; «Non hai accesso» |
| 8 | Dettaglio utente `/admin/users/$id` (`UserPage.tsx`) | Intestazione con titolo «Utenti», `Loading` | Titolo con il nome, email, scheda dei ruoli (o della cancellazione), scheda delle famiglie, zona rossa | Il titolo cambia testo; pagina intera | `StateNotice` (non trovato), `QueryError` |
| 9 | Eliminazione utente `/admin/users/$id/delete` (`UserDeletePage.tsx`) | Indietro «Utenti», titolo «Elimina utente», `Loading` | Indietro con il nome, titolo «Elimina {nome}», email, famiglie, scheda «Cosa sparisce» con il pulsante rosso | Titolo che cambia testo e può andare a capo; pagina intera | `StateNotice`, `QueryError`, rimando alle preferenze per sé stessi |
| 10 | Bozza `/recipes/drafts/$id` (`features/catalogue/DraftPage.tsx`) | Solo il link indietro e `Loading` (prima il profilo, poi la bozza) | Intestazione con il titolo, etichetta del tipo, fonte, descrizione, tempo, porzioni, blocchi di ingredienti, attributi e problemi | Compare il titolo sotto il link; pagina intera | «Bozza non disponibile», rifiuto, `QueryError` |
| 11 | Eliminazione famiglia `/profile/family/delete` (`FamilyDeletePage.tsx`) | Intestazione vera, `Loading` | Scheda del riepilogo con il pulsante rosso | La scheda | `StateNotice` (accesso), `QueryError` |
| 12 | Eliminazione account `/profile/account/delete` (`AccountDeletePage.tsx`) | Intestazione vera, `Loading` | Titolo «Le tue famiglie» e una scheda per famiglia, scheda «Cosa sparisce» con il pulsante rosso | Pagina intera | `QueryError`; avviso dell'ultimo amministratore |
| 13 | Invito all'app `/invite/app` (`features/app-invitations/InvitePage.tsx`) | Marchio e lingue veri, poi «…» con `aria-busy`, senza annuncio | Titolo, «da …», ruoli, modulo (email, nome, nota, pulsante) o l'altro account aperto | Pagina intera | Link non valido, troppi tentativi, errore con «Riprova» |
| 14 | Invito alla famiglia `/invite` (`features/family-invitations/InvitePage.tsx`) | Marchio e lingue veri, poi `Loading` | Titolo, «da …», modulo (senza accesso) o pulsanti per entrare (con accesso) | Pagina intera | Come sopra |
| 15 | Autorizzazione `/authorize` (`features/agents/AuthorizePage.tsx`) | Marchio vero, poi «…» con `aria-busy` | Consenso: titolo, nota, account, poteri, dati, dettagli, pulsanti | Pagina intera | Richiesta non valida, errore con «Riprova» |
| 16 | Scegli la password `/password` (`features/password/ChoosePasswordPage.tsx`) | Marchio, lingue, poi «Verifico il link…» con `aria-busy`; offline nulla (sotto il banner) | Titolo, riga dell'account, due campi, avviso, pulsante | Pagina intera | Titolo d'errore e «Chiedi un nuovo link» |
| 17 | Ricettario › sezioni dei curatori (`ArchivedRecipesSection.tsx`, `CatalogueDraftsSection.tsx`) | Nulla | Bozze (titolo e schede) sopra i risultati, Archiviate (titolo, chiusa) sotto | Bozze spinge giù i risultati, anche già visibili | `QueryError` nella sezione Bozze, una volta per le due |

Controllate e senza attesa di dati: `/profile/password`, `/family/new` (il link indietro
dipende dal profilo ma non aspetta nulla), `/password/forgot`, `/login`. Restano fuori
perché sono operazioni, non caricamenti di pagina: la ricerca degli ingredienti nelle
Impostazioni (risultati sotto il campo mentre si scrive), il foglio «Crea un link
d'invito» (attesa della creazione), l'invio del voto. Dentro il consenso (#15) la riga
«Leggo i tuoi ruoli…» resta com'è: è un'attesa voluta anche con il profilo salvato (i ruoli
mostrati devono venire da una lettura riuscita) e spiega perché «Consenti» è spento.

## 2. Comportamento

Valgono le regole di W20 (spec W20, punti 1-6): stessa forma, stesse classi e righe da
`1lh`, pulsazione solo sui blocchi esterni, soglia di 200 ms, nessuno skeleton con dati
disponibili o in un aggiornamento in background, offline in pausa fermo sotto il banner,
`aria-busy` sull'area, blocchi `aria-hidden` e mai toccabili. In più:

1. **Una sola attesa anche con più aree.** Nelle pagine con più letture (Membri per gli
   amministratori, Amministrazione, Ricettario con le sezioni dei curatori) tutti i blocchi
   della pagina appartengono a un'unica attesa: compaiono insieme dopo la soglia, si
   fermano insieme offline e c'è un solo annuncio di caricamento («Caricamento…») per la
   pagina. Ogni area mostra il proprio contenuto appena arrivano i suoi dati, senza
   aspettare le altre, e solo le aree ancora in attesa hanno `aria-busy`. L'annuncio si
   svuota quando nessuna area aspetta più.
   - **Un solo annuncio di caricamento, non un solo `role="status"` in assoluto**
     (decisione del coordinatore, 23/10, che è la lettura di W20: «un solo `role="status"`
     per pagina o area che annuncia "Caricamento…"»). Gli altri status della pagina restano
     com'erano, con il loro testo: il conteggio delle ricette nel Ricettario, la conferma
     «{nome} eliminato» in Amministrazione, «Scollegato» negli Agenti, «Salvataggio…» nelle
     Impostazioni, il banner offline. Per esempio, con le ricette arrivate e il riepilogo
     dei curatori ancora in attesa il Ricettario ha il conteggio e un solo «Caricamento…».
2. **Intestazioni vere.** Link indietro e titoli che non dipendono dai dati sono veri anche
   durante l'attesa. I titoli che vengono dai dati (nome nel Profilo, nome dell'utente,
   «Elimina {nome}», titolo della bozza) sono un blocco con le misure del titolo vero,
   nascosto ai lettori di schermo, come il titolo della Ricetta in W20: è un elemento dello
   skeleton della stessa attesa del corpo, quindi compare dopo la stessa soglia di 200 ms e
   si ferma offline insieme agli altri blocchi. Il link indietro resta fuori dalla parte
   nascosta, vero e raggiungibile. Il link indietro di «Elimina {nome}» resta vero con
   l'etichetta «Utenti» finché arriva il nome: cambia solo la larghezza del link, non le
   posizioni.
3. **Ruolo non ancora noto.** Si distinguono due casi.
   - **Sezioni condizionali** (parti di una pagina aperta a tutti che compaiono solo per un
     ruolo: le sezioni dei curatori nel Ricettario, le schede degli amministratori della
     famiglia in Membri): hanno blocchi solo quando il ruolo è noto, così chi non ha il
     ruolo non vede mai blocchi che poi spariscono.
   - **Pagine riservate** a un ruolo (bozza, amministrazione, dettaglio ed eliminazione di
     un utente): eccezione, vedi sotto.
   - «Ruolo noto» vuol dire presente nel profilo corrente, anche quando il profilo è
     ripristinato dalla copia salvata sul telefono. I controlli di revoca di oggi non
     cambiano: un ruolo tolto fa sparire sezioni e pagine come adesso.
   - Il ruolo di curatore e quello di amministratore dell'app vengono dal profilo; quello di
     amministratore della famiglia dalla famiglia del profilo. Il profilo è salvato sul
     telefono, quindi nel caso comune il ruolo è noto già all'apertura e i blocchi dei
     curatori e degli amministratori ci sono fin dal primo istante.
   - Senza profilo salvato (primo accesso, copia scaduta) tutta la pagina è in attesa,
     perché anche la famiglia viene dal profilo: all'arrivo del profilo i blocchi del ruolo
     si aggiungono fra gli altri blocchi. Si spostano solo blocchi, mai contenuto vero o
     controlli: nel Ricettario titolo e filtri, che stanno sopra, restano fermi.
   - Le pagine riservate mostrano il proprio skeleton anche mentre il ruolo non è noto
     (approvato dal coordinatore, 23/10): le apre quasi sempre chi ha il ruolo (i link ci
     sono solo per lui), e chi non l'ha vede i blocchi e poi l'avviso di oggi («Bozza non
     disponibile», «Non hai accesso a questa pagina»).
   - Agenti: l'esempio dei curatori nella scheda «Prova» resta come oggi, senza blocchi:
     dipende dal ruolo e il profilo di solito c'è già.
4. **Errori e liste vuote.** Come le pagine di W20: `QueryError`, `StateNotice` e le righe
   «nessun …» prendono il posto dello skeleton, con l'altezza propria. Nelle aree interne a
   una scheda (agenti collegati, link d'invito, ingressi, utenti, inviti) l'errore e la riga
   «nessun …» stanno nella scheda, come oggi.
5. **Layout di attesa completo.** Ogni pagina coperta ha un layout di attesa con gli stessi
   contenitori (`secondary-view`, `page-column`, `entry-page`) e la stessa intestazione
   della pagina caricata; `FamilyGate` e `AdminAccessGate` mostrano quel layout invece di
   `Loading`, come `FamilyGate` già fa per le pagine di W20. Si disegna fedelmente la parte
   in alto (circa la prima schermata del telefono); più sotto bastano schede della forma
   giusta, perché quello che arriva oltre la fine dello skeleton non sposta nulla di
   visibile.
6. **Stessa struttura del contenuto.** Ogni scheda in attesa riproduce gli elementi
   strutturali della scheda vera nello stesso ordine: contenitori intermedi (`row-link`
   dentro le righe del Profilo, la griglia di etichetta e valore dell'email nelle
   Preferenze), testi statici (suggerimenti, note) e pulsanti, così a parità di dati del
   caso comune lo spostamento è zero anche nei passaggi intermedi (profilo → dettaglio →
   liste), non solo fra l'inizio e la fine. Dove una scheda ha parti che non dipendono dai
   dati (titolo, suggerimento, pulsante «Crea un link»), quelle sono vere fin dall'inizio,
   appena il ruolo è noto.
7. **Righe dentro una scheda vera.** Quando la scheda è vera e aspetta solo la sua lista
   (agenti collegati, link d'invito, ingressi, utenti, inviti), ogni riga in attesa ha un
   proprio blocco esterno pieno che pulsa (la parte di testo della riga e il pulsante),
   perché le righe vuote da sole sono trasparenti. Dentro una scheda tutta a blocchi la
   riga resta vuota e il blocco è la scheda.

## 3. Sezioni dei curatori nel Ricettario

- **Quando.** Per un curatore (ruolo noto, punto 3) senza riepilogo del catalogo
  disponibile: le due sezioni hanno lo skeleton dentro l'attesa della pagina (punto 1),
  insieme ai risultati.
- **Bozze:** la sezione con il titolo come blocco alto quanto il pulsante del titolo
  (44 px) e le schede delle bozze come blocchi (classi `section`, `heading`, `cards`,
  `card` del modulo, con righe vuote per etichetta, nome su una riga e una riga di
  mancanze). Su telefono una sotto l'altra, su schermi larghi in file da due.
- **Quante schede** (decisione del coordinatore, 23/10): se sul telefono c'è un riepilogo
  del catalogo salvato, lo skeleton usa il suo numero di bozze, al massimo 3; altrimenti
  una scheda. In pratica il riepilogo salvato che si può leggere durante l'attesa è quello
  già in memoria per un'altra lingua (la lettura dipende dalla lingua): dopo un cambio di
  lingua il numero è quello giusto. Durante il ripristino dalla copia salvata il
  riepilogo non è ancora in memoria e si usa una scheda; leggerlo dalla copia sul disco
  prima del ripristino costerebbe una seconda lettura del salvataggio, sproporzionata per
  un'attesa che di solito dura meno di 200 ms. Con il riepilogo salvato nella lingua
  corrente non c'è attesa e le sezioni vere compaiono subito.
- **Archiviate:** la sezione chiusa (com'è all'apertura) con il titolo come blocco da
  44 px, in fondo alla pagina.
- **All'arrivo.** Con bozze o archiviate le sezioni compaiono al posto dei blocchi. Quando
  il numero o l'altezza delle bozze vere è diverso da quello dello skeleton (più bozze,
  nessuna bozza, nome su due righe, più righe di mancanze) i risultati si spostano: è lo
  spostamento ammesso quando il contenuto vero è diverso dal caso comune (spec W20,
  punto 2), e riguarda solo i curatori (decisione del coordinatore). Con lo stesso numero
  di bozze dello skeleton e la forma del caso comune il `top` dei risultati non cambia.
  Senza archiviate la sezione sparisce in fondo, dove non sposta nulla. Con un errore la
  sezione Bozze mostra `QueryError` come oggi.
- **Ruolo che arriva durante l'attesa.** Senza profilo salvato tutta la pagina aspetta; se
  il profilo arriva e dice curatore mentre il riepilogo è ancora in attesa, i blocchi
  delle sezioni si aggiungono fra i filtri e i blocchi dei risultati: si spostano solo
  blocchi, titolo e filtri restano fermi e non si rimontano.
- **Dopo.** Il riepilogo salvato si mostra subito; un aggiornamento in background non
  mostra blocchi; le sezioni mostrate non spariscono durante le attese successive dei
  risultati (filtri, ricaricamenti), come in W20.
- **Chi non è curatore** non vede mai blocchi delle sezioni: senza ruolo noto il componente
  non mostra nulla, come oggi.

## 4. Pagine

Righe e schede usano le classi della pagina vera (`settings-card`, `row-list`, `row-main`,
`field`, moduli CSS della pagina). «Blocco» è `skeleton-block` (pulsanti, campi, righe
isolate, titoli), «scheda» è `skeleton-card`.

| Pagina | Layout di attesa | Note |
|---|---|---|
| Profilo | intestazione: nome come blocco, riga dell'email come blocco; scheda della famiglia (titolo e 3 righe `row-link` con icona, testo e freccia); scheda Famiglie (titolo, 1 riga `row-link` con testo e ruolo, riga del link «Crea un'altra famiglia»); scheda Account vera | la scheda Account resta usabile durante l'attesa; i conteggi arrivano dopo senza skeleton e senza spostamento (censimento); senza famiglia le due schede spariscono all'arrivo (caso raro) |
| Preferenze | scheda del nome al suo posto: campo (etichetta e campo come blocco), poi la griglia dell'email con etichetta e valore su due righe (`styles.static`, distanza 6 px); Lingua, «Esci» ed «Elimina account» veri | |
| Membri | scheda dei membri (titolo e 3 righe con etichetta del ruolo, e per i membri la riga «Chiedi a …»); per gli amministratori della famiglia, schede «Link d'invito» (titolo, suggerimento e pulsante «Crea un link» veri, il pulsante spento finché arriva la famiglia) e «Ingressi» (titolo vero), ciascuna con una riga a blocchi finché arrivano famiglia e lista; «Lascia la famiglia» come blocco | ruolo dalla famiglia del profilo; tutto nella stessa attesa; le parti vere delle due schede non dipendono dal dettaglio |
| Impostazioni | riga dell'introduzione; scheda del nome (campo); scheda dei commensali (titolo, suggerimento, griglia 7 × 2 di celle da 48 px); scheda delle regole (titolo e 2 righe) | il resto arriva oltre la prima schermata |
| Esclusioni | una scheda con 3 righe (nome, autore, pulsante «Riproponi») | vuota: `StateNotice` |
| Agenti | nella scheda «Agenti collegati» una riga (nome, data, pulsante) al posto di `Loading` | il resto della pagina è statico e vero |
| Amministrazione | mentre il controllo dell'accesso aspetta: scheda Utenti (titolo, campo di ricerca, poi 3 righe) e scheda Inviti (riga del titolo con il pulsante, poi 2 voci), tutte a blocchi; poi le schede vere con le righe a blocchi (punto 7) sotto il campo e sotto l'intestazione finché arrivano le liste | anche durante la verifica dopo un rifiuto; la ricerca tiene già i risultati precedenti |
| Dettaglio utente | titolo come blocco; riga dell'email; scheda dei ruoli (titolo e 2 interruttori); scheda delle famiglie (titolo, 1 riga, nota); blocco della zona rossa | anche mentre il controllo dell'accesso aspetta |
| Eliminazione utente | indietro «Utenti» vero, titolo come blocco; riga dell'email; titolo delle famiglie e una scheda famiglia; scheda «Cosa sparisce» con il pulsante a blocco | |
| Bozza | intestazione con il link indietro vero e il titolo come blocco; etichetta del tipo; descrizione su due righe; riga del tempo; blocco degli ingredienti (titolo e 4 righe); blocco degli attributi | anche mentre il profilo arriva (punto 3) |
| Eliminazione famiglia | una scheda con titolo, testo, due punti, nota e il pulsante a blocco | |
| Eliminazione account | titolo delle famiglie, una scheda famiglia, scheda «Cosa sparisce» con il pulsante a blocco | |
| Invito all'app | titolo come blocco, riga «da …», modulo a blocchi (due campi con etichetta e suggerimento, nota, pulsante); con un account aperto riga e pulsante | marchio e lingue veri |
| Invito alla famiglia | titolo, riga «da …»; senza accesso il modulo a blocchi (due campi, nota, pulsante) e la riga «Hai già un account?»; con accesso il pulsante per entrare | la forma si sceglie da chi è collegato, già noto durante l'attesa |
| Autorizzazione | titolo su due righe, nota, riquadro dell'account, titolo «Cosa può fare» e due righe, come blocchi | il resto oltre la prima schermata; «Leggo i tuoi ruoli…» invariato |
| `/password` | vedi sotto | |
| Ricettario | sezioni dei curatori come nella sezione 3 | |

### `/password`, l'attesa è la verifica del link

- L'attesa è la verifica del codice con Auth, non una lettura di dati. Il caso comune
  all'arrivo è il modulo: titolo, riga dell'account, due campi della password con
  suggerimento, avviso, pulsante. Lo skeleton ha quella forma.
- L'annuncio dice «Verifico il link…» (il testo che c'è oggi, `password.choose.verifying`)
  invece di «Caricamento…»: dice cosa sta succedendo. Nessun testo nuovo.
- Offline la verifica non parte finché torna la rete (comportamento di oggi): lo skeleton
  resta fermo sotto il banner, come le letture in pausa di W20; al ritorno della rete la
  verifica parte da sola. Oggi in quel caso la pagina è vuota. L'area è visivamente in
  attesa (`aria-busy`), ma nessuna verifica è partita: nessuna chiamata ad Auth, il
  frammento resta nell'indirizzo, nessuna operazione è registrata come in corso (quella
  che tiene aperta la pagina all'aggiornamento dell'app). L'annuncio offline è
  «Caricamento…», non «Verifico il link…», perché nulla viene verificato.
- Con un altro account aperto non c'è attesa: si mostra subito la richiesta di uscire,
  come oggi. Link non valido, verifica fallita e password già scelta sostituiscono lo
  skeleton con il loro titolo, come oggi.

### Inviti e autorizzazione

Sono chiamate dirette, non letture salvate: non c'è copia sul telefono e ogni apertura
aspetta. Offline la chiamata fallisce e la pagina mostra l'errore di oggi con «Riprova»
(nessuna pausa); l'autorizzazione offline mostra il suo messaggio senza attesa, come oggi.
Lo skeleton sostituisce il «…» e `Loading`, con la soglia di 200 ms e l'annuncio
«Caricamento…».

## 5. Fuori da questa attività

- Nessun cambiamento a server, contratto o MCP; nessuna libreria nuova.
- Ricerca degli ingredienti, foglio «Crea un link d'invito», invio del voto, «Leggo i tuoi
  ruoli…» nel consenso (sezione 1).
- Il componente `Loading` resta per il foglio «Crea un link d'invito».

## 6. Aggiornamento di `design/design.md`

Nella sezione «Caricamenti (skeleton)», il punto «Dove» diventa: «"Cambia ricetta"
(suggerimenti, ricerca, proposte del pasto libero), Menu, Spesa, Ricetta, Ricettario con le
sezioni dei curatori, avvio dell'app e le pagine rare: profilo, preferenze, membri,
impostazioni, esclusioni, agenti, amministrazione, bozze, eliminazioni, inviti,
autorizzazione e verifica del link in `/password`. Nella ricerca i risultati precedenti
restano finché arrivano i nuovi.» Si aggiunge un punto **Ruoli:** «le sezioni condizionali
(parti di una pagina aperta a tutti che compaiono solo per un ruolo, come le sezioni dei
curatori nel Ricettario e le schede degli amministratori in Membri) hanno blocchi solo
quando il ruolo è noto, così chi non ha il ruolo non vede blocchi che poi spariscono. Le
pagine riservate a un ruolo (bozze, amministrazione) sono un'eccezione: hanno lo skeleton
anche prima, seguito dall'avviso se il ruolo manca. Ruolo noto vuol dire presente nel
profilo corrente, anche ripristinato dalla copia salvata; i controlli di revoca non
cambiano.» Nel punto **Intestazioni vere** si aggiunge che i titoli che vengono dai dati
sono blocchi della stessa attesa. Nel punto **Accessibilità** si precisa: «un solo
annuncio di caricamento per pagina; gli altri annunci (conteggi, conferme, banner
offline) restano».

## 7. Da provare a mano sull'iPhone

- Ricettario da curatore dopo l'uscita e un nuovo accesso: le sezioni Bozze e Archiviate
  hanno i blocchi; i risultati non saltano quando il numero di bozze è quello dello
  skeleton (una scheda senza riepilogo salvato), saltano solo se è diverso.
- Ricettario da non curatore: nessun blocco delle sezioni, mai.
- Profilo, Membri, Impostazioni ed Esclusioni dopo un nuovo accesso: intestazioni ferme,
  la scheda Account del Profilo non salta.
- Link di `/password` aperto da Mail (Safari): blocchi del modulo, poi il modulo senza
  salti; con «Riduci movimento» blocchi fermi; VoiceOver dice «Verifico il link…».
- Un invito alla famiglia aperto senza accesso: blocchi del modulo, poi il modulo.
- VoiceOver: un solo «Caricamento…» anche in Membri da amministratore e in Amministrazione.

## Decisioni da riportare nella specifica

### Prodotto

- Lo skeleton copre anche le pagine rare (profilo, preferenze, membri, impostazioni,
  esclusioni, agenti, amministrazione, dettaglio ed eliminazione di un utente, bozze,
  eliminazioni di famiglia e account, inviti, autorizzazione, verifica del link in
  `/password`) e le sezioni dei curatori del Ricettario (richiesta dell'utente del
  23/10/2026). Sezione 14 e `design/design.md`.
- Le sezioni condizionali (dipendono da un ruolo in una pagina aperta a tutti) hanno
  blocchi solo a ruolo noto; le pagine riservate a un ruolo hanno lo skeleton anche prima,
  seguito dall'avviso se il ruolo manca (approvato dal coordinatore). Ruolo noto: presente
  nel profilo corrente, anche ripristinato; revoca invariata. Sezioni 7, 8 e 14.
- Un solo annuncio di caricamento per pagina; conteggi, conferme e banner offline restano
  con i loro status (decisione del coordinatore). Sezione 14.
- Sezioni dei curatori: skeleton con tante schede di bozze quante nel riepilogo salvato
  (al massimo 3, altrimenti una) e il titolo delle archiviate; se il numero vero è diverso
  i risultati si spostano, solo per i curatori. Supera la decisione di W20 «niente
  skeleton e spostamento ammesso». Sezioni 8 e 14.
- `/password`: lo skeleton del modulo durante la verifica, annunciato con «Verifico il
  link…»; offline fermo sotto il banner con l'annuncio «Caricamento…», senza verifica
  partita (prima pagina vuota). Sezione 7 (W15) e 14.

### Tecniche

- `LoadingScope` raccoglie le attese delle aree interne (`gather`): una sola attesa e un solo
  annuncio per pagina anche con più letture; ogni area mostra il contenuto quando arriva il
  suo. `LoadingScope` accetta il testo dell'annuncio (`label`). Sezioni 1 e 14.
- `FamilyGate` e `AdminAccessGate` mostrano il layout di attesa della pagina; `Loading`
  resta solo per il foglio di creazione del link d'invito. Sezione 14.
