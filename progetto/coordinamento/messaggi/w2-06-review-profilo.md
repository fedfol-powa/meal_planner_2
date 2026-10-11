# W2 profilo — rilievi della review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w2-profilo-spec-piano.md`.
Verdetto «da rifare». Leggilo tutto e correggi spec e piano.

## Decisioni del coordinatore

**Rilievo 1 — famiglia mostrata.** Niente colonna su `profiles`: tabella separata
`app.profile_preferences(user_id pk → profiles, current_family_id)` con RLS solo per il
proprietario. Test pgTAP con Anna in due famiglie e Bruno in una: Bruno non legge la
selezione di Anna.

**Rilievo 2 — mutazioni.** Adotta il modello di W5 (`web/src/api/ratings.ts`):
cancellazione delle letture interessate prima di applicare la risposta, verifica di
sessione e lingua, ordine delle risposte. Test con promesse controllate come propone il
revisore.

**Rilievo 3 — invalidazioni.** Tabella esplicita operazione → viste nella spec, con le
chiavi `[area, operazione, input]` delle altre aree: `avoid` → spesa della famiglia;
libri posseduti → ricerca e dettaglio del ricettario; fuso → `profile.get` e menu; nome
della persona → tutte le query (gesto raro, si invalida tutto). Test che popolano prima
le cache interessate.

**Rilievo 4 — da `me` a `profile`.** Lo fai tu nella tua PR, sopra la seconda PR di W5
(client oRPC reale), che si unisce prima delle tue parti web: `wrapApi`, tipi e client
finto, chiavi della sessione, invalidazione di `['me']` dopo `forbidden`, con test di
chiamate reali a `profile` e `family` attraverso `SessionScope` (rinnovo e revoca). Se
quando arrivi a quel task la PR di W5 non è unita, fermati e dimmelo.

**Rilievo 5 — implementatore.** Niente `server/src/os.ts`: l'implementatore si costruisce
in un solo punto, `server/src/router.ts` (dove W1 aggiunge `{ prepare }`), e ogni area
esporta un factory che riceve `os`, come fa W6 (`type Implementer` esportato da
`server/src/pipeline.ts`, lo aggiunge chi arriva prima). Le tue aree non costruiscono
implementatori propri.

**Rilievo 6** riguarda W1 e W6: lo chiudo io con loro, non toccarlo.

**Rilievo 8 — impostazioni malformate.** Confermata la lettura tollerante; la scrittura
normalizza a oggetto ogni genitore lungo il percorso, conservando le altre chiavi valide,
nella stessa scrittura atomica. Test come propone il revisore.

## Rilievi tecnici: correggi come propone il revisore

7 (errori `not_found` dichiarati e verificati via RPC/REST; `setBookOwned({owned:false})`
coerente con la spec), 9 (nomi senza prefisso, famiglia davvero estranea come Verdi,
dominio eseguito nel workspace, `TEST_DATABASE_URL` impostato e suite eseguite davvero,
scrittura MCP riuscita con rilettura), 10 (`domain/package.json` solo con l'aggiunta di
`./family`, allineato a `main`; vale per ogni file condiviso).

Quando hai finito: commit, `STATO: SPEC_E_PIANO_CORRETTI`, e aspetta.
