# Server

Worker di Cloudflare che serve la SPA (`web/dist`) e le rotte del contratto:
`/api/rpc`, `/api`, `/api/openapi.json`, `/mcp`. Spec:
`progetto/superpowers/specs/2026-10-11-piattaforma.md`.

## Sviluppo locale

1. Avvia il database locale con le migrazioni: `supabase db start` (vedi
   `supabase/README.md`; serve Podman avviato).
2. Copia `.env.example` in `.env` e compila la connessione come `app_server`, l'URL
   dell'Auth locale e la chiave pubblica (`SUPABASE_PUBLISHABLE_KEY`, da `supabase status`),
   usata per scollegare gli agenti tramite Supabase Auth.
3. Una volta sola: `npm install-scripts approve workerd` (npm 11 blocca lo script
   d'installazione del runtime usato da `wrangler dev`).
4. `npm run build -w web`, poi `npm run dev -w server` (porta 8787).
5. Prova: `curl -H "Authorization: Bearer <token>" http://localhost:8787/api/session/whoami`.

Job settimanale in locale: `npm run dev -w server -- --test-scheduled`, poi
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"` (con `&time=<ms>`
per un istante diverso). Serve tutte le famiglie del database locale: su quello dei test,
che ne contiene molte, genera settimane per ognuna.

Esportazione notturna in locale (R2 simulato da Miniflare, chiave in `.env`): da
`server/`, `npx wrangler dev --test-scheduled`, poi
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=30+2,4+*+*+*"`. Il log
`backup_export_done` riporta la chiave completa dell'oggetto, che comincia già con
`exports/`; per scaricarla, sempre da `server/`:

```bash
KEY='exports/2026-10-12T02-30Z.json.gz.enc'   # la chiave dal log
npx wrangler r2 object get "cosasimangia-backups/$KEY" --local --jurisdiction eu --file ../export.bin
```

Il file finisce nella radice del repository, da cui si usa la CLI di ripristino
(`supabase/README.md`).

In locale Hyperdrive non fa da pool: le prove di concorrenza si fanno sul Worker pubblicato.

## Test

`npm test -w server`. I test con il database richiedono `TEST_DATABASE_URL`
(superutente del database locale con le migrazioni di `supabase/`, per esempio
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`; verifica con `supabase status`);
senza, in locale sono saltati, in CI falliscono. La CI avvia database e Auth con
`supabase start` ed esegue anche `supabase test db` e `scripts/oauth/agents-e2e.sh`, la prova
end-to-end degli agenti con il Worker.

## Pubblicazione

Con `npm run release` in due tempi, lanciato dal coordinatore dopo il «vai» dell'utente
(spec di dettaglio `progetto/superpowers/specs/2026-10-11-messa-in-produzione.md`,
sezione 7). Le credenziali si leggono da `.env.production.local` del checkout principale
(`--env-file` per un altro file), mai dall'ambiente; nessun comando le stampa.

1. `npm run release -- --preview`: `main` pulito e uguale a `origin/main`, CI verde;
   un solo progetto Supabase per tutto (`scripts/production-target.json`, utente di
   `POSTGRES_DATABASE_URL`, `web/.env.production`, `server/wrangler.jsonc`, eventuale
   `supabase link`); configurazione del Worker (account, Hyperdrive, bucket, segreti di
   `scripts/release.config.json`, chiave pubblica **uguale** a quella della SPA); build
   della SPA con i soli valori di `web/.env.production` e bundle del Worker; migrazioni
   con `supabase db push --dry-run --db-url <url verificata>` (password in
   `PGPASSWORD`, mai il progetto «collegato»). Stampa il commit e il comando seguente.
2. `npm run release -- --apply <sha>`: ripete tutti i controlli e la build, si ferma se
   il commit non è `<sha>`; poi migrazioni (`supabase db push --db-url`), `wrangler
   deploy --tag <sha>` e i controlli sull'indirizzo pubblicato (OpenAPI, 401 senza
   token, metadati OAuth, SPA, 404 su `/shopping-lists/<48 zeri>` attraverso
   Hyperdrive).

La prima volta, prima della password di `app_server` e di Hyperdrive, le migrazioni vanno
da sole: `npm run release -- --preview --migrations-only`, poi `--apply <sha>
--migrations-only` (nessuna build, nessun deploy). I ruoli del server nascono dalle
migrazioni. Non si pubblica più con `npm run deploy` a mano, e le migrazioni non
arrivano dall'integrazione di Supabase.

**Ritorno indietro.** Primo rilascio difettoso: `npx wrangler delete` da `server/` (non
c'è una versione precedente). Rilasci successivi: `npx wrangler rollback <version-id>
--message "<motivo>"` alla versione con il tag dello SHA precedente (`npx wrangler
versions list`), solo se `git diff --name-only <sha precedente> <sha attuale> --
supabase/migrations` elenca migrazioni additive; altrimenti correzione in avanti.

## Risorse di produzione

Da compilare durante il runbook del piano
`progetto/superpowers/plans/2026-10-11-messa-in-produzione.md` (parte B).

| Risorsa | Valore |
|---|---|
| Account Cloudflare | POWA, `account_id` in `wrangler.jsonc` |
| Progetto Supabase | `lronuqvtjdhfyychnscr` (`scripts/production-target.json`) |
| Hyperdrive | id, limite di connessioni (pool − 5) e perché |
| Bucket delle esportazioni | `cosasimangia-backups`, giurisdizione `eu` |
| Indirizzo | `workers.dev` (anche in `scripts/release.config.json`) |
| Primo rilascio | data e commit |
| Collaudo completo | data ed esito |
| Rotazione delle password | data |

Al passaggio al dominio `cosasimangia.qunidi.it` (ondata 3) vanno aggiornati *Site URL* e
*Redirect URLs* di Supabase Auth.
