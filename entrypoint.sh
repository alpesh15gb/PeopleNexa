#!/bin/sh
set -e

echo "→ Applying database schema (prisma db push)..."
npx prisma db push

if [ "$SEED_DB" = "true" ]; then
  echo "→ Seeding demo data (SEED_DB=true)..."
  npx tsx prisma/seed.ts
fi

echo "→ Starting PeopleNexa on port ${PORT:-3000}"
exec node server.js
