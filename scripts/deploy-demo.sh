#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "${WEB_DIR:-/volume1/docker/web}"
: "${LEHUB_IMAGE_TAG:?Pass the validated image tag}"
export LEHUB_IMAGE_TAG
# The existing OneTask workflow obtains this value the same way. Do not log it.
if [ -z "${ONETASK_POSTGRES_PASSWORD:-}" ]; then
  ONETASK_POSTGRES_PASSWORD="$(docker inspect --format='{{range .Config.Env}}{{println .}}{{end}}' onetask-postgres | sed -n 's/^POSTGRES_PASSWORD=//p' | head -n 1)"
fi
: "${ONETASK_POSTGRES_PASSWORD:?Existing OneTask PostgreSQL password unavailable}"
export ONETASK_POSTGRES_PASSWORD
compose() { docker compose --env-file /dev/null -p public-sites -f docker-compose.yml "$@"; }
compose config --quiet
compose --profile lehub-tools pull lehub lehub-worker lehub-migrate
compose up -d lehub-postgres
DB_ID="$(compose ps -q lehub-postgres)"
for i in $(seq 1 60); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$DB_ID")"
  [ "$health" = healthy ] && break
  if [ "$i" -eq 60 ]; then echo 'Database did not become healthy'; exit 1; fi
  sleep 2
done
mkdir -p lehub/backups
BACKUP="lehub/backups/predeploy-$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_RUN_ID:-manual}.dump"
compose stop lehub lehub-worker
on_error() {
  code=$?
  trap - ERR
  set +e
  compose stop lehub lehub-worker
  compose logs --tail=80 lehub lehub-worker
  echo "Deployment failed; app/worker stopped. Backup: $BACKUP"
  echo 'No automatic code rollback after schema migration. Inspect the failure before restarting.'
  exit "$code"
}
trap on_error ERR
compose exec -T lehub-postgres pg_dump -U lehub -d lehub_demo -Fc > "$BACKUP"
test -s "$BACKUP"
compose --profile lehub-tools run --rm --no-deps lehub-migrate
DEPLOY_STARTED="$(compose exec -T lehub-postgres psql -U lehub -d lehub_demo -Atc "SELECT extract(epoch from now())::bigint;")"
compose up -d --no-deps lehub lehub-worker
APP_ID="$(compose ps -q lehub)"
for i in $(seq 1 90); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$APP_ID")"
  [ "$health" = healthy ] && break
  if [ "$i" -eq 90 ]; then echo 'Application did not become healthy'; false; fi
  sleep 2
done
worker_ok=false
for i in $(seq 1 45); do
  if [ "$(compose exec -T lehub-postgres psql -U lehub -d lehub_demo -Atc "SELECT count(*) FROM worker_state WHERE id='worker' AND completed_at >= to_timestamp(${DEPLOY_STARTED}) AND last_error='';")" = 1 ]; then
    worker_ok=true
    break
  fi
  sleep 2
done
[ "$worker_ok" = true ]
# Audit only: Compose defaults to the latest tag published after this step.
printf '%s\n' "$LEHUB_IMAGE_TAG" > lehub/deployed-image.txt
trap - ERR
compose ps lehub lehub-worker lehub-postgres
unset ONETASK_POSTGRES_PASSWORD
echo "LeHub deployed in public-sites: $LEHUB_IMAGE_TAG"
