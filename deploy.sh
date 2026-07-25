#!/usr/bin/env bash
#
# Deploys the production stack to the VPS.
#
# Builds the api (also used by worker) + web images locally — the VPS is a
# small box and building there under a live workload is slow/risky — ships
# them over SSH, recreates the containers, runs pending migrations, and
# health-checks the result. Run from the repo root on the machine you want
# to build on.
#
# .env is never touched by this script: it lives only on the VPS (in
# VPS_DIR, git-ignored) and docker compose reads it there. Local .env is
# irrelevant to what actually starts in production.
#
# Assumes the VPS is already bootstrapped per docs/DEPLOY.md (repo cloned
# to VPS_DIR, .env populated, DNS/TLS in place). This script only handles
# repeat deploys of new code.
#
# Requires: TFT_SSH_PASS env var, sshpass, docker, ssh, scp.
# Usage: ./deploy.sh

set -euo pipefail

VPS_HOST="root@192.227.159.252"
VPS_DIR="/root/tft-traders-signals"
API_DOMAIN="https://api.tfttraders.com"
DASHBOARD_DOMAIN="https://app.tfttraders.com"
API_IMAGE="tft-traders-signals-api:latest"
WEB_IMAGE="tft-traders-signals-web:latest"
# This VPS already runs another site behind nginx-proxy + acme-companion on
# 80/443 (see docs/DEPLOY.md's "shared host" note) — deploy with the prod
# override instead of the plain docker-compose.override.yml, which would
# otherwise try to republish 80/443 and conflict.
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mDEPLOY FAILED: %s\033[0m\n' "$1" >&2; exit 1; }

case "$VPS_HOST$API_DOMAIN$DASHBOARD_DOMAIN" in
  *CHANGE_ME*) fail "edit deploy.sh and fill in VPS_HOST / API_DOMAIN / DASHBOARD_DOMAIN first" ;;
esac

[ -n "${TFT_SSH_PASS:-}" ] || fail "TFT_SSH_PASS is not set"
command -v sshpass >/dev/null 2>&1 || fail "sshpass is required (brew install hudochenkov/sshpass/sshpass)"

ssh_vps() { sshpass -p "$TFT_SSH_PASS" ssh -o StrictHostKeyChecking=no "$VPS_HOST" "$@"; }
scp_vps() { sshpass -p "$TFT_SSH_PASS" scp -o StrictHostKeyChecking=no "$@"; }

step "Checking local branch is main and clean"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || fail "not on main (currently on $BRANCH)"
[ -z "$(git status --porcelain)" ] || fail "working tree has uncommitted changes"

git fetch origin main --quiet
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"
[ "$LOCAL_SHA" = "$REMOTE_SHA" ] || fail "local main ($LOCAL_SHA) differs from origin/main ($REMOTE_SHA) — push or pull first"

step "Building api + web images locally"
# worker shares $API_IMAGE (see docker-compose.yml) — nothing to build for it.
docker compose $COMPOSE_FILES build api web

step "Saving images to $TMP_DIR"
docker save "$API_IMAGE" | gzip > "$TMP_DIR/api.tar.gz"
docker save "$WEB_IMAGE" | gzip > "$TMP_DIR/web.tar.gz"
ls -lh "$TMP_DIR"

step "Shipping images to VPS ($VPS_HOST)"
scp_vps "$TMP_DIR/api.tar.gz" "$TMP_DIR/web.tar.gz" "$VPS_HOST:/root/"

step "Loading images and recreating containers on VPS"
# Runs detached (nohup + disown) so a dropped SSH session doesn't leave the
# recreate half-finished. We poll the remote log instead of relying on the
# foreground SSH session completing.
#
# `up -d` names services explicitly (not `--profile`/all) so the dev-only
# greenmail/webmail containers are never started in production — see
# README's docker-compose.yml comment on those services.
#
# .env is NOT shipped or touched here — it already exists in VPS_DIR from
# initial bootstrap (docs/DEPLOY.md) and docker compose reads it locally on
# the VPS via env_file, independent of whatever's in the local machine's .env.
REMOTE_LOG="/root/deploy-$(date +%s).log"
ssh_vps "nohup bash -c '
  set -e
  cd \"$VPS_DIR\"
  git fetch origin main --quiet
  git checkout main --quiet
  git reset --hard origin/main --quiet
  docker load < /root/api.tar.gz
  docker load < /root/web.tar.gz
  rm -f /root/api.tar.gz /root/web.tar.gz
  docker compose $COMPOSE_FILES up -d postgres redis api worker web reverse-proxy
  docker compose $COMPOSE_FILES exec -T api npm run migrate:up --workspace apps/api
  echo DEPLOY_REMOTE_DONE
' > $REMOTE_LOG 2>&1 < /dev/null & disown"

step "Waiting for remote deploy step to finish (log: $REMOTE_LOG)"
for _ in $(seq 1 60); do
  if ssh_vps "grep -q DEPLOY_REMOTE_DONE $REMOTE_LOG" 2>/dev/null; then
    break
  fi
  if ssh_vps "grep -qi 'error\|Traceback' $REMOTE_LOG" 2>/dev/null; then
    ssh_vps "cat $REMOTE_LOG"
    fail "remote deploy step errored — see log above ($REMOTE_LOG on VPS)"
  fi
  sleep 5
done
ssh_vps "grep -q DEPLOY_REMOTE_DONE $REMOTE_LOG" 2>/dev/null || {
  ssh_vps "cat $REMOTE_LOG" || true
  fail "remote deploy step did not finish within 5 minutes ($REMOTE_LOG on VPS)"
}
ssh_vps "cat $REMOTE_LOG; rm -f $REMOTE_LOG"

step "Waiting for containers to settle"
sleep 8

step "Health-checking $API_DOMAIN and $DASHBOARD_DOMAIN"
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$API_DOMAIN/health/ready" || echo 000)"
# -L: "/" legitimately redirects unauthenticated visitors to /login (via
# /dashboard) — following redirects checks the app actually renders,
# not just that the first hop returned a 3xx.
DASHBOARD_CODE="$(curl -s -L -o /dev/null -w '%{http_code}' --max-time 15 "$DASHBOARD_DOMAIN/" || echo 000)"

if [ "$API_CODE" = "200" ] && [ "$DASHBOARD_CODE" = "200" ]; then
  step "DEPLOY OK — api HTTP $API_CODE, dashboard HTTP $DASHBOARD_CODE"
else
  fail "health check failed — api HTTP $API_CODE, dashboard HTTP $DASHBOARD_CODE (containers may still be starting; check: ssh $VPS_HOST 'cd $VPS_DIR && docker compose ps')"
fi
