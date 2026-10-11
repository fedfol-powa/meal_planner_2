# Revisione W4 «Unità e spesa»: spec e piano

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione del branch `fondamenta/unita-spesa`, commit `6583a721a7f8a868ca0c75d00ca4d0e7b8624147`.

La struttura dei moduli e la separazione fra calcolo e presentazione sono coerenti con l’attività. Prima dell’implementazione vanno corretti due problemi sostanziali: la perdita delle traduzioni della quantità spuntata e la selezione ambigua delle equivalenze. Restano inoltre due incoerenze fra spec e piano.

## Rilievi

### 1. Importante — La quantità precedente perde la traduzione quando cambiano le righe

**Riferimenti:** [spec W4:105](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/specs/2026-10-11-unita-spesa.md:105), [piano:1003](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:1003), [piano:1750](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:1750).

**Problema.** `quantity_at_check` conserva soltanto le chiavi italiane dei testi non numerici. Per presentare anche la quantità precedente, `toView` usa le traduzioni delle righe **attuali**. Se una modifica sostituisce il testo precedente, la sua traduzione non è più disponibile e `formatCombined` ripiega sull’italiano.

**Caso verificato eseguendo i frammenti del piano:**

- quantità spuntata: `1 mazzetto abbondante` / `1 large bunch`;
- quantità aggiornata: `2 mazzetti abbondanti` / `2 large bunches`;
- lingua: `en-GB`;
- risultato: `quantity: "2 large bunches"`, `previousQuantity: "1 mazzetto abbondante"`.

**Perché conta.** È un percorso ordinario di modifica della ricetta o del menu. Contraddice la localizzazione delle quantità non numeriche e dei contenuti della lista richiesta dalla [specifica principale:1578](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:1578). Il test del piano a riga 891 accetta il ripiego italiano, ma non risolve il requisito.

**Correzione proposta.** Rendere la spunta autosufficiente per la presentazione storica, conservando anche i testi bilingui del momento della spunta, oppure un riferimento immutabile che permetta di recuperarli. Mantenere distinta l’identità usata da `exceeds` dalle traduzioni. Concordare la forma con W2 e aggiungere un test di sostituzione del testo seguito da visualizzazione in entrambe le lingue.

### 2. Importante — Equivalenze concorrenti producono quantità diverse secondo l’ordine dell’array

**Riferimenti:** [piano:412](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:412), [piano:442](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:442), [spec W2:161](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:161).

**Problema.** `toPurchaseUnit` applica la prima equivalenza compatibile, anche quando `fromUnit` è un’altra unità della stessa dimensione. Non verifica se esistano altre equivalenze applicabili. Lo schema W2 ammette questa situazione: l’unicità riguarda `(ingredient_id, from_unit, to_unit, scope)`.

**Caso verificato con fattori sintetici, senza attribuirli a ingredienti reali:**

- equivalenza A: `g → piece`, fattore `0.01`;
- equivalenza B: `kg → piece`, fattore `20`;
- ingresso: `100 g` dello stesso ingrediente;
- ordine `[A, B]`: **1 pezzo**;
- ordine `[B, A]`: **2 pezzi**.

Entrambe le righe rispettano i vincoli descritti nei documenti.

**Perché conta.** La quantità della spesa dipenderebbe dall’ordine con cui il chiamante riceve o carica le equivalenze. Il problema può influire anche sulle spunte, perché cambia la quantità canonica confrontata.

**Correzione proposta.** Definire un’invariante condivisa con W2: per ogni ingrediente e dimensione di partenza deve esserci una conversione di acquisto univoca, oppure equivalenze multiple devono essere verificate come coerenti. Rifiutare esplicitamente le configurazioni ambigue. Aggiungere test con ordine invertito e con unità di partenza diverse ma appartenenti alla stessa dimensione; ordinare semplicemente l’array non risolve l’ambiguità.

### 3. Minore — Spec e piano scelgono le soglie su valori diversi

**Riferimenti:** [spec W4:143](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/specs/2026-10-11-unita-spesa.md:143), [piano:35](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:35), [piano:748](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:748).

**Problema.** La spec prescrive: «La soglia si sceglie sul valore non arrotondato». Il piano richiede invece esplicitamente la promozione dopo l’arrotondamento, confermata dal codice e dai test:

| Ingresso | Regola della spec | Risultato del piano |
|---|---|---|
| 996 g | sotto la soglia dei kg | 1 kg |
| 15,8 oz | sotto la soglia delle lb | 1 lb |
| 19,8 fl oz | sotto la soglia della pinta | 1 pinta |

**Perché conta.** Un’implementazione fedele alla spec fallirebbe i test prescritti dal piano. Le due regole non possono essere entrambe il criterio di accettazione.

**Correzione proposta.** Confermare la regola desiderata e allineare spec, esempi, commenti e test. Se si mantiene la promozione dopo l’arrotondamento, distinguere esplicitamente la scelta della precisione dalla successiva normalizzazione dell’unità visualizzata. Coprire i valori immediatamente sotto, sulla e sopra ogni soglia.

### 4. Minore — L’interfaccia di esportazione dichiarata non coincide con quella implementata

**Riferimenti:** [spec W4:214](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/specs/2026-10-11-unita-spesa.md:214), [piano:1819](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:1819).

**Problema.** La spec espone:

```ts
shoppingExportText(arranged, { locale, manualItems })
```

Il piano implementa e testa:

```ts
shoppingExport(list, manualItems?)
```

La lingua viene ricavata da `list.locale`.

**Perché conta.** Un consumatore sviluppato seguendo la spec userebbe nome e argomenti inesistenti. Inoltre la spec sembra permettere una lingua diversa da quella con cui sono già state presentate le voci.

**Correzione proposta.** Adottare una sola firma. Quella del piano è coerente con una lista già localizzata: aggiornare la spec e precisare che, per cambiare lingua, si ripete prima `arrangeShoppingList`.

## Punti da decidere dal coordinatore o dall’utente

1. **Snapshot bilingue delle spunte.** Concordare con W2 la correzione del rilievo 1 prima di consolidare il contratto di `quantity_at_check`.

2. **Molteplicità delle equivalenze.** Decidere con W2 come impedire o gestire equivalenze concorrenti, secondo il rilievo 2.

3. **Presentazione delle misure.** Confermare la regola delle soglie. Nella review già prevista della presentazione imperiale includere il caso `30 ml + 1 tbsp`, che il piano mostra come `2 tbsp + 1 tbsp`: le quantità restano correttamente separate nel calcolo, ma le etichette non distinguono il cucchiaio di misura dal cucchiaio domestico.

4. **Quantità da conservare nella spunta offline.** `ShoppingItemView` espone soltanto la quantità formattata ([piano:1721](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/plans/2026-10-11-unita-spesa.md:1721)), mentre il prototipo conserva anche `combined`. La quantità canonica resta disponibile nel risultato del consolidamento, quindi non è un blocco del modulo; va però concordato con il contratto dell’ondata 2 come il client conservi la quantità vista e spuntata, senza ricostruirla dal testo o sostituirla con un ricalcolo successivo.

## Verifiche e limiti

- Esaminati spec e piano W4, brief, sezioni pertinenti della specifica principale, percorso Spesa, implementazione e test del prototipo.
- Consultati anche il piano generale aggiornato nel checkout principale e i documenti W2/W3 nei rispettivi worktree. La copia locale del piano generale ha ancora «Interfacce decise» vuoto; quella del coordinatore registra gli accordi richiamati da W4.
- Eseguite prove **in memoria** sulle funzioni pure estratte dal piano: traduzione della quantità precedente, ordine delle equivalenze, soglie e presentazione di volumi insieme a cucchiai. Import e dichiarazioni degli schemi Zod sono stati esclusi da queste prove.
- Non eseguite suite completa, build o verifica dei tipi: questa è una revisione di spec e piano; i moduli W4 non sono ancora implementati. Le prove mirate non certificano gli schemi Zod né l’integrazione.
- Nessun file modificato, nessun commit o accesso remoto in scrittura. Worktree verificato pulito al termine.