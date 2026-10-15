#!/usr/bin/env bash
# scripts/invitations/invite-stack.sh — app invitations and user administration against the local stack (sign-ups off):
# the whole path through the real contract and pipeline with Supabase Auth. Used by CI.
set -euo pipefail
cd "$(dirname "$0")/../.."

status=$(${SUPABASE:-supabase} status -o env)
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
API_URL=$(value API_URL)
DB_URL=$(value DB_URL)
KEY=$(value PUBLISHABLE_KEY)
SECRET=$(value SECRET_KEY)
[ -n "$API_URL" ] && [ -n "$DB_URL" ] && [ -n "$KEY" ] && [ -n "$SECRET" ] || { echo "supabase status: API_URL, DB_URL, PUBLISHABLE_KEY or SECRET_KEY missing (is Auth running?)"; exit 1; }

TEST_DATABASE_URL="$DB_URL" STACK_SUPABASE_URL="$API_URL" STACK_SUPABASE_PUBLISHABLE_KEY="$KEY" \
  STACK_SUPABASE_SECRET_KEY="$SECRET" STACK_DB_URL="$DB_URL" \
  npm test -w server -- test/stack/
