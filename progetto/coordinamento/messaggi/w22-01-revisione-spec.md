# W22, messaggio 01: revisione di spec e piano

Rapporto: `progetto/coordinamento/revisioni/w22-spec-piano.md` (APPROVABILE CON CORREZIONI).

Correggi spec e piano su tutti e sette i rilievi, come proposto dal revisore:

1. `SkeletonRows` dentro schede vere: ogni riga deve avere il suo blocco esterno pieno e
   pulsante; verifica lo stile nel browser (la lista Utenti non deve restare vuota).
2. Titolo: `Skeleton as="span"` nello stesso `LoadingScope` del corpo, con soglia di 200 ms
   e pausa offline; test del titolo prima dei 200 ms e offline; link indietro fuori dal
   sottoalbero nascosto.
3. Layout strutturalmente uguali al contenuto (Amministrazione con la ricerca sopra la lista,
   Membri con suggerimento e «Crea un link», Preferenze con etichetta e valore, Profilo con
   `.row-link` e letture secondarie dei conteggi); ordine dei pezzi condivisi configurabile;
   verifica delle coordinate anche nei passaggi intermedi (profilo → dettaglio → liste).
4. e 7. vedi le decisioni sotto.
5. Test delle sezioni dei curatori con una fixture del caso comune e misura del `top` dei
   risultati nel browser; passaggio ruolo sconosciuto → curatore con overview trattenuta;
   aggiorna il test offline di `/password` conservando zero chiamate Auth, frammento
   invariato e nessuna operazione registrata come occupata.
6. Firme complete (`action` in `SettingsCardSkeleton`, altezza del titolo configurabile);
   `FamilyGate.waiting` obbligatorio solo dopo l'aggiornamento di tutti i chiamanti, o
   Membri nello stesso task; typecheck al confine.

## Decisioni del coordinatore (23/10) sui punti aperti

- **Un solo annuncio di caricamento per pagina**, non un solo `role="status"` in assoluto:
  conteggi (per esempio quello del Ricettario), conferme operative e banner offline restano
  con i loro status. È la lettura di W20 («un solo `role="status"` per pagina o area che
  annuncia «Caricamento…»»). Scrivilo esplicitamente in spec e piano e fai controllare ai
  test che ci sia un solo annuncio «Caricamento…» e che gli altri status restino intatti.
- **Bozze, caso comune:** se c'è un riepilogo del catalogo salvato in locale, lo skeleton
  usa il suo numero di bozze (massimo 3); altrimenti una scheda. Lo spostamento residuo
  quando il numero cambia resta ammesso, solo per i curatori. Se costa troppo, proponi
  un'alternativa con `STATO: DOMANDA`.
- **Pagine riservate a un ruolo:** approvato lo skeleton anche prima che il ruolo sia
  noto, seguito eventualmente dal diniego. Nel testo per `design/design.md` distingui
  sezioni condizionali (aspettano il ruolo noto) e pagine riservate (eccezione), e
  precisa che «ruolo noto» vuol dire presente nel profilo corrente, anche ripristinato
  dalla cache, senza cambiare i controlli di revoca.

Poi committa e scrivi `STATO: SPEC_E_PIANO_PRONTI`: farò un secondo giro di revisione.
