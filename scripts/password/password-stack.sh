#!/usr/bin/env bash
# scripts/password/password-stack.sh — the password change against the local stack
# (`supabase start` with supabase/config.toml): backend and page. Used by CI; runnable locally.
#   SUPABASE: the supabase CLI command (default `supabase`), for a stack on other ports.
set -euo pipefail
cd "$(dirname "$0")/../.."

status=$(${SUPABASE:-supabase} status -o env)
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
API_URL=$(value API_URL)
DB_URL=$(value DB_URL)
KEY=$(value PUBLISHABLE_KEY)
[ -n "$API_URL" ] && [ -n "$DB_URL" ] && [ -n "$KEY" ] || { echo "supabase status: API_URL, DB_URL or PUBLISHABLE_KEY missing (is Auth running?)"; exit 1; }

STACK_SUPABASE_URL="$API_URL" STACK_SUPABASE_PUBLISHABLE_KEY="$KEY" STACK_DB_URL="$DB_URL" \
  npm test -w web -- src/auth/changePassword.stack.test.ts src/routes/profile/PasswordPage.stack.test.tsx
