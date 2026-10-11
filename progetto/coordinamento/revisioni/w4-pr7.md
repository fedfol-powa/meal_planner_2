# Revisione PR #7 — Dominio unità e spesa

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione del commit `f0be2fa0bc38e99b0fc0f3d527b3cb727813e882`, mediante `git diff origin/main...HEAD`, con `origin/main` a `94e60ee6c9622ba77c69335d9c60a35d31bba4ea`.

La separazione fra quantità canoniche, conversioni e presentazione è coerente con le interfacce concordate. Test e typecheck passano. Restano un controllo incompleto delle equivalenze ambigue e due difetti circoscritti di arrotondamento e validazione.

## Rilievi

### 1. Importante — Il percorso delle equivalenze di ricetta può ancora scegliere in base all’ordine

**Riferimento:** [domain/src/units/equivalence.ts:67](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr7/domain/src/units/equivalence.ts:67).

`findEquivalence` seleziona con `find` senza chiamare `assertUnambiguousEquivalences`. Il controllo viene eseguito da `toPurchaseUnit` e dal consolidamento, ma manca nel percorso documentato per gestione e import: `findEquivalence` seguito da `applyRecipeEquivalence`.

**Riproduzione eseguita sul codice:** due equivalenze, entrambe individualmente valide secondo `unitEquivalenceSchema`, per lo stesso ingrediente, ambito `recipe`, preparazione `null` e conversione `us_cup → g`, con fattori sintetici 100 e 200.

| Ordine | Conversione di 1 `us_cup` |
|---|---|
| `[A, B]` | 100 g |
| `[B, A]` | 200 g |

Non viene lanciato alcun errore.

**Perché conta:** il contratto concordato richiede il rifiuto delle configurazioni ambigue nel dominio. Il vincolo presente nel database protegge le righe persistite, ma non gli array preparati dall’import prima della persistenza. La conversione selezionata può diventare parte della versione pubblicata.

**Correzione proposta:** verificare l’univocità dentro `findEquivalence`, oppure offrire un percorso pubblico di selezione e applicazione che la garantisca. Aggiungere test con ordine invertito per l’ambito `recipe`, sia senza preparazione sia con la stessa preparazione specifica.

### 2. Minore — L’arrotondamento imperiale dipende dalla scomposizione della quantità

**Riferimento:** [domain/src/units/present.ts:40](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr7/domain/src/units/present.ts:40).

La conversione in grammi e il ritorno in once possono spostare un valore esattamente intermedio appena sotto la soglia di `Math.round`. La tolleranza usata per i conteggi non viene applicata a questo arrotondamento.

**Risultati riprodotti:**

| Quantità matematicamente equivalente | Presentazione `en-GB`, imperiale |
|---|---|
| Una quantità di 14,5 oz | `14 oz` |
| Somma di 14 oz e 0,5 oz | `15 oz` |
| Somma di 7,25 oz e 7,25 oz | `14 oz` |

Nel primo caso il valore ricalcolato è `14.499999999999998`.

**Perché conta:** quantità equivalenti possono differire di un’oncia nella ricetta o nella lista, pur essendo corrette le costanti di conversione. I test sulle soglie presenti nella PR non intercettano questo caso.

**Correzione proposta:** rendere stabile l’arrotondamento ai punti intermedi rispetto al rumore numerico, senza arrotondare i valori canonici. Aggiungere una regressione che confronti quantità singola e somme equivalenti, verificando anche valori realmente sotto e sopra la soglia.

### 3. Minore — Lo schema della spunta accetta chiavi testuali incoerenti

**Riferimenti:** [domain/src/units/combined.ts:18](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr7/domain/src/units/combined.ts:18), [confronto in `exceeds`:50](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr7/domain/src/units/combined.ts:50).

`combinedQuantitySchema` controlla che `texts[].key` sia non vuota, ma non che corrisponda a `textKey(text['it-IT'])`; accetta inoltre chiavi duplicate.

**Riproduzione:** lo schema accetta una spunta contenente:

```json
{
  "key": "2 mazzetti",
  "text": {
    "it-IT": "1 mazzetto",
    "en-GB": "1 bunch"
  }
}
```

Confrontandola con una quantità attuale correttamente costruita per «2 mazzetti», `exceeds` restituisce `false`: la voce resta spuntata.

**Perché conta:** il database delega al server, tramite questo schema, la validazione di `quantity_at_check`. Lo schema esportato ammette quindi dati che contraddicono la forma canonica e alterano il confronto. Il problema riguarda gli ingressi esterni: `addQuantity` produce correttamente le chiavi.

**Correzione proposta:** verificare la corrispondenza fra chiave e testo italiano e l’unicità delle chiavi. Aggiungere test per chiavi incoerenti, non normalizzate e duplicate, conservando invariati i testi bilingui della spunta.

## Verifica dei rilievi precedenti

| Rilievo della review di spec e piano | Esito |
|---|---|
| Perdita della traduzione della quantità precedente | **Risolto.** La spunta conserva entrambi i testi; il test di sostituzione verifica italiano e inglese. |
| Equivalenze concorrenti dipendenti dall’ordine | **Risolto nella spesa, incompleto nel percorso ricetta/import:** rilievo 1. |
| Divergenza sulle soglie di presentazione | **Allineata** per le promozioni concordate: 996 g → 1 kg, 15,8 oz → 1 lb, 19,8 fl oz → 1 pinta. Resta il difetto numerico del rilievo 2. |
| Firma dell’esportazione divergente | **Risolto.** Spec e codice usano `shoppingExport(list, manualItems?)`, con lingua da `list.locale`. |

Risolti anche i due punti collegati: cucchiai dello stesso tipo sommati nella sola presentazione imperiale e quantità canonica `combined` esposta nella vista per la spunta offline.

## Conversioni e compatibilità

- I fattori britannici sono corretti: oncia 28,349523125 g, libbra 453,59237 g, oncia fluida 28,4130625 ml e pinta 568,26125 ml, coerenti con lo Schedule 1 del [Weights and Measures Act 1985](https://www.legislation.gov.uk/ukpga/1985/72/pdfs/ukpga_19850072_en.pdf). Il valore della tazza USA è compatibile con la tabella [NIST SP 811](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication811e2008.pdf).
- Non ho rilevato conversioni implicite massa/volume. Cucchiai domestici e volumi restano separati nel calcolo canonico.
- Ambito e preparazione selezionano correttamente le equivalenze non ambigue: specifica prima della generica, preparazioni diverse escluse.
- Scalatura e consolidamento precedono gli arrotondamenti; verificato anche che tre contributi da un terzo producano un solo pezzo da acquistare.
- Consolidamento per ingrediente e varietà, esclusioni, opzionali, pezzi interi e tolleranza 0,1 rispettano le decisioni registrate.
- Codici delle unità, reparti, dimensioni delle equivalenze e struttura delle spunte sono compatibili con le migrazioni su `origin/main`.
- La fonte dell’equivalenza rimane obbligatoria nel dominio: assente, `null`, vuota o composta da spazi viene rifiutata. La colonna SQL ancora nullable è il disallineamento già dichiarato dall’utente, non una correzione richiesta a questa PR.
- Etichette, quantità testuali, quantità precedenti ed esportazioni sono disponibili in entrambe le lingue.

## Punti per il coordinatore o l’utente

Nessuna nuova decisione di prodotto è necessaria per correggere i rilievi.

Restano le attività già concordate: allineamento del database sull’obbligatorietà della fonte, presentazione all’utente delle regole imperiali e trasferimento delle decisioni W4 nella specifica principale dopo il merge.

## Verifiche eseguite e limiti

| Comando | Esito |
|---|---|
| `npm test` | **PASS:** 182 test, di cui 168 nel dominio |
| `npm run typecheck` | **PASS:** radice, dominio, contratto e server |
| `npm run build --workspaces --if-present` | **PASS**, ma l’unica build presente genera il segnaposto HTML di `web`; non verifica un’app completa |
| `git diff --check origin/main...HEAD` | **PASS** |

Eseguite inoltre prove dirette in memoria per i tre rilievi e per scalatura, conservazione dell’originale, separazione delle dimensioni, fonte obbligatoria ed equivalenza delle quantità canoniche.

Non eseguiti test SQL, deploy o prove dei futuri consumatori web/MCP: la PR introduce moduli puri e non modifica le migrazioni.

Nessun sorgente o documento modificato, nessun commit o commento su GitHub. La build ha generato il proprio artefatto ignorato da Git; `git status --short` è pulito.