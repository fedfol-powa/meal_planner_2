# Terza revisione W12 — Foto delle ricette

Revisione mirata di spec e piano al commit `fdaca68`, branch `ondata3/foto-ricette`, sul diff rispetto a `437c3f8`.

**Esito: DA CORREGGERE.** Tre rilievi precedenti sono risolti nel disegno e nelle prove previste. Il limite preventivo ora restituisce correttamente HTTP `413`, ma il formato della risposta prescritto perde il codice applicativo quando viene letto dai client.

## Rilievi

### 1. Importante — La risposta preventiva `413` non rispetta il formato dei trasporti oRPC

**Riferimenti:** [piano, riga 350](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:350), [test previsti, riga 354](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:354), [spec, riga 334](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:334).

Il piano prescrive questa risposta, costruita prima degli handler:

```ts
Response.json({
  code: 'invalid',
  status: 413,
  data: { issues: [{ path: ['file'], code: 'photo_too_large' }] }
}, { status: 413 })
```

Il rifiuto fuori dagli interceptor risolve il precedente `400`, ma **questo JSON non è un errore oRPC correttamente serializzato**. Nella versione installata, RPC richiede l’involucro `json`; inoltre il riconoscimento dell’errore richiede i campi `defined` e `message`, assenti anche nella risposta OpenAPI proposta.

Ho riprodotto il percorso attraverso una copia temporanea di `createApp`, inserendo la lettura preventiva descritta dal piano, con handler e client reali:

| Risposta preventiva | RPCLink | OpenAPILink | Client web dell’app |
|---|---|---|---|
| Formato prescritto | `PAYLOAD_TOO_LARGE`, senza issue applicativa | `PAYLOAD_TOO_LARGE`, senza issue applicativa | `unknown` |
| Formato corretto per il trasporto | `invalid`, `photo_too_large` | `invalid`, `photo_too_large` | `invalid`, `photo_too_large` |

HTTP resta `413` in entrambi i casi. La conversione a `unknown` è stata verificata anche usando il vero `createRpcClient`: [web/src/api/rpc.ts, riga 23](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/web/src/api/rpc.ts:23).

**Perché conta:** l’app non può mostrare «La foto è troppo grande» come previsto dalla spec. I test del compito 6 controllano il JSON HTTP direttamente e resterebbero verdi con questa incompatibilità; i client reali sono previsti soltanto per il caricamento riuscito da 9 MiB.

**Correzione proposta:** mantenere il limite prima del parser, ma specificare una serializzazione dell’errore conforme a ciascun trasporto. Aggiungere prove di rifiuto attraverso i client RPC e OpenAPI collegati a `createApp`, verificando `status: 413`, `code: 'invalid'` e l’issue `photo_too_large`; per il web verificare che non diventi `unknown`. Coprire sia il limite dichiarato sia quello rilevato durante la lettura. Queste prove devono fallire ripristinando il JSON attualmente prescritto.

## Esito dei quattro rilievi precedenti

| Rilievo | Esito |
|---|---|
| **1. Slash finale** | **Risolto.** Il criterio aggiornato copre i quattro percorsi e tutti i multipart sotto `/api/`. Nella riproduzione i quattro percorsi restituiscono `413`; ripristinando il riconoscimento esatto, quelli con slash finale sfuggono al limite. |
| **2. Propagazione del `413`** | **Parzialmente risolto.** La lettura preventiva evita gli interceptor e produce `413`. Resta il difetto di serializzazione sopra. Ripristinando il vecchio `TransformStream`, entrambi i trasporti tornano a `400 invalid` con `issues: []`. |
| **3. Collegamento alle mutazioni delle foto** | **Risolto nel piano.** Il [compito 8, riga 452](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:452) usa entrambi gli hook reali, senza incremento manuale, attende la rilettura e poi libera la risposta vecchia. Richiede esplicitamente di verificare il fallimento togliendo l’incremento da ciascun `onSuccess` oppure il controllo da `runMealMutation`. |
| **4. Eliminazione differita** | **Risolto.** La [spec, riga 79](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:79) motiva la tabella con storico, attribuzione, idempotenza e foto corrente; conferma la conservazione illimitata. |

Non emergono ulteriori contraddizioni sostanziali nel diff esaminato. Le scelte già verificate non sono state riaperte.

## Verifiche e limiti

- Letti brief, seconda revisione, istruzioni del coordinatore, documenti interessati e riferimenti pertinenti della specifica principale e del piano generale nel checkout principale.
- Consultata la documentazione oRPC tramite Context7 e verificato il comportamento della versione installata `1.15.5`.
- Riproduzioni in `/private/tmp`, con copie temporanee di `createApp`, operazione minima di prova e handler reali, senza simulare `handler.handle`.
- Corpi da 12 MiB senza `Content-Length`: rifiuto sui quattro percorsi, flusso annullato a `UPLOAD_BODY_LIMIT + 64 KiB`. Con lunghezza dichiarata di 20 MiB: `413` senza letture sui quattro percorsi, usando una sorgente senza prelettura.
- Multipart da 9 MiB accettati su RPC e OpenAPI nella riproduzione; verificata la perdita dell’issue sui caricamenti oltre soglia e il suo recupero correggendo la serializzazione.
- Nessun collaudo della funzionalità foto completa: l’implementazione, gli hook e i relativi test non esistono ancora.
- `git diff --check 437c3f8 fdaca68` senza errori; worktree pulito. Nessun file tracciato modificato e nessun rapporto scritto su file.

## Punti per il coordinatore

Non servono nuove decisioni di prodotto. Occorre completare la correzione tecnica del formato dell’errore e aggiungere le prove attraverso i client.

**Verdetto finale: DA CORREGGERE.**