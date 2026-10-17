#!/usr/bin/env bash
set -euo pipefail
cd /volume1/docker/lehub-demo
umask 077
if [ -e .env ]; then echo '.env exists; refusing to overwrite it.'; exit 1; fi
command -v openssl >/dev/null
set -o noclobber
{
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'SETUP_KEY=%s\n' "$(openssl rand -hex 32)"
  printf 'DEMO_ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 24)"
  printf 'BETTER_AUTH_URL=https://lehub-demo.yuss.dev\n'
  printf 'DEMO_PASSWORD=LeHub-Demo-2026!\n'
  printf 'IMAGE_TAG=bootstrap\n'
} > .env
chmod 600 .env
echo '.env created. Set BETTER_AUTH_URL if using another domain.'
