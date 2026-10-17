#!/usr/bin/env bash
# scripts/oauth/agents-e2e.sh — runs the agents end-to-end check against the local stack
# (`supabase start` with Auth and the OAuth server of supabase/config.toml). Used by CI;
# runnable locally. Starts `wrangler dev` on APP_PORT (default 8787) and stops it at the end.
#   SUPABASE: the supabase CLI command (default `supabase`), for a stack on other ports.
set -euo pipefail
cd "$(dirname "$0")/../.."

port=${APP_PORT:-8787}
status=$(${SUPABASE:-supabase} status -o env)
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
API_URL=$(value API_URL)
DB_URL=$(value DB_URL)
KEY=$(value PUBLISHABLE_KEY)
# Sign-ups are off locally too (spec W9): the password check creates its person with the admin API.
SECRET=$(value SECRET_KEY)
[ -n "$API_URL" ] && [ -n "$DB_URL" ] && [ -n "$KEY" ] && [ -n "$SECRET" ] || { echo "supabase status: API_URL, DB_URL, PUBLISHABLE_KEY or SECRET_KEY missing (is Auth running?)"; exit 1; }

# The Worker connects as app_server, as through Hyperdrive in production (same password as the server tests).
DB_URL="$DB_URL" node --input-type=module -e "import postgres from 'postgres'; const sql = postgres(process.env.DB_URL, { max: 1 }); await sql.unsafe(\"alter role app_server password 'app_server_test'\"); await sql.end();"
app_url=$(node -e "const u = new URL(process.argv[1]); u.username = 'app_server'; u.password = 'app_server_test'; console.log(u.toString())" "$DB_URL")

[ -f web/dist/index.html ] || npm run build -w web
env_file=server/.env
[ -f "$env_file" ] && { echo "$env_file exists: move it away first, the check writes its own"; exit 1; }
printf 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=%s\nSUPABASE_URL=%s\nSUPABASE_PUBLISHABLE_KEY=%s\n' "$app_url" "$API_URL" "$KEY" > "$env_file"

log=$(mktemp)
# The test Worker (production app plus the test operations): same wrangler.jsonc, other entry.
# --local-upstream keeps the local origin: otherwise wrangler dev takes the custom domain of the routes.
(cd server && exec npx wrangler dev test/e2e/worker.ts --port "$port" --ip 127.0.0.1 --local-upstream "127.0.0.1:$port" --inspector-port "${INSPECTOR_PORT:-9229}" > "$log" 2>&1) &
worker=$!
cleanup() { kill "$worker" 2>/dev/null || true; rm -f "$env_file"; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$port/.well-known/oauth-protected-resource/mcp" && break
  sleep 1
done
curl -sf -o /dev/null "http://127.0.0.1:$port/.well-known/oauth-protected-resource/mcp" || { echo "Worker did not start"; cat "$log"; exit 1; }

APP_URL="http://127.0.0.1:$port" SUPABASE_URL="$API_URL" DB_URL="$DB_URL" SUPABASE_PUBLISHABLE_KEY="$KEY" SUPABASE_SECRET_KEY="$SECRET" node scripts/oauth/agents-e2e.mjs || { cat "$log"; exit 1; }
