# W12: terza revisione di spec e piano, un solo rilievo

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w12-spec-piano-3.md`.
Tre dei quattro rilievi precedenti sono risolti. Resta il formato della risposta
preventiva `413`: il JSON prescritto non è un errore oRPC serializzato per il trasporto.
Con quel formato RPCLink e OpenAPILink lo leggono come `PAYLOAD_TOO_LARGE`, il client web
come `unknown`, e l'app non mostra «La foto è troppo grande».

Correggi come propone il revisore:

- Tieni il limite prima del parser e specifica una serializzazione conforme a ciascun
  trasporto: involucro `json` per RPC, campi `defined` e `message`. Meglio ancora se la
  ricavi dagli stessi serializzatori di oRPC invece di scriverla a mano. Verifica con
  Context7.
- Aggiungi prove di rifiuto attraverso i client RPC e OpenAPI collegati a `createApp`:
  `status: 413`, `code: 'invalid'`, issue `photo_too_large`.
- Per il web, prova che l'errore non diventi `unknown`.
- Copri sia il limite dichiarato sia quello rilevato durante la lettura. Le prove devono
  fallire con il JSON di oggi.

Poi committa e scrivi `STATO: SPEC_E_PIANO_CORRETTI`. Questa correzione la verifica il
coordinatore, senza un nuovo revisore.
