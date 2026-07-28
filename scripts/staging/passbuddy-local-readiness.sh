#!/usr/bin/env bash

set -uo pipefail

umask 077

HTTPS_HEALTH_URL="${PASSBUDDY_HTTPS_HEALTH_URL:-https://facewall.oldriver.work/api/health}"
LOCAL_HEALTH_URL="${PASSBUDDY_LOCAL_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PM2_PROCESS_NAME="${PASSBUDDY_PM2_PROCESS_NAME:-facewall}"
PM2_BIN="${PASSBUDDY_PM2_BIN:-pm2}"
PM2_USER="${PASSBUDDY_PM2_USER:-ubuntu}"
PM2_HOME_DIR="${PASSBUDDY_PM2_HOME:-/home/${PM2_USER}/.pm2}"
POSTGRES_HOST="${PASSBUDDY_POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${PASSBUDDY_POSTGRES_PORT:-5432}"
POSTGRES_DATABASE="${PASSBUDDY_POSTGRES_DATABASE:-passbuddy}"
BACKUP_DIR="${PASSBUDDY_BACKUP_DIR:-/var/backups/passbuddy}"
BACKUP_TIMER="${PASSBUDDY_BACKUP_TIMER:-passbuddy-db-backup.timer}"
BACKUP_SERVICE="${PASSBUDDY_BACKUP_SERVICE:-passbuddy-db-backup.service}"
BACKUP_MAX_AGE_SEC="${PASSBUDDY_BACKUP_MAX_AGE_SEC:-129600}"

failures=0
scratch_dir="$(mktemp -d)"

cleanup() {
  rm -rf -- "$scratch_dir"
}
trap cleanup EXIT

log_check() {
  node -e '
    const [check, status, reason] = process.argv.slice(1);
    process.stdout.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "passbuddy.staging.readiness",
      check,
      status,
      reason
    })}\n`);
  ' "$1" "$2" "$3"
}

pass_check() {
  log_check "$1" "pass" "$2"
}

fail_check() {
  failures=$((failures + 1))
  log_check "$1" "fail" "$2"
}

check_health_endpoint() {
  local check_name="$1"
  local target_url="$2"
  local body_file="$scratch_dir/${check_name}.json"
  local status_code

  status_code="$(
    curl \
      --silent \
      --show-error \
      --connect-timeout 3 \
      --max-time 8 \
      --output "$body_file" \
      --write-out "%{http_code}" \
      "$target_url" 2>/dev/null
  )"
  if [[ "$status_code" != "200" ]]; then
    fail_check "$check_name" "http_status_not_ready"
    return
  fi

  if node -e '
    const fs = require("node:fs");
    const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (
      body?.status !== "ready" ||
      body?.checks?.application !== "up" ||
      body?.checks?.database !== "up"
    ) {
      process.exit(1);
    }
  ' "$body_file" 2>/dev/null; then
    pass_check "$check_name" "ready"
  else
    fail_check "$check_name" "invalid_or_unready_payload"
  fi
}

check_pm2() {
  if timeout 5s runuser --user "$PM2_USER" -- \
    env PM2_HOME="$PM2_HOME_DIR" "$PM2_BIN" jlist 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      const expectedName = process.argv[1];
      const processes = JSON.parse(input);
      const match = processes.find((item) => item?.name === expectedName);
      process.exit(match?.pm2_env?.status === "online" ? 0 : 1);
    });
  ' "$PM2_PROCESS_NAME" 2>/dev/null; then
    pass_check "pm2" "process_online"
  else
    fail_check "pm2" "process_not_online"
  fi
}

check_postgres() {
  if timeout 5s pg_isready \
    --host "$POSTGRES_HOST" \
    --port "$POSTGRES_PORT" \
    --dbname "$POSTGRES_DATABASE" \
    --timeout 3 >/dev/null 2>&1; then
    pass_check "postgres" "accepting_connections"
  else
    fail_check "postgres" "not_ready"
  fi
}

check_backup_timer() {
  local timer_enabled
  local timer_active
  local service_result

  timer_enabled="$(timeout 5s systemctl is-enabled "$BACKUP_TIMER" 2>/dev/null || true)"
  timer_active="$(timeout 5s systemctl is-active "$BACKUP_TIMER" 2>/dev/null || true)"
  service_result="$(
    timeout 5s systemctl show "$BACKUP_SERVICE" \
      --property=Result \
      --value 2>/dev/null || true
  )"

  if [[ "$timer_enabled" == "enabled" && "$timer_active" == "active" ]]; then
    pass_check "backup_timer" "enabled_and_active"
  else
    fail_check "backup_timer" "timer_not_active"
  fi

  if [[ "$service_result" == "success" ]]; then
    pass_check "backup_service" "last_run_success"
  else
    fail_check "backup_service" "last_run_not_successful"
  fi
}

check_backup_freshness() {
  local latest_dump
  local checksum_file
  local modified_epoch
  local now_epoch
  local age_sec

  latest_dump="$(
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "*.dump" \
      -printf "%T@ %p\n" 2>/dev/null |
      sort -nr |
      head -n 1 |
      cut -d" " -f2-
  )"
  if [[ -z "$latest_dump" || ! -f "$latest_dump" ]]; then
    fail_check "backup_freshness" "backup_missing"
    return
  fi

  modified_epoch="$(stat -c "%Y" "$latest_dump" 2>/dev/null || printf "0")"
  now_epoch="$(date +%s)"
  age_sec=$((now_epoch - modified_epoch))
  if (( age_sec < 0 || age_sec > BACKUP_MAX_AGE_SEC )); then
    fail_check "backup_freshness" "backup_stale"
  else
    pass_check "backup_freshness" "backup_within_max_age"
  fi

  checksum_file="${latest_dump}.sha256"
  if [[ ! -f "$checksum_file" ]]; then
    fail_check "backup_checksum" "checksum_missing"
    return
  fi

  if (
    cd "$BACKUP_DIR" &&
      timeout 15s sha256sum --check "$(basename "$checksum_file")" \
        >/dev/null 2>&1
  ); then
    pass_check "backup_checksum" "verified"
  else
    fail_check "backup_checksum" "verification_failed"
  fi
}

check_health_endpoint "https_health" "$HTTPS_HEALTH_URL"
check_health_endpoint "local_health" "$LOCAL_HEALTH_URL"
check_pm2
check_postgres
check_backup_timer
check_backup_freshness

if (( failures > 0 )); then
  log_check "summary" "fail" "one_or_more_checks_failed"
  exit 1
fi

log_check "summary" "pass" "all_checks_passed"
