#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
SCRIPT="$ROOT_DIR/scripts/diagnose-local.sh"

if [[ ! -x "$SCRIPT" ]]; then
  echo "missing executable script: $SCRIPT" >&2
  exit 1
fi

tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_exit_code() {
  local actual=$1
  local expected=$2
  local context=$3
  if [[ "$actual" != "$expected" ]]; then
    fail "$context: expected exit code $expected, got $actual"
  fi
}

assert_nonzero_exit_code() {
  local actual=$1
  local context=$2
  if [[ "$actual" == "0" ]]; then
    fail "$context: expected non-zero exit code"
  fi
}

assert_contains() {
  local haystack=$1
  local needle=$2
  local context=$3
  if ! grep -Fq "$needle" <<<"$haystack"; then
    fail "$context: missing expected text: $needle"
  fi
}

assert_no_secrets() {
  local output=$1
  if grep -Eq 'COACH_API_KEY|TELEGRAM_BOT_TOKEN|POSTGRES_PASSWORD|DATABASE_URL|\.env|secret-token|user:pass|token=' <<<"$output"; then
    echo "script leaked sensitive or config details" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi
}

run_capture() {
  local output_file=$1
  shift
  set +e
  "$@" >"$output_file" 2>&1
  local exit_code=$?
  set -e
  printf '%s' "$exit_code"
}

make_repo() {
  local repo_dir=$1
  mkdir -p "$repo_dir"
  : >"$repo_dir/docker-compose.yaml"
  : >"$repo_dir/compose.production.yml"
  : >"$repo_dir/custom.compose.yml"
}

make_copied_skill() {
  local skill_dir=$1
  mkdir -p "$skill_dir"
  cp -R "$ROOT_DIR/." "$skill_dir/"
}

write_docker_ok() {
  local bin_dir=$1
  cat >"$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
log_file=${DOCKER_LOG_FILE:-}
if [[ -n "$log_file" ]]; then
  printf '%s|%s\n' "$PWD" "$*" >>"$log_file"
fi
if [[ "$1" == "compose" && "$2" == "version" ]]; then
  printf 'Docker Compose version v2.39.4\n'
  exit 0
fi
if [[ "$1" == "compose" ]]; then
  shift
  if [[ "$1" == "-f" ]]; then
    compose_file=$2
    shift 2
  fi
  if [[ "$1" == "ps" ]]; then
    printf 'NAME                STATUS\n'
    printf 'gym-tracker-app     running\n'
    printf 'gym-tracker-mcp     running\n'
    printf 'gym-tracker-db      running\n'
    exit 0
  fi
  printf 'unexpected docker compose args: %s %s\n' "${compose_file:-default}" "$*" >&2
  exit 2
fi
echo "unexpected docker args: $*" >&2
exit 2
EOF
  chmod +x "$bin_dir/docker"
}

write_docker_no_compose_v2() {
  local bin_dir=$1
  cat >"$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "compose" && "$2" == "version" ]]; then
  echo 'docker: compose is not a docker command' >&2
  exit 1
fi
echo "unexpected docker args: $*" >&2
exit 2
EOF
  chmod +x "$bin_dir/docker"
}

write_curl_ok_whitespace() {
  local bin_dir=$1
  cat >"$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
url=${*: -1}
case "$url" in
  http://127.0.0.1:8000/health) printf '{  "status" : "ok" }\n' ;;
  http://127.0.0.1:8000/ready) printf '{\n  "status" : "ready"\n}\n' ;;
  http://127.0.0.1:8001/health) printf '{"status" : "ok"}\n' ;;
  http://127.0.0.1:8001/ready) printf '{ "status" : "ready" }\n' ;;
  *)
    echo 'unexpected curl url' >&2
    exit 3
    ;;
esac
EOF
  chmod +x "$bin_dir/curl"
}

write_curl_invalid_json() {
  local bin_dir=$1
  cat >"$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
url=${*: -1}
case "$url" in
  http://127.0.0.1:8000/health) printf '{"status":"ok"}\n' ;;
  http://127.0.0.1:8000/ready) printf '{"status": ready}\n' ;;
  http://127.0.0.1:8001/health) printf '{"status":"ok"}\n' ;;
  http://127.0.0.1:8001/ready) printf '{"status":"ready"}\n' ;;
  *)
    echo 'unexpected curl url' >&2
    exit 3
    ;;
esac
EOF
  chmod +x "$bin_dir/curl"
}

write_curl_failed_readiness() {
  local bin_dir=$1
  cat >"$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
url=${*: -1}
case "$url" in
  http://127.0.0.1:8000/health) printf '{"status":"ok"}\n' ;;
  http://127.0.0.1:8000/ready) printf '{"status":"down"}\n' ;;
  http://127.0.0.1:8001/health) printf '{"status":"ok"}\n' ;;
  http://127.0.0.1:8001/ready) printf '{"status":"ready"}\n' ;;
  *)
    echo 'unexpected curl url' >&2
    exit 3
    ;;
esac
EOF
  chmod +x "$bin_dir/curl"
}

python_dir="$tmp_dir/python-bin"
mkdir -p "$python_dir"
ln -s /usr/bin/python3 "$python_dir/python3"

mock_bin_ok="$tmp_dir/mock-bin-ok"
mkdir -p "$mock_bin_ok"
write_docker_ok "$mock_bin_ok"
write_curl_ok_whitespace "$mock_bin_ok"

repo_dir="$tmp_dir/repo"
make_repo "$repo_dir"

copied_skill_dir="$tmp_dir/copied-skill"
make_copied_skill "$copied_skill_dir"

docker_log="$tmp_dir/docker.log"
output_file="$tmp_dir/output.txt"
exit_code=$(run_capture "$output_file" env PATH="$mock_bin_ok:$python_dir:/bin" DOCKER_LOG_FILE="$docker_log" /bin/bash "$copied_skill_dir/scripts/diagnose-local.sh" "$repo_dir" production)
output=$(cat "$output_file")

assert_exit_code "$exit_code" "0" 'copied skill production check'
assert_contains "$output" 'Compose services' 'copied skill production check'
assert_contains "$output" 'app /health: ok' 'copied skill production check'
assert_contains "$output" 'app /ready: ready' 'copied skill production check'
assert_contains "$output" 'mcp /health: ok' 'copied skill production check'
assert_contains "$output" 'mcp /ready: ready' 'copied skill production check'
assert_contains "$output" 'Diagnosis complete: local app and MCP endpoints are healthy and ready.' 'copied skill production check'
assert_contains "$(cat "$docker_log")" "$repo_dir|compose -f $repo_dir/compose.production.yml ps" 'copied skill production check'
assert_no_secrets "$output"

compose_log="$tmp_dir/compose.log"
exit_code=$(run_capture "$output_file" env PATH="$mock_bin_ok:$python_dir:/bin" DOCKER_LOG_FILE="$compose_log" GYM_TRACKER_REPO="$repo_dir" COMPOSE_FILE=custom.compose.yml /bin/bash "$SCRIPT")
output=$(cat "$output_file")

assert_exit_code "$exit_code" "0" 'custom compose file check'
assert_contains "$(cat "$compose_log")" "$repo_dir|compose -f $repo_dir/custom.compose.yml ps" 'custom compose file check'
assert_no_secrets "$output"

mock_bin_invalid_json="$tmp_dir/mock-bin-invalid-json"
mkdir -p "$mock_bin_invalid_json"
write_docker_ok "$mock_bin_invalid_json"
write_curl_invalid_json "$mock_bin_invalid_json"

exit_code=$(run_capture "$output_file" env PATH="$mock_bin_invalid_json:$python_dir:/bin" GYM_TRACKER_REPO="$repo_dir" /bin/bash "$SCRIPT")
output=$(cat "$output_file")

assert_nonzero_exit_code "$exit_code" 'invalid JSON check'
assert_contains "$output" 'app /ready: invalid JSON response' 'invalid JSON check'
assert_no_secrets "$output"

mock_bin_non_object_json="$tmp_dir/mock-bin-non-object-json"
mkdir -p "$mock_bin_non_object_json"
write_docker_ok "$mock_bin_non_object_json"
cat >"$mock_bin_non_object_json/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
url=${*: -1}
case "$url" in
  http://127.0.0.1:8000/health) printf '{"status":"ok"}\n' ;;
  http://127.0.0.1:8000/ready) printf '["ready"]\n' ;;
  http://127.0.0.1:8001/health) printf '{"status":"ok"}\n' ;;
  http://127.0.0.1:8001/ready) printf '{"status":"ready"}\n' ;;
  *)
    echo 'unexpected curl url' >&2
    exit 3
    ;;
esac
EOF
chmod +x "$mock_bin_non_object_json/curl"

exit_code=$(run_capture "$output_file" env PATH="$mock_bin_non_object_json:$python_dir:/bin" GYM_TRACKER_REPO="$repo_dir" /bin/bash "$SCRIPT")
output=$(cat "$output_file")

assert_nonzero_exit_code "$exit_code" 'non-object JSON check'
assert_contains "$output" 'app /ready: invalid JSON response' 'non-object JSON check'
if grep -Fq 'Traceback' <<<"$output"; then
  fail 'non-object JSON check: unexpected Python traceback in output'
fi
assert_no_secrets "$output"

mock_bin_failed_ready="$tmp_dir/mock-bin-failed-ready"
mkdir -p "$mock_bin_failed_ready"
write_docker_ok "$mock_bin_failed_ready"
write_curl_failed_readiness "$mock_bin_failed_ready"

exit_code=$(run_capture "$output_file" env PATH="$mock_bin_failed_ready:$python_dir:/bin" GYM_TRACKER_REPO="$repo_dir" /bin/bash "$SCRIPT")
output=$(cat "$output_file")

assert_nonzero_exit_code "$exit_code" 'failed readiness check'
assert_contains "$output" 'app /ready: unexpected status' 'failed readiness check'
assert_no_secrets "$output"

mock_bin_no_compose="$tmp_dir/mock-bin-no-compose"
mkdir -p "$mock_bin_no_compose"
write_docker_no_compose_v2 "$mock_bin_no_compose"
write_curl_ok_whitespace "$mock_bin_no_compose"

exit_code=$(run_capture "$output_file" env PATH="$mock_bin_no_compose:$python_dir:/bin" GYM_TRACKER_REPO="$repo_dir" /bin/bash "$SCRIPT")
output=$(cat "$output_file")

assert_nonzero_exit_code "$exit_code" 'missing docker compose v2 check'
assert_contains "$output" 'missing required command: docker compose v2' 'missing docker compose v2 check'
assert_no_secrets "$output"

mock_bin_no_curl="$tmp_dir/mock-bin-no-curl"
mkdir -p "$mock_bin_no_curl"
write_docker_ok "$mock_bin_no_curl"

exit_code=$(run_capture "$output_file" env PATH="$mock_bin_no_curl:$python_dir:/bin" GYM_TRACKER_REPO="$repo_dir" /bin/bash "$SCRIPT")
output=$(cat "$output_file")

assert_nonzero_exit_code "$exit_code" 'missing curl check'
assert_contains "$output" 'missing required command: curl' 'missing curl check'
assert_no_secrets "$output"

exit_code=$(run_capture "$output_file" env PATH="$mock_bin_ok:$python_dir:/bin" GYM_TRACKER_REPO="$repo_dir" APP_BASE='http://user:pass@127.0.0.1:8000?token=secret-token' /bin/bash "$SCRIPT")
output=$(cat "$output_file")

assert_nonzero_exit_code "$exit_code" 'unsafe URL check'
assert_contains "$output" 'unsafe URL configured for app' 'unsafe URL check'
assert_no_secrets "$output"

printf 'PASS: diagnose-local.sh tests succeeded\n'