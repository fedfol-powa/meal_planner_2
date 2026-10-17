# W14: rilievi della revisione di spec e piano

Rapporto completo: `progetto/coordinamento/revisioni/w14-spec-piano.md` (DA CORREGGERE,
cinque rilievi). Leggilo. Decisioni del coordinatore:

1. **Ruoli:** accetta la precedenza proposta dal revisore: incarico esplicito di
   revisione, brief del worker o delega del sottoagente; solo in loro assenza il
   coordinatore si riconosce dal checkout principale. Adegua le prove: V5 con il
   messaggio di ripresa reale (formato del README); una prova separata per un worktree
   senza incarico, che deve chiedere chiarimenti. Per simulare il coordinatore usa un
   clone o una copia completa del repository (checkout principale, non un worktree
   collegato) e scrivi nella PR come l'hai ottenuto.
2. **Efficacia delle prove:** almeno una serie con la memoria automatica disabilitata
   (per esempio con le impostazioni o le variabili d'ambiente documentate da Claude
   Code; verifica con Context7 o la documentazione), **senza toccare la memoria reale**.
   Registra versione del client, directory, prompt, file caricati (`/context` o
   equivalente non interattivo) e uso della skill (traccia degli strumenti, per esempio
   `--output-format stream-json`). In V3 valuta la delega proposta, non solo l'assenza
   di modifiche. Le prove fallite su ruolo, delega, autorizzazioni e ripresa restano
   rilievi aperti: se dopo due giri non passano, `STATO: DOMANDA` con l'esito, niente PR.
   Per V6 decidi nella spec quando una duplicazione è ammessa.
3. **Regole e ruoli:** aggiungi la matrice «regola vigente → destinazione → ruoli che la
   leggono → decisione che la sostituisce», includendo README, protocollo, registro
   («Decisioni dell'utente da ricordare» e «Prossima azione»), brief e memorie. La
   proprietà dei file va nella base comune o nel protocollo dei worker, con le eccezioni
   solo tramite brief (quella di W14 resta di W14). Agli script del coordinamento si
   applica la stessa regola: li modifica un worker solo se il brief lo delega.
4. **Configurazione finale:** aggiungi alla spec una consegna operativa per il
   coordinatore dopo il merge, con ordine e criterio di chiusura: ristrutturare il
   registro nel blocco «Stato corrente», controllare che le decisioni siano conservate,
   ripulire la memoria personale come deciso con l'utente, provare «riprendiamo» in una
   sessione nuova nel checkout principale (deve ricostruire lo stato e aspettare il via).
   Prima della PR prova la ripresa su una copia simulata del registro nel nuovo formato,
   dichiarata come simulazione.
5. **Parole da evitare:** la regola vale solo per i prompt nuovi e le istruzioni
   operative dei revisori, non per la documentazione storica.

Correggi spec e piano, commit, poi `STATO: SPEC_E_PIANO_CORRETTI` e aspetta il via.
