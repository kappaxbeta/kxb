#!/usr/bin/env bash
#
# Run the app against a local Supabase in Docker, via .env.local.
#
# This is `bun run dev`, and it is deliberately the default: .env points at
# backend.kxb.team, so before this script existed the ordinary way to start the
# app was to start it against production.
#
# ---------------------------------------------------------------------------
# Why this writes .env.local instead of exporting variables
# ---------------------------------------------------------------------------
# Next merges .env.local over .env, so .env.local is the file that decides which
# database a dev server talks to. Exporting shell variables would work too - the
# shell beats every .env file - but it leaves .env.local saying something
# different from what is actually running, and the first person to open it is
# owed the truth.
#
# It is merged, not overwritten: only the five Supabase-and-URL lines are
# rewritten, and Stripe keys, UPLOAD_DIR and anything else you have put there
# are preserved exactly.
#
# The local keys are generated per install, which is why they are read from
# `supabase status` on every run rather than committed. That also self-heals the
# half-written .env.local this replaced, which had a local anon key and no URL -
# so Next took the URL from .env and the key from .env.local, and the dev server
# pointed at production holding a key production has never heard of.
#
# Usage:
#   bun run dev                  # local stack, starting it if needed
#   bun run dev -- --port 4000   # anything after -- goes to `next dev`
set -euo pipefail

# The CLI's PostHog analytics flush can time out on exit and return 1 after the
# command has already succeeded. Opting out removes the flush; see
# db-push-prod.sh for the failure it produced.
export DO_NOT_TRACK=1

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "==> Docker is not running." >&2
  echo "    The local Supabase stack runs in Docker - start Docker Desktop and retry." >&2
  echo "    To run against production instead: bun run dev:remote" >&2
  exit 1
fi

# `supabase start` is idempotent but not instant even when everything is already
# up, so skip it when the stack is answering. First run pulls several GB of
# images and takes a few minutes; that is a one-off.
if ! supabase status >/dev/null 2>&1; then
  echo "==> Starting the local Supabase stack (first run pulls images - be patient)"
  supabase start
fi

# -o env prints shell assignments: API_URL="...", ANON_KEY="...", and so on.
# Parsed rather than hardcoded because these keys differ per install.
STATUS="$(supabase status -o env)"

extract() {
  echo "$STATUS" | grep -E "^$1=" | head -1 | cut -d= -f2- | tr -d '"'
}

API_URL="$(extract API_URL)"
ANON_KEY="$(extract ANON_KEY)"
SERVICE_ROLE_KEY="$(extract SERVICE_ROLE_KEY)"
# The direct Postgres connection, and it belongs here for a reason that cost a
# real debugging session: scripts which talk to *both* PostgREST and Postgres
# read the first from .env.local and the second from .env. Leave this unmanaged
# and `bun run dev` gives them a local API with a production database - so
# event-seed dumped a space out of production, found none of the event tables
# there, and failed pointing at a table that exists perfectly well locally.
DB_URL="$(extract DB_URL)"

if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ]; then
  echo "==> Could not read the local stack's URL and keys from \`supabase status\`." >&2
  echo "    Output was:" >&2
  echo "$STATUS" >&2
  exit 1
fi

APP_URL="${LOCAL_APP_URL:-http://127.0.0.1:3000}"

# ---------------------------------------------------------------------------
# Merge into .env.local
# ---------------------------------------------------------------------------
# Every managed key is stripped first and re-appended, so running this twice
# does not leave two of each. Everything not in that list passes through
# untouched - hence the grep rather than a rewrite of the whole file.
MANAGED='NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_APP_URL|SUPABASE_DB_URL'

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [ -f .env.local ]; then
  grep -vE "^($MANAGED)=" .env.local > "$TMP" || true
else
  {
    echo "# Local development. Written by scripts/dev.sh - the five Supabase and"
    echo "# URL lines below are regenerated on every \`bun run dev\`."
    echo "#"
    echo "# Next merges this over .env, so this file is what decides which database"
    echo "# a dev server talks to. .env holds production; see \`bun run dev:remote\`."
    echo "#"
    echo "# Anything you add here that is not one of those five lines is preserved."
    echo
  } > "$TMP"
fi

{
  echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  echo "NEXT_PUBLIC_APP_URL=$APP_URL"
  echo "SUPABASE_DB_URL=$DB_URL"
} >> "$TMP"

mv "$TMP" .env.local
trap - EXIT

echo "==> Supabase : $API_URL  (local Docker, via .env.local)"
echo "==> Studio   : http://127.0.0.1:54323"
echo "==> Mailpit  : http://127.0.0.1:54324"
echo "==> App      : $APP_URL"
echo

exec next dev "$@"
