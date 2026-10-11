# W2: fonte obbligatoria nelle equivalenze

La PR #4 è unita. Piccola correzione emersa dalla PR #7 di W4 (dominio unità e spesa).

**Problema:** `app.ingredient_unit_equivalences.source` ammette `null`, mentre lo schema
zod del dominio (`domain/src/units/`, PR #7) vuole una fonte non vuota. La specifica
parla di «equivalenze verificate» con la loro fonte (sezione 2, tabella
`ingredient_unit_equivalences`).

**Decisione del coordinatore:** fonte obbligatoria nel database.

**Cosa fare:**

1. Nel tuo worktree: `git fetch origin && git switch -c fondamenta/schema-fonte origin/main`.
2. Nuova migrazione (non modificare quelle già unite) che rende `source` `not null` con
   un vincolo check sul testo non vuoto dopo il trim.
3. Test pgTAP: inserimento senza fonte o con fonte vuota rifiutato; il test esistente
   con fonte resta verde. Esegui tutta la suite (`supabase test db`).
4. Commit in italiano, push, PR verso `main` con descrizione breve, poi scrivi
   `STATO: PR_APERTA <url>` e fermati. Non fare merge.
