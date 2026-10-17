#!/usr/bin/env bash
set -euo pipefail
umask 077
WEB_DIR="${WEB_DIR:-/volume1/docker/web}"
cd "$WEB_DIR"
mkdir -p lehub
if [ -e lehub/postgres.env ] || [ -e lehub/app.env ]; then
  echo 'LeHub configuration already exists; refusing to overwrite it.'
  exit 1
fi
command -v openssl >/dev/null
db_password="$(openssl rand -hex 32)"
auth_secret="$(openssl rand -hex 32)"
setup_key="$(openssl rand -hex 32)"
set -o noclobber
{
  printf 'POSTGRES_USER=lehub\nPOSTGRES_DB=lehub_demo\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$db_password"
} > lehub/postgres.env
{
  printf 'DATABASE_URL=postgresql://lehub:%s@lehub-postgres:5432/lehub_demo\n' "$db_password"
  printf 'BETTER_AUTH_URL=https://lehub-demo.yuss.dev\n'
  printf 'BETTER_AUTH_SECRET=%s\n' "$auth_secret"
  printf 'SETUP_KEY=%s\n' "$setup_key"
  printf 'DOCUMENTS_DIR=/app/data/documents\n'
} > lehub/app.env
chmod 600 lehub/postgres.env lehub/app.env
echo 'LeHub configuration created. Existing public-sites .env was not modified.'
