# Skill per Claude: piano (W17)

Brief: `progetto/coordinamento/brief/w17-skill-claude.md`. Niente brainstorming, spec di design
né prototipo (decisioni dell'utente del 18 ottobre 2026, nel brief). Specifica principale:
sezioni 1, 8, 13, 14, 15.

**Obiettivo:** una skill `cosa-si-mangia` che insegna a un agente (Claude in particolare) a usare
gli strumenti MCP dell'app come membro, curatore e amministratore; lo zip si scarica da
«Collega un agente», con i passaggi per claude.ai.

## File

| File | Cosa |
|---|---|
| `agent-skill/cosa-si-mangia/SKILL.md` | sorgente della skill, unica |
| `web/scripts/skill-zip.mjs` | scrive e legge lo zip (solo `node:zlib`) |
| `web/scripts/sync-assets.mjs` | genera `public/downloads/cosa-si-mangia.zip` a ogni `predev`/`prebuild` |
| `web/.gitignore` | `public/downloads/` (lo zip non si versiona) |
| `web/src/pwa/sw-rules.ts` | `/downloads/` passa sempre alla rete |
| `web/vite.config.ts` | `__SKILL_VERSION__` letto dal `SKILL.md`; i test includono `scripts/` |
| `web/src/features/agents/AgentsPage.tsx`, `SkillSection.tsx` | sezione «Skill per Claude» |
| `web/src/i18n/messages/agents.ts` | testi it/en |
| `server/test/agent-skill.test.ts` | nomi degli strumenti e frontmatter |
| `web/scripts/skill-zip.test.ts`, test della pagina e di `sw-rules` | |
| `server/test/asset-routing.test.ts` | lo zip è un file statico, non la SPA |

**Perché `agent-skill/` alla radice:** la skill non appartiene a un workspace (la leggono il
server nei test e il web nella build), la cartella porta il nome della skill come nello zip e
resta lontana da `.claude/skills/`, che sono le skill di chi sviluppa il progetto.

## Contenuto della skill

Inglese, sotto 200 righe, istruzioni brevi con il perché; i parametri li dà lo schema degli
strumenti. Frontmatter solo `name` e `description` (≤ 200 caratteri, terza persona, scatta su
menu, pasti, ricette, famiglia di Cosa si mangia). Sezioni:

1. Cos'è l'app; presuppone il connettore MCP (nomi degli strumenti con il prefisso del client);
   se mancano, rimandare a Profilo › Collega un agente. Rispondere nella lingua dell'utente.
2. All'inizio: `session_whoami`/`profile_get` (ruoli globali, famiglie, famiglia mostrata);
   `family_get` per ruolo nella famiglia e fuso; `profile_setCurrentFamily` solo su richiesta.
   «Oggi» e «questa settimana» nel fuso della famiglia; settimana dal lunedì.
3. Menu: `menu_getOpening`, `menu_getWeek`, `menu_getDates`, `recipes_get`; modifiche
   (`meals_setRecipe`, `_setFree`, `_swap`, `_setServings`, `_setNote`, `meals_getSuggestions`,
   `recipes_search`), `id` nuovo per azione, rilettura e resoconto, `meals_undo`; `ratings_set`.
4. Famiglia: impostazioni, regole, esclusioni, ingredienti limitati, libri, membri, ruoli,
   inviti (`family_*`, `familyInvitations_*`); eliminazione solo nell'app.
5. Ricettario (curatori): prima `catalogue_getGuide`, poi il flusso della guida, senza
   copiarne le regole; ingredienti mai dedotti dal nome del piatto.
6. Amministrazione: `users_*`, `appInvitations_*`.
7. Conferme: elenco del brief; password e sessioni solo su richiesta esplicita.
8. Errori: codici del contratto e cosa dire (`web_only` con l'URL, `conflict`, `not_allowed`…).
9. Versione: `Skill version: 2026-10-18`, la stessa della pagina.

Esposizione verificata nel contratto: l'unica operazione `webOnly` è `family.delete`;
`account_delete` e `users_delete` rimandano con `web_only` solo quando eliminerebbero una
famiglia; il caricamento di un file di foto non è uno strumento. Spesa fuori dalla skill.

## Impacchettamento

`skill-zip.mjs` scrive uno zip (deflate, CRC con `zlib.crc32`) con `cosa-si-mangia/SKILL.md`
in cima e sa rileggerne l'indice centrale per i test. Nessuna dipendenza nuova. Lo zip va in
`web/public/downloads/`: Vite lo serve in sviluppo, la build lo copia in `dist`, il Worker lo
serve come file statico (non è in `run_worker_first`), nessuna modifica al server. Fuori da
`/assets/` perché la cache del service worker lo terrebbe fermo a una versione vecchia, e
`/downloads/` è `passthrough` perché un download può arrivare come navigazione e riceverebbe la
shell.

## Pagina

Sezione «Skill per Claude» dopo «Prova il collegamento», visibile a tutti: una riga che dice a
cosa serve, il link di scaricamento (`download`), quattro passaggi numerati (Impostazioni ›
Capacità: esecuzione del codice; Personalizza › Skill › «+» › Crea skill › Carica una skill;
attivarla; sul telefono è già disponibile con il connettore collegato) e «Versione del
{data}: se cambia, scaricala e caricala di nuovo».

## Test

- server: ogni `gruppo_operazione` citato nel `SKILL.md` con un gruppo di strumenti esiste fra
  gli strumenti generati; frontmatter (nome = cartella, minuscole e trattini, ≤ 64; descrizione
  ≤ 200); la versione ha il formato atteso.
- web: lo zip ha la sola voce `cosa-si-mangia/SKILL.md` e il contenuto torna identico;
  `sw-rules` per `/downloads/`; pagina in italiano e inglese con il link e la versione.
- asset-routing: `/downloads/cosa-si-mangia.zip` risponde con il file.
- Prova d'uso con `claude -p` sullo stack locale (quattro richieste del brief) e screenshot
  con agent-browser anche a larghezza da telefono.

## Resta da provare a mano (utente, dopo il rilascio)

Caricare lo zip su claude.ai, attivare la skill, usarla dall'app Claude sull'iPhone con il
connettore collegato; controllare che la skill scatti con domande sul menu.

## Decisioni da riportare nella specifica

**Prodotto** (sezione 13, «Pagina web di istruzioni»): sezione «Skill per Claude» con lo zip e i
passaggi per claude.ai, visibile a tutti; la skill copre menu, famiglia, ricettario e
amministrazione, non la spesa; la versione mostrata coincide con quella nella skill.

**Tecniche** (sezioni 1 e 13): sorgente in `agent-skill/cosa-si-mangia/SKILL.md`; zip generato
da `sync-assets` in `web/public/downloads/`, non versionato, servito come file statico;
`/downloads/` fuori dalla cache del service worker; regole del ricettario solo in
`catalogue_getGuide`; test che legano i nomi degli strumenti citati al contratto.
