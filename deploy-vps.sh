#!/usr/bin/env bash
#
# Deploy the HRMS stack to a single VPS with Docker.
# Usage:
#   ./deploy-vps.sh                    # build + start
#   ./deploy-vps.sh --rebuild          # force rebuild images
#   ./deploy-vps.sh --down             # stop everything
#   ./deploy-vps.sh --logs             # tail logs
#
set -euo pipefail

ENV_FILE=".env.vps"
COMPOSE_FILE="docker-compose.vps.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy from .env.vps.example and set real secrets."
  exit 1
fi

MODE="${1:-up}"
case "$MODE" in
  --down)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
    ;;
  --logs)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs -f
    ;;
  --rebuild)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --force-recreate
    ;;
  up)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
    ;;
  *)
    echo "Unknown option: $MODE"
    exit 2
    ;;
esac

echo "Deployed. nginx: http://<server-ip>/   API: /api   Tenant Hub: /hub/"
