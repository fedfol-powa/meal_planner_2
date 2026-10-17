**Revisione di qualità della PR #59 — DA CORREGGERE**

Branch: `traguardo/specifica-foto-dominio`  
Commit esaminato: `01fbe620bf1b97f0f8211177b432df144effa9f1`  
Confronto: `git diff main...HEAD`, base `e9712a5`. La PR modifica soltanto tre documenti.

Ho confrontato il diff con la specifica delle foto, il codice pertinente, il piano generale nel checkout principale e il registro del coordinamento.

**Rilievi**

1. **Importante — Ordine delle prossime attività attribuito all’utente senza riscontro nelle fonti disponibili.**

   Riferimenti: [piano generale, riga 104](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ad7c40af2a5fb3adf/progetto/superpowers/plans/2026-10-11-piano-generale.md:104), righe 104–107 e 294; [specifica principale, riga 3155](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ad7c40af2a5fb3adf/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:3155), righe 3155–3158 e 3896.

   Il testo presenta come «concordato con l’utente il 17 ottobre» l’ordine: documentazione, correzione di #48 prima della generazione del 21 ottobre, eventualmente #51, parte software di D, poi E.

   Non ho trovato riscontro di questo accordo nel registro, nel piano del checkout principale o negli altri documenti del repository: le occorrenze pertinenti di #48, #51 e della scadenza compaiono soltanto nelle aggiunte della PR. Il registro conferma il completamento del dominio, ma non questa priorità.

   **Perché conta:** la PR introduce una scadenza e un ordine operativo come decisioni approvate, senza una fonte verificabile. Questo non dimostra che l’accordo non sia avvenuto, ma impedisce di convalidarne l’attribuzione.

   **Correzione proposta:** riportare il riferimento alla decisione effettiva e registrarla nel coordinamento; in assenza di riscontro, presentare l’ordine come proposta da confermare, aggiornando anche le due righe dei registri decisionali.

2. **Minore — La PR #57 è erroneamente indicata come rilasciata.**

   Riferimenti: [piano generale, riga 98](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ad7c40af2a5fb3adf/progetto/superpowers/plans/2026-10-11-piano-generale.md:98) e [specifica principale, riga 392](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ad7c40af2a5fb3adf/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:392), righe 392–393. L’associazione ricompare nella specifica alle righe 3180 e 3896.

   La formulazione «PR #56 e #57, rilasciate il 17/10» contraddice il [registro, riga 8](/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/registro.md:8): il rilascio delle 04:23 UTC riguarda il commit `dc288e6` della #56; la #57 è stata unita successivamente come `2e20cbe`, con l’annotazione esplicita «nessun rilascio, tocca solo lo script».

   **Perché conta:** confonde il contenuto della versione di produzione `8d4763ec-b29d-4d09-941b-9411c22fa3f9` con la successiva correzione dello strumento di rilascio.

   **Correzione proposta:** distinguere ovunque «#56 rilasciata il 17 ottobre alle 04:23 UTC» da «#57 unita il 17 ottobre, senza nuovo rilascio».

**Verifiche senza ulteriori rilievi**

- Le decisioni sulle foto risultano recepite: comandi riservati ai curatori nella scheda aperta, assenza di provenienza, conferma dell’agente, modello separato dalle versioni, R2 e rotta pubblica controllata, trasformazione WebP, operazioni web/MCP, `photoUrl`, risposte superate, cache offline e conservazione degli oggetti. La voce sulle foto è chiusa; il trattamento nel ripristino dell’intero catalogo resta esplicitamente da decidere.
- `design/percorsi.md` documenta coerentemente le aggiunte rispetto al prototipo; il piano registra interfacce e completamento delle foto.
- Il dominio attuale è `cosasimangia.app`, con `workers.dev` spento. I riferimenti precedenti sono contestualizzati storicamente.
- Lo stato di D distingue correttamente i passi esterni completati il 17 ottobre dalla parte software ancora da realizzare.
- Il popolamento di 46 ricette con foto e le quattro ancora senza trovano riscontro nel registro.

**Punti per il coordinatore**

Occorre fornire il riscontro dell’accordo indicato nel rilievo 1. Non emergono nuove decisioni di prodotto necessarie per completare questa PR.

**Controlli eseguiti**

- `git diff --check main...HEAD`: superato.
- `npm run typecheck`: superato.
- `npm test` e `npm run build --workspace web`: arrestati durante il caricamento delle configurazioni per `EPERM` su `node_modules/.vite-temp` del checkout principale, fuori dalle directory scrivibili. Test e build non risultano quindi convalidati; il blocco è ambientale.
- Nessun file versionato modificato; nessun commit, push o commento su GitHub. Rapporto non scritto su file.