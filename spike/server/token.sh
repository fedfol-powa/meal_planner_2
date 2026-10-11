#!/bin/sh
# Prints an access token for a spike test user: ./token.sh a|b
set -eu
cd "$(dirname "$0")"
. ./.env
curl -sf "$SUPABASE_URL/auth/v1/token?grant_type=password" \
	-H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'content-type: application/json' \
	-d "{\"email\":\"spike-$1@cosasimangia.test\",\"password\":\"$SPIKE_PASSWORD\"}" |
	python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])'
