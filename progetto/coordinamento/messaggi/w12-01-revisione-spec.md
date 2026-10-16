# W12: prima revisione di spec e piano, DA CORREGGERE

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w12-spec-piano.md`.
Leggilo tutto e correggi spec e piano. Per due rilievi il coordinatore ha già deciso la
strada: segui queste decisioni.

## Decisioni del coordinatore

1. **Rilievo 1, pulizia del bucket: niente cancellazione automatica.** Togli la pulizia
   degli oggetti orfani e delle foto tolte, sia dal codice sia dai test. Gli oggetti nel
   bucket non si cancellano mai in automatico, così nessuna esportazione conservata può
   restare con un riferimento rotto. Il volume è minimo: qualche centinaio di foto da
   poche centinaia di KB, contro i 10 GB gratuiti di R2. Nella spec scrivi:
   - perché non c'è pulizia;
   - che gli oggetti di caricamenti falliti possono restare orfani;
   - che un'eventuale pulizia futura dovrà tenere conto dei riferimenti in tutte le
     esportazioni conservate.

   Togli anche le regole del ciclo di vita dai passi esterni del rilascio. Il punto 6 del
   brief resta soddisfatto, con la conservazione illimitata.
2. **Rilievo 2, cache: segui la correzione del revisore.**
   - Le risposte di `/photos/*` non devono finire nella cache HTTP del browser né in cache
     condivise: usa `Cache-Control: private, no-store` o un equivalente motivato.
   - L'offline lo garantisce solo la cache esplicita del service worker. Le chiavi sono
     immutabili, quindi la strategia è prima la cache, poi la rete.
   - Sistema le affermazioni della spec su uscita e rimozione: le foto sono del
     ricettario, non dati di una famiglia. Si tolgono comunque con la cache delle foto al
     logout, compreso il caso di una risposta che arriva durante il logout.
   - Copie già salvate fuori dall'app non sono revocabili: scrivilo.

## Altri rilievi

Correggi come propone il revisore:

- **3:** formati accettati in ingresso limitati a quelli del piano Images Free, niente
  AVIF; prova dell'errore `9422`.
- **4:** limite del corpo applicato durante la lettura, prima del parser multipart.
- **5:** mutazioni delle foto nel meccanismo comune delle risposte superate, con il test
  del pasto ritardato.
- **6:** comandi di test dal workspace `server`, più la migrazione applicata in locale e
  `TEST_DATABASE_URL` prima dei test d'integrazione.

Poi committa e scrivi `STATO: SPEC_E_PIANO_CORRETTI`.
