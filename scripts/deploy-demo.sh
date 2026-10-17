#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /volume1/docker/lehub-demo
: "${IMAGE_TAG:?Pass the validated image tag}"
export IMAGE_TAG
compose() { docker compose --env-file .env -f compose.yaml "$@"; }
compose config --quiet
compose --profile tools pull app worker migrate seed
compose up -d db
DB_ID="$(compose ps -q db)"
for i in $(seq 1 60); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$DB_ID")"
  [ "$health" = healthy ] && break
  if [ "$i" -eq 60 ]; then echo 'Database did not become healthy'; exit 1; fi
  sleep 2
done
mkdir -p backups
BACKUP="backups/predeploy-$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_RUN_ID:-manual}.dump"
compose stop app worker
on_error() {
  code=$?
  trap - ERR
  set +e
  compose stop app worker
  compose logs --tail=80 app worker
  echo "Deployment failed; app/worker stopped. Backup: $BACKUP"
  echo 'No automatic code rollback after schema migration. Inspect the failure before restarting.'
  exit "$code"
}
trap on_error ERR
compose exec -T db pg_dump -U lehub -d lehub_demo -Fc > "$BACKUP"
test -s "$BACKUP"
compose --profile tools run --rm --no-deps migrate
compose --profile tools run --rm --no-deps seed
DEPLOY_STARTED="$(compose exec -T db psql -U lehub -d lehub_demo -Atc "SELECT extract(epoch from now())::bigint;")"
compose up -d --no-deps app worker
APP_ID="$(compose ps -q app)"
for i in $(seq 1 90); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$APP_ID")"
  [ "$health" = healthy ] && break
  if [ "$i" -eq 90 ]; then echo 'Application did not become healthy'; false; fi
  sleep 2
done
worker_ok=false
for i in $(seq 1 45); do
  if [ "$(compose exec -T db psql -U lehub -d lehub_demo -Atc "SELECT count(*) FROM worker_state WHERE id='worker' AND completed_at >= to_timestamp(${DEPLOY_STARTED}) AND last_error='';")" = 1 ]; then
    worker_ok=true
    break
  fi
  sleep 2
done
[ "$worker_ok" = true ]
# Record only a successfully started release. Do not print secrets from .env.
sed '/^IMAGE_TAG=/d' .env > .env.next
printf '\nIMAGE_TAG=%s\n' "$IMAGE_TAG" >> .env.next
chmod 600 .env.next
mv .env.next .env
trap - ERR
compose ps
echo "Demo deployed: $IMAGE_TAG"
