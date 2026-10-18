# Revisione PR #76

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione del commit `c04aaa5` del branch `docs/specifica-w19-w21-w20`, confrontato con `origin/main` a `bb523a2`. Il diff comprende esclusivamente i tre documenti previsti.

## Rilievi

1. **Minore — Descrizione inesatta delle attese nelle pagine rare**

   **File:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:4244`.

   Il testo afferma che le pagine rare, inclusa `/password`, «restano con “Caricamento…”». Il codice unito non presenta un comportamento uniforme: `web/src/features/password/ChoosePasswordPage.tsx:164` mostra «Verifica del link…» durante la verifica online e nulla offline (`web/src/i18n/messages/password.ts:50`).

   La formulazione introduce nella specifica principale un requisito diverso dal codice e dalla spec di dettaglio W20, che lascia queste pagine invariate, con `Loading`, nulla o messaggi propri.

   **Correzione proposta:** sostituire «restano con “Caricamento…”» con «restano invariate, con i rispettivi stati di attesa».

## Verifiche documentali

- **W19:** data, ora, versione e commit del rilascio corrispondono alle informazioni fornite. Rimbalzo, transizione e vecchie soglie non sono più descritti come comportamento attuale; restano nel registro storico, seguito dall’aggiornamento W21.
- **W21:** stato di rilascio e collaudo sull’iPhone ancora da fare corretti. Descrizione coerente con `DaySelector.tsx`, `MenuPage.tsx` e `weekSwipe.ts`: trascinamento, settimane adiacenti, soglie, resistenza, durate, movimento ridotto, protezione dei clic e letture anticipate non osservate.
- **W20:** correttamente indicata come unita con merge `bb523a2`, con rilascio in preparazione. Soglia, pulsazione, pausa offline, accessibilità, attese locali, coda della Spesa e risultati precedenti della ricerca corrispondono al codice e alle decisioni dei messaggi di revisione.
- `design/percorsi.md` recepisce W21; `design/design.md` distingue correttamente pulsazione decorativa e movimento della fila dei giorni.
- Nessun altro rilievo su duplicazioni, contraddizioni, lingua o stile nelle modifiche esaminate.

## Controlli eseguiti

- **Test web:** 108 file superati, 3 saltati; 1.074 test superati, 11 saltati.
- **Typecheck web:** superato.
- **`git diff --check`:** superato.
- **Build web:** tentata con configurazione locale e destinazione in `/tmp`; non completata perché manca `web/public/assets/fonts`, generato dal prebuild. Non eseguito il prebuild per mantenere il worktree in sola lettura.
- Per test e build usato `--configLoader runner` dopo il blocco della sandbox sulla cache temporanea di Vite nel checkout principale.

Nessun file del worktree modificato; nessun accesso alla produzione.

## Punti da decidere

Nessuna nuova decisione richiesta. Restano i collaudi sull’iPhone già indicati nei documenti, distinti dal completamento della revisione documentale.