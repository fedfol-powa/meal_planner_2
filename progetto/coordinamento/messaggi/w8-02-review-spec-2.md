# W8: seconda review di spec e piano, rilievi e decisioni del coordinatore

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w8-spec-piano-2.md`
(DA CORREGGERE: 1 bloccante, 2 importanti, 1 minore; i nove rilievi precedenti sono chiusi
o superati). L'architettura semplificata resta. Leggi il rapporto, poi:

1. **Coerenza del precache (bloccante).** Il modo più semplice che la renda vera:
   - la build **inserisce nel `sw.js`** la propria versione e l'elenco dei file da mettere in
     cache, al posto del `/precache.json` letto a runtime (gli asset con hash sono immutabili
     per nome);
   - l'`index.html` della build porta la versione (per esempio
     `<meta name="app-version">`); all'installazione il worker lo scarica con
     `cache: 'reload'` e lo **rifiuta se la versione non coincide** con la propria. In quel caso
     l'installazione fallisce, resta il worker precedente e si riprova all'aggiornamento
     successivo;
   - si scrive in cache solo dopo aver scaricato e verificato tutto, e per ultima una voce
     segno «completa». All'installazione, una cache della stessa versione già completa si
     **riusa senza riscriverla**; una cache senza segno si cancella e si ricostruisce. Così
     un tentativo fallito non tocca mai una cache completa.
   - Se togliere `/precache.json` dal runtime lo rende inutile, toglilo; se serve ancora
     alla build, dichiaralo.
   Test: cambio di rilascio fra script, HTML e asset; fallimento durante la scrittura con
   una cache completa già presente, che resta identica.
2. **Limite dei ricaricamenti.** La protezione è contro i tentativi **senza convergenza**:
   il segno della coppia si cancella quando pagina e worker risultano allineati. Test
   B → C → B → C con `sessionStorage` conservato, più il blocco di un ricaricamento senza
   progresso.
3. **Registrazione iniziale fallita.** Al ritorno visibile, se manca la registrazione, la
   si recupera (`navigator.serviceWorker.getRegistration()`) o si ritenta. Test:
   registrazione fallita → rete disponibile → ritorno visibile → aggiornamento.
4. **Prove di rottura.** Trattieni anche la pulizia del logout; per la coda, distingui le
   finestre protette in modo che rimuovere la protezione del comportamento osservato faccia
   fallire il test.

Inoltre:
- Scrivi nella spec che il rollback automatico vale solo fra versioni con il nuovo
  protocollo. Tornare ad A₀ richiede una procedura distinta, da descrivere in breve.
- Nelle «Decisioni da riportare», ricorda anche le «Interfacce decise» del piano generale
  (navigazioni dalla rete, buster legato alla build).

Aggiorna spec e piano, commit, poi `STATO: SPEC_E_PIANO_CORRETTI` con un riassunto per
rilievo.
