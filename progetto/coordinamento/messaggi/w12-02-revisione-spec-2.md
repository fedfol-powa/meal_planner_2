# W12: seconda revisione di spec e piano, DA CORREGGERE

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w12-spec-piano-2.md`.
Le decisioni vincolanti sono recepite e non servono decisioni di prodotto. Correggi i
quattro rilievi come propone il revisore:

1. **Slash finale:** il limite dell'upload deve riconoscere i percorsi come li normalizza
   oRPC, oppure rifiutare prima del parser le varianti non canoniche. Aggiungi prove
   attraverso `createApp` su RPC e OpenAPI, con e senza slash finale.
2. **Errore del limite:** oggi l'errore attraversa gli interceptor e diventa `400
   invalid`. Specifica come arriva `413` con `photo_too_large`, per esempio con un errore
   oRPC riconosciuto. Verificalo attraverso `createApp`, senza simulare `handler.handle`.
3. **Mutazioni delle foto:** serve uno scenario con il percorso reale di
   `useUploadPhoto` e `useRemovePhoto`, parametrizzato su caricamento e rimozione. Deve
   fallire se togli l'incremento del contatore dagli `onSuccess`.
4. **Motivazione della tabella** nella spec: niente più «eliminazione differita».

Poi committa e scrivi `STATO: SPEC_E_PIANO_CORRETTI`.
