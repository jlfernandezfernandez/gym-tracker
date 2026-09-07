#!/usr/bin/env bash
set -euo pipefail

APP_BASE=${APP_BASE:-http://127.0.0.1:8000}
MCP_BASE=${MCP_BASE:-http://127.0.0.1:8001}
CURL_TIMEOUT=${CURL_TIMEOUT:-5}

usage() {
  echo "usage: diagnose-local.sh [repo-path] [local|production]" >&2
  echo "or set GYM_TRACKER_REPO and optional COMPOSE_FILE" >&2
  exit 1
}

require_bin() {
  local bin_name=$1
  if ! command -v "$bin_name" >/dev/null 2>&1; then
    echo "missing required command: $bin_name" >&2
    exit 1
  fi
}

require_docker_compose_v2() {
  if ! docker compose version >/dev/null 2>&1; then
    echo "missing required command: docker compose v2" >&2
    exit 1
  fi
}

validate_base_url() {
  local label=$1
  local base_url=$2

  if [[ "$base_url" == *\?* || "$base_url" == *\#* || "$base_url" =~ ://[^/@]+@ ]]; then
    echo "unsafe URL configured for $label" >&2
    exit 1
  fi
}

resolve_repo_and_mode() {
  local first_arg=${1:-}
  local second_arg=${2:-}

  MODE=local
  if [[ -n "$second_arg" ]]; then
    MODE=$second_arg
  elif [[ "$first_arg" == "local" || "$first_arg" == "production" ]]; then
    MODE=$first_arg
    first_arg=
  fi

  if [[ "$MODE" != "local" && "$MODE" != "production" ]]; then
    usage
  fi

  REPO_DIR=${first_arg:-${GYM_TRACKER_REPO:-$PWD}}
  if [[ ! -d "$REPO_DIR" ]]; then
    echo "repo path does not exist" >&2
    exit 1
  fi
}

resolve_compose_file() {
  if [[ -n "${COMPOSE_FILE:-}" ]]; then
    COMPOSE_PATH=$COMPOSE_FILE
  elif [[ "$MODE" == "production" ]]; then
    COMPOSE_PATH=compose.production.yml
  else
    COMPOSE_PATH=docker-compose.yaml
  fi

  if [[ "$COMPOSE_PATH" != /* ]]; then
    COMPOSE_PATH="$REPO_DIR/$COMPOSE_PATH"
  fi

  if [[ ! -f "$COMPOSE_PATH" ]]; then
    echo "compose file not found" >&2
    exit 1
  fi
}

parse_json_status() {
  local label=$1
  local expected=$2

  python3 -c '
import json
import sys

label = sys.argv[1]
expected = sys.argv[2]

try:
    payload = json.load(sys.stdin)
except json.JSONDecodeError:
    print(f"{label}: invalid JSON response", file=sys.stderr)
    raise SystemExit(1)

if not isinstance(payload, dict):
  print(f"{label}: invalid JSON response", file=sys.stderr)
  raise SystemExit(1)

status = payload.get("status")
if status != expected:
    print(f"{label}: unexpected status", file=sys.stderr)
    raise SystemExit(1)

print(f"{label}: {status}")
' "$label" "$expected"
}

probe_json_status() {
  local label=$1
  local url=$2
  local expected=$3
  local body

  if ! body=$(curl --silent --fail --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null); then
    echo "$label: unavailable" >&2
    exit 1
  fi

  if ! printf '%s' "$body" | parse_json_status "$label" "$expected"; then
    exit 1
  fi
}

require_bin docker
require_bin curl
require_bin python3
require_docker_compose_v2
validate_base_url app "$APP_BASE"
validate_base_url mcp "$MCP_BASE"
resolve_repo_and_mode "${1:-}" "${2:-}"
resolve_compose_file

cd "$REPO_DIR"

echo "Compose services"
docker compose -f "$COMPOSE_PATH" ps
echo
probe_json_status "app /health" "$APP_BASE/health" "ok"
probe_json_status "app /ready" "$APP_BASE/ready" "ready"
probe_json_status "mcp /health" "$MCP_BASE/health" "ok"
probe_json_status "mcp /ready" "$MCP_BASE/ready" "ready"
echo
echo "Diagnosis complete: local app and MCP endpoints are healthy and ready."
