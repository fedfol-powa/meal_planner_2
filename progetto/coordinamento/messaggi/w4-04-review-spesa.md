# W4 spesa — rilievi della review di spec e piano

Rapporto completo: `progetto/coordinamento/revisioni/w4-spesa-spec-piano.md` (nel
checkout principale, `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/`).
Verdetto «da rifare». Leggilo tutto e correggi spec e piano.

## Rilievi tecnici: correggi come propone il revisore

- **2** — ogni risposta confermata diventa la nuova base nella cache, con sopra le
  operazioni ancora pendenti e protezione dalle risposte superate; aggiorna il test che
  pretende una sola `applyView`.
- **3** — stato di invio persistito prima della richiesta (`pending` / `sent`);
  compattazione solo fra operazioni mai inviate; se l'aggiunta può essere stata
  applicata, la rimozione resta; scarto esplicito delle operazioni dipendenti
  (`setFreeItemChecked` di una voce aggiunta e rimossa prima dell'invio). Test con
  risposta persa, riapertura, modifica durante l'invio.
- **5** — lo strato pendente confronta `combined` con `quantityAtCheck` usando `exceeds`
  del dominio; se la quantità è cresciuta la voce torna da spuntare con la quantità
  precedente e il segno di sincronizzazione. Test su aumento, diminuzione, testi,
  lingua e sistema di misura.
- **9** — `removeFreeItem` con `WHERE id = itemId AND shopping_list_id = resolvedListId`,
  senza errore se non trova righe; test con un'altra settimana della stessa famiglia e
  un'altra famiglia dell'utente.
- **10** — gli slot con ricetta mai pubblicata entrano negli avvisi con nome e
  descrizione (mai le bozze); i pasti liberi no. Test per entrambi.
- **11** — piano TDD eseguibile: contratto d'area testato da solo e registrato nel
  contratto globale solo con il router completo, oppure incrementi verticali; niente
  cast per far passare il typecheck. Estendi i test ai controesempi dei rilievi.
- **12** — allinea la spec: storage con `transact`, escape `<` nel JSON-LD, e
  decidi GET soltanto (togli HEAD) per la pagina pubblica.

## Decisioni del coordinatore sui punti aperti

**Rilievo 1 — agganci di sessione di W5.** Li implementa W5 nella sua seconda PR (client
oRPC reale), che arriva prima del tuo task 10. Scrivi nella tua spec una sezione
«Interfaccia richiesta a W5» con le firme TypeScript esatte, che io passo a W5. Deve
coprire almeno:
- rinnovo esplicito e unico per sessione con esito distinto:
  `{kind:'ok', userId} | {kind:'rejected'} | {kind:'network'}`;
- invio protetto: una chiamata su sessione chiusa (o di una generazione superata) viene
  rifiutata, non eseguita;
- agganci asincroni alla chiusura, attesi da `close()`, con cui la coda cancella i suoi
  dati; `purgeOtherCopies()` che pulisce anche `shopping-queue:` (prefissi registrabili),
  compreso l'avvio con utente B e una coda di A rimasta sul disco;
- alla revoca di una famiglia, aggancio con cui la coda scarta le voci di quella famiglia;
- messaggi fra schede estensibili per tipo (il ricevitore di W5 oggi tratta ogni tipo
  diverso da `revoked` come uscita), con un tipo per «coda della spesa cambiata»;
- la deroga alla sola consultazione per la sola Spesa la scrive W5 nella sua spec.
I test d'integrazione del task 10 usano i componenti reali di W5, non un `verifiedUser`
simulato.

**Rilievo 6 — idempotenza.** Il client manda **sempre** la quantità esplicita
(`quantityAtCheck` della voce mostrata al momento del gesto) in `setItemChecked`, così
una ripetizione salva lo stesso contenuto; il server non la ricava più a ogni chiamata.
Caso della voce libera cancellata da un altro membro e ricreata dalla ripetizione
dell'aggiunta con lo stesso UUID: **accettato e documentato** (finestra minima, danno
lieve, la voce si elimina di nuovo). Niente tombstone, ricevute o migrazioni per questo.

**Rilievo 4 — Web Locks.** Esclusione fra schede con Web Locks (supportato da Safari
15.4+, Chrome, Firefox): lock `shopping-queue:<userId>`, rilettura della coda dopo
l'acquisizione, controllo della sessione prima di ogni invio, messaggio alle altre
schede dopo ogni conferma con la vista confermata da applicare alla loro cache. Senza
Web Locks: limitazione dichiarata, invio senza esclusione (le operazioni sono a stato
assoluto e con quantità esplicita, quindi un doppio invio non cambia il risultato);
niente protocollo alternativo. Test con due schede, chiusura del titolare,
sospensione e ripresa.

**Rilievi 7 e 8 — Bring!.** Bring! è disabilitato finché la lista ha operazioni pendenti
o scartate da risolvere, con un testo che lo spiega; il tocco avvia anche la
sincronizzazione. Apertura in due passi compatibile con Safari iOS: il primo tocco
chiama `createBringLink`, poi compare un collegamento «Apri in Bring!» (`<a
target="_blank" rel="noopener">`) che l'utente tocca; niente `window.open` dopo
l'attesa. Errore della creazione mostrato con possibilità di riprovare.

**R1:** il nome è `version: number | null` come nella spec di W1; correggo io il piano
generale.

Quando hai finito: commit, `STATO: SPEC_E_PIANO_CORRETTI`, e aspetta. Dopo le correzioni
farò una seconda review breve sui rilievi 1–4.
