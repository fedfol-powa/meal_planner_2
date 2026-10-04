# Riferimento visivo approvato

Il 4 ottobre 2026 l’utente ha approvato il linguaggio visivo rappresentato da
[index.html](index.html) come base definitiva per il futuro prototipo di App Famiglia.
Le regole operative sono in [design.md](design.md); la decisione e i requisiti di
prodotto restano nella [specifica, sezione 14](../progetto/superpowers/specs/2026-09-29-app-famiglia-design.md).

## Materiale da usare

- `design.md`: palette, tipografia, componenti, navigazione, spazi e criteri di verifica.
- `index.html`: riferimento interattivo approvato, apribile direttamente nel browser.
- `assets/hellofresh/fonts/`: i quattro WOFF2 usati dal riferimento.
- `assets/recipe-images/`: le otto fotografie delle fonti delle ricette.
- `references/hellofresh/preview-*.png`: screenshot della variante approvata.
- `references/hellofresh/home-*.png` e `menu-mobile.png`: studio del sito esterno.
- [reference-audit.json](references/hellofresh/reference-audit.json): provenienza degli
  asset e valori osservati; documentazione della ricerca, subordinata alla guida.

HTML, font e foto sono locali; non servono build o dipendenze. Il riferimento
contiene i 7 giorni, 14 pasti e 71 voci di ingredienti del menu del 5–11 ottobre 2026
del progetto di origine, consultato in sola lettura. Le foto vengono dalle pagine
fonte dei piatti; le ricette senza foto restano schede di testo.

## Interazioni dimostrative

Calendario con giorni a scorrimento laterale, ingredienti espandibili, navbar
Menu/Ricettario/Spesa, rimandi dal ricettario al menu e spunte temporanee nella spesa.
Il cambio vista conserva il giorno scelto. Il ricettario è limitato alle ricette
della settimana e la spesa al giorno selezionato: sono dati dimostrativi, non nuovi
requisiti funzionali. Il prototipo dovrà coprire l’intera specifica.

## Anteprima sulla rete locale

Il server della sessione è sulla porta `8765` e serve una copia minima in
`/private/tmp/meal-planner-html-preview/`: HTML, quattro font e otto immagini.
PID e log sono in `/private/tmp/meal-planner-html-review/`.
Il server continua a funzionare indipendentemente dal branch o dal worktree.

L’iPhone deve trovarsi sulla stessa rete del Mac, che deve restare acceso. L’IP può
cambiare con la rete. Per futuri aggiornamenti dell’anteprima copiare soltanto i
file effettivamente richiesti dall’HTML nella directory servita, tenendo fuori
documenti, PDF e screenshot di ricerca.

## Controlli per il prototipo

Confrontare le nuove schermate con la guida e l’HTML a larghezze di 320, 390 e
1440 px, verificando titoli lunghi, quantità, accenti e testi inglesi britannici.
Controllare font e immagini caricati, contenuti non coperti dalla navbar, focus,
swipe e conservazione del giorno. Per la stampa verificare che Pranzo/Cena e le
quantità rimangano leggibili anche quando si nascondono le fotografie.

Il riferimento ha superato controlli nel browser, confronto dei dati con l’origine
e review statica indipendente; l’utente ne ha approvato il linguaggio dopo la prova
su iPhone. Questo non certifica i futuri servizi o i flussi completi dell’app.
