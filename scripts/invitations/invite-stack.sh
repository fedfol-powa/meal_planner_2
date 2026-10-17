#!/usr/bin/env bash
# scripts/invitations/invite-stack.sh — invitations, emails and user administration against the local stack
# (sign-ups off, Mailpit on): the whole path through the real contract and pipeline with Supabase Auth. Used by CI.
#   SUPABASE: the supabase CLI command (default `supabase`), for a stack on other ports
#     (for example SUPABASE="supabase --workdir <dir>").
#   CONTAINER_CLI: docker (default) or podman, for the second Auth services (scripts/test-support/auth-require-current.sh).
# Two second Auth services run for the duration of the tests and are removed on exit: one with «Require current
# password» (STACK_AUTH_REQUIRE_CURRENT_URL) and one with also an hourly email limit of 2 (STACK_AUTH_EMAIL_LIMIT_URL).
# Reproducible by hand: `scripts/test-support/auth-require-current.sh start [--email-limit 2]`, then `stop [--email-limit 2]`.
set -euo pipefail
cd "$(dirname "$0")/../.."

status=$(${SUPABASE:-supabase} status -o env)
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
API_URL=$(value API_URL)
DB_URL=$(value DB_URL)
KEY=$(value PUBLISHABLE_KEY)
SECRET=$(value SECRET_KEY)
MAILPIT=$(value MAILPIT_URL)
[ -n "$API_URL" ] && [ -n "$DB_URL" ] && [ -n "$KEY" ] && [ -n "$SECRET" ] || { echo "supabase status: API_URL, DB_URL, PUBLISHABLE_KEY or SECRET_KEY missing (is Auth running?)"; exit 1; }

auth=scripts/test-support/auth-require-current.sh
cleanup() {
	"$auth" stop >/dev/null 2>&1 || true
	"$auth" stop --email-limit 2 >/dev/null 2>&1 || true
}
trap cleanup EXIT
REQUIRE_CURRENT_URL=$("$auth" start)
EMAIL_LIMIT_URL=$("$auth" start --email-limit 2)

TEST_DATABASE_URL="$DB_URL" STACK_SUPABASE_URL="$API_URL" STACK_SUPABASE_PUBLISHABLE_KEY="$KEY" \
  STACK_SUPABASE_SECRET_KEY="$SECRET" STACK_DB_URL="$DB_URL" MAILPIT_API_URL="${MAILPIT:-http://127.0.0.1:54324}" \
  STACK_AUTH_REQUIRE_CURRENT_URL="$REQUIRE_CURRENT_URL" STACK_AUTH_EMAIL_LIMIT_URL="$EMAIL_LIMIT_URL" \
  npm test -w server -- test/stack/
