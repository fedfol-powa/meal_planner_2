# Revisione PR #73 — Documentazione W19

**Verdetto: APPROVABILE CON CORREZIONI**

Revisionato il diff di `docs/specifica-w19`, HEAD `9257258`, contro `origin/main` (`160d83b`, merge della PR #72). Il diff modifica soltanto la specifica principale e `design/percorsi.md`.

## Rilievi

1. **Minore — La descrizione offline omette l’eccezione della settimana già salvata.**

   **File:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, righe 4172–4174.

   **Problema:** «senza date salvate rimbalza» è formulato come comportamento incondizionato. In realtà, se la settimana di destinazione è nella copia salvata, lo swipe naviga anche senza le date del mese. Lo conferma `web/src/routes/MenuPage.tsx`, righe 149–153: il rifiuto richiede contemporaneamente l’assenza della settimana salvata e delle date pertinenti. Il piano W19 esplicita questa eccezione nella sezione «Offline».

   **Perché conta:** la frase contraddice sia il codice unito sia la regola descritta poche righe prima, secondo cui basta la copia salvata della settimana.

   **Correzione proposta:** sostituire il passaggio con:

   > Offline, se le date salvate indicano che la settimana esiste ma la settimana non è salvata, il Menu resta su «Caricamento…»; una settimana già salvata si raggiunge anche senza le date del mese. Se mancano entrambe, la fila rimbalza.

## Verifiche documentali

- Le decisioni di prodotto sono riportate correttamente: gesto sulla fila dei giorni, direzioni, stesso giorno della settimana, traccia dei pasti invariata, rimbalzo senza messaggi, giorno senza pasti aperto vuoto e calendario come alternativa accessibile.
- Soglia di 48 px, rapporto 2:1, annullamento con un secondo dito, protezione del clic sintetico, navigazione nella cronologia e parametri delle animazioni corrispondono ai tre file di codice indicati, identici a quelli su `origin/main`.
- Sono documentati lettura anticipata dei mesi, limite delle settimane senza slot, rispetto di `prefers-reduced-motion` e assenza di nuove librerie e operazioni.
- Lo stato indica correttamente **PR #72 unita e rilascio in preparazione**, coerentemente con il registro del coordinamento. Il collaudo sull’iPhone resta esplicitamente da fare.
- La collocazione dei dettagli nella sezione 14 è coerente con il suo contenuto; la sezione 15 raccoglie invece decisioni ancora aperte.
- Non emergono altri duplicati problematici o contraddizioni introdotte dal diff. I riepiloghi nello stato e nel registro delle revisioni seguono la struttura esistente. Lingua e stile sono coerenti; `design/percorsi.md` distingue esplicitamente l’aggiunta nell’app dal prototipo storico.

## Controlli eseguiti

| Controllo | Esito |
|---|---|
| `git diff --check origin/main...HEAD` | Superato |
| `npm run typecheck -w web` | Superato |
| Test mirati `weekSwipe.test.ts` e `MenuPage.test.tsx` | Non avviati: errore `EPERM` nella creazione della configurazione temporanea Vite nel `node_modules` del checkout principale |
| Build web con URL Auth locale e destinazione in `/private/tmp` | Bloccata dallo stesso errore `EPERM`, dopo il controllo TypeScript |

La build è stata tentata con gli script automatici disabilitati per evitare la sincronizzazione degli asset nel worktree. Nessun file versionato è stato modificato; nessun accesso alla produzione.

## Punti da decidere

Nessuna nuova decisione di prodotto o tecnica. Il rilievo richiede soltanto di rendere il testo coerente con il comportamento già deciso e implementato.