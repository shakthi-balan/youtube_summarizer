#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ] || [ -n "$DIRECT_URL" ]; then
  echo "Running database migrations..."

  if [ "$RESET_DATABASE" = "true" ]; then
    echo "RESET_DATABASE is set, resetting database..."
    prisma db push --force-reset --accept-data-loss
  elif ! prisma migrate deploy; then
    echo "Migration deploy failed, trying db push..."
    prisma db push --accept-data-loss || {
      echo "ERROR: Migration failed. If you need to reset the database, run with RESET_DATABASE=true"
      exit 1
    }
  fi

  echo "Database migrations completed."

  if [ -f "/app/prisma/run-seed.mjs" ]; then
    echo "Seeding security questions..."
    node /app/prisma/run-seed.mjs
  fi
fi

exec node server.js
