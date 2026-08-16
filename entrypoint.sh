#!/bin/sh
set -e

echo "→ Applying database schema (prisma db push)..."
npx prisma db push

# Idempotent: create TenantModule rows for tenants that predate module gating
# (missing rows = all modules disabled). Safe on every boot; existing rows untouched.
echo "→ Backfilling tenant module rows..."
npx tsx scripts/backfill-modules.ts

if [ "$SEED_DB" = "true" ]; then
  echo "→ Seeding demo data (SEED_DB=true)..."
  npx tsx prisma/seed.ts
fi

echo "→ Starting PeopleNexa on port ${PORT:-3000}"
exec node server.js
