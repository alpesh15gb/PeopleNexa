#!/bin/sh
set -eu

if [ "${NODE_ENV:-production}" = "production" ]; then
  : "${DATABASE_URL:?DATABASE_URL must be set in production}"
  : "${JWT_SECRET:?JWT_SECRET must be set in production}"
  : "${APP_BASE_DOMAIN:?APP_BASE_DOMAIN must be set in production}"
  : "${EBIO_ENCRYPTION_KEY:?EBIO_ENCRYPTION_KEY must be set in production}"
  : "${CRON_SECRET:?CRON_SECRET must be set in production}"

  case "$JWT_SECRET" in
    change-me|dev-secret-change-me-in-prod|replace-with-*|"" )
      echo "Refusing to start with a default JWT_SECRET." >&2
      exit 1
      ;;
  esac
  if [ "${#JWT_SECRET}" -lt 32 ]; then
    echo "JWT_SECRET must be at least 32 characters in production." >&2
    exit 1
  fi
  if ! printf '%s' "$EBIO_ENCRYPTION_KEY" | grep -Eq '^[0-9a-fA-F]{64}$'; then
    echo "EBIO_ENCRYPTION_KEY must be exactly 64 hexadecimal characters in production." >&2
    exit 1
  fi
  case "$CRON_SECRET" in
    change-me|replace-with-*|"" )
      echo "Refusing to start with a default CRON_SECRET." >&2
      exit 1
      ;;
  esac
  if [ "${#CRON_SECRET}" -lt 32 ]; then
    echo "CRON_SECRET must be at least 32 characters in production." >&2
    exit 1
  fi
  case "$APP_BASE_DOMAIN" in
    replace-with-*|change-me|"" )
      echo "APP_BASE_DOMAIN must be a real production domain." >&2
      exit 1
      ;;
  esac
fi

echo "→ Applying database migrations..."
npx prisma migrate deploy

echo "→ Backfilling tenant module rows..."
npx tsx scripts/backfill-modules.ts

if [ "${SEED_DB:-false}" = "true" ]; then
  if [ "${NODE_ENV:-production}" = "production" ] && [ "${ALLOW_DESTRUCTIVE_SEED:-false}" != "true" ]; then
    echo "Refusing destructive demo seed in production. Set ALLOW_DESTRUCTIVE_SEED=true only for an intentional disposable environment." >&2
    exit 1
  fi
  echo "→ Seeding demo data (SEED_DB=true)..."
  npx tsx prisma/seed.ts
fi

echo "→ Starting PeopleNexa on port ${PORT:-3000}"
exec node server.js
