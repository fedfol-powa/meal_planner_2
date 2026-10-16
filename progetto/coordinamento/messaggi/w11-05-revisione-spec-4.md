# W11: rilievi della quarta revisione (16/10)

Leggi `progetto/coordinamento/revisioni/w11-spec-piano-4.md`: due rilievi importanti,
nessun bloccante. Correggili così, poi niente quinta revisione Codex: verifico io il
diff e, se è a posto, approvo spec e piano.

1. **Risposte tardive:** non usare `dataUpdatedAt` come prova di freschezza. Usa
   l'istante di **inizio** della richiesta (o un contatore di generazione per famiglia,
   incrementato a ogni revoca e letto all'avvio della richiesta): una risposta iniziata
   prima di `revokedAt` non entra nella cache né nella copia salvata, anche se arriva
   dopo, e una risposta «invariato» non rinnova la freschezza. Una revoca ricevuta
   quando l'accesso risulta già ripristinato pulisce e poi rilegge dal server, senza
   bisogno di una transizione locale. Aggiungi il test della sequenza del revisore,
   compreso il ripristino successivo della cache.
2. **Test L1/L2:** riscrivilo con l'ordine eseguibile proposto dal revisore (L2
   prenotata e confermata senza account; L1 sospeso dopo l'inserimento; U2 creato in
   Auth; cancellazione di U2 in attesa sull'email; rilascio di L1; verifica di
   anonimizzazione e conteggi).

Commit e `STATO: SPEC_E_PIANO_CORRETTI` con il riepilogo delle due modifiche.
