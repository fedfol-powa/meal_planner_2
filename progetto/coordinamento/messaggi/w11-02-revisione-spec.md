# W11: rilievi della revisione di spec e piano (16/10)

Leggi `progetto/coordinamento/revisioni/w11-spec-piano.md` (verdetto DA CORREGGERE).
Accogli tutti i rilievi, 1–12, correggendo spec e piano. Le due questioni lasciate al
coordinatore le decido così:

1. **Accettazione interrotta quando l'ingresso diventa impossibile** (famiglia eliminata,
   link revocato o autore retrocesso fra prenotazione e chiusura, rilievi 4 e 5):
   l'account eventualmente già creato in Auth **resta** (niente compensazione che
   cancella account), come l'account senza ruoli di A dopo una revoca. La pagina dice
   che l'invito non vale più e porta all'accesso con l'email già scritta; dopo l'accesso
   la persona vede «Non fai ancora parte di una famiglia» con «Crea la tua famiglia». La
   prenotazione deve restare rintracciabile indipendentemente dalla famiglia (rilievo
   5), così una ripetizione dallo stesso link non ricrea nulla e l'account compare
   nell'elenco degli utenti di B. Testa i due casi del rilievo 5.
2. **Significato del tetto:** il tetto conta le **prenotazioni**, cioè le email distinte
   che hanno iniziato a creare un account da quel link; un `weak_password` riprovato con
   la stessa email non consuma una seconda quota. Nei testi scrivi «persone registrate
   con questo link» (o equivalente), non «account creati».

Su rilievo 7 (tracciabilità): registra gli ingressi per entrambe le modalità (account
nuovo e account esistente) con link, persona e momento; l'amministratore della famiglia
li vede nella pagina dei membri. Per il rilievo 8 vale anche per la traccia degli
ingressi: alla cancellazione dell'account niente email né nome rimangono, solo ciò che
serve al tetto e all'idempotenza.

Poi commit e `STATO: SPEC_E_PIANO_CORRETTI` con l'elenco di come hai chiuso ogni
rilievo. Seguirà una seconda revisione.
