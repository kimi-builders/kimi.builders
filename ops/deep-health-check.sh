#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  echo "deep-health: $*" >&2
  exit 1
}

deploy_root="${1:-}"
app_port="${2:-}"
[[ "$deploy_root" == /* && "$deploy_root" != "/" && ${#deploy_root} -gt 5 ]] ||
  die "DEPLOY_PATH must be a safe absolute path"
[[ "$deploy_root" =~ ^[A-Za-z0-9._/-]+$ ]] ||
  die "DEPLOY_PATH contains unsupported characters"
deploy_root="$(cd "$deploy_root" && pwd -P)" || die "DEPLOY_PATH is unavailable"

shared_dir="$deploy_root/shared"
state_dir="$shared_dir/health"
state_file="$state_dir/deep-health.state"
verifier="$shared_dir/verify-deploy-state.mjs"
lock_file="$shared_dir/deploy-health.lock"

command -v flock >/dev/null 2>&1 || die "flock is not installed or not on PATH"

# Skip rather than alert while deploy-release.sh owns the switch window. Once
# locked, current and its immutable release environment are one snapshot.
exec 9>"$lock_file"
flock --nonblock 9 || exit 0

[[ -f "$verifier" ]] || die "$verifier is missing"
[[ "$app_port" =~ ^[0-9]{2,5}$ ]] || die "APP_PORT is invalid"
(( app_port >= 1024 && app_port <= 65535 )) || die "APP_PORT is out of range"
current_release="$(readlink -f "$deploy_root/current" || true)"
expected_version="$(basename "$current_release")"
[[ "$current_release" == "$deploy_root/releases/"* &&
   "$expected_version" =~ ^[0-9a-f]{40}$ ]] ||
  die "current release is invalid"
runtime_env="$current_release/.env.production"
[[ -f "$runtime_env" ]] || die "$runtime_env is missing"

set -a
source "$runtime_env"
set +a

cron_secret="${CRON_SECRET:-}"
alert_webhook="${HEALTH_ALERT_WEBHOOK_URL:-}"
[[ ${#cron_secret} -ge 32 ]] || die "CRON_SECRET is missing or too short"
[[ -z "$alert_webhook" || "$alert_webhook" =~ ^https:// ]] ||
  die "HEALTH_ALERT_WEBHOOK_URL must use https"

mkdir -p "$state_dir"
chmod 700 "$state_dir"
previous_state=""
if [[ -f "$state_file" ]]; then
  previous_state="$(<"$state_file")"
fi

write_state() {
  local value="$1"
  local next_state="$state_file.$$"
  printf '%s\n' "$value" > "$next_state"
  chmod 600 "$next_state"
  mv -f -- "$next_state" "$state_file"
}

notify_transition() {
  local status="$1"
  local message="kimi.builders deep health $status on $(hostname) (release $expected_version)"
  if command -v logger >/dev/null 2>&1; then
    logger -t kimi-builders-deep-health -- "$message" || true
  fi
  echo "deep-health: $message" >&2
  [[ -n "$alert_webhook" ]] || return 0
  local payload
  payload="$(HEALTH_MESSAGE="$message" HEALTH_STATUS="$status" node -e '
    process.stdout.write(JSON.stringify({
      service: "kimi.builders",
      check: "deep-health",
      status: process.env.HEALTH_STATUS,
      text: process.env.HEALTH_MESSAGE,
    }));
  ')"
  curl --fail --silent --show-error \
    --connect-timeout 2 --max-time 5 \
    -H 'Content-Type: application/json' \
    --data-binary "$payload" \
    "$alert_webhook" >/dev/null
}

body=""
if body="$(curl --fail --silent --show-error \
  --connect-timeout 2 --max-time 5 \
  -H "Authorization: Bearer $cron_secret" \
  "http://127.0.0.1:${app_port}/api/health/deep")" &&
  printf '%s' "$body" | node "$verifier" deep-health "$expected_version"; then
  if [[ -n "$previous_state" && "$previous_state" != "healthy" ]]; then
    if notify_transition "recovered"; then
      write_state "healthy"
    else
      write_state "recovery-alert-pending"
    fi
  else
    write_state "healthy"
  fi
  exit 0
fi

next_state="failed"
if [[ "$previous_state" != "failed" ]]; then
  if ! notify_transition "failed"; then
    next_state="failure-alert-pending"
  fi
fi
write_state "$next_state"
exit 1
