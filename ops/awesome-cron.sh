#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

die() { echo "awesome: $*" >&2; exit 1; }
deploy_root="${1:-}"
app_port="${2:-}"
mode="${3:-sync}"
rollback_id="${4:-}"
wait_seconds="${AWESOME_LOCK_WAIT_SECONDS:-90}"
[[ "$deploy_root" =~ ^/[A-Za-z0-9._/-]+$ && "$deploy_root" != / && ${#deploy_root} -gt 5 ]] || die 'invalid deploy root'
[[ "$app_port" =~ ^[0-9]{2,5}$ ]] && (( app_port>=1024 && app_port<=65535 )) || die 'invalid port'
[[ "$mode" == sync || "$mode" == retry || "$mode" == dry-run || "$mode" == health || "$mode" == rollback ]] || die 'invalid mode'
[[ "$mode" != rollback || "$rollback_id" =~ ^[1-9][0-9]{0,14}$ ]] || die 'invalid rollback run'
[[ "$wait_seconds" =~ ^[1-9][0-9]{0,2}$ ]] && (( wait_seconds<=300 )) || die 'lock wait must be 1..300 seconds'
command -v flock >/dev/null || die 'flock is required'
shared_dir="$deploy_root/shared"
[[ -d "$shared_dir" ]] || die 'shared directory missing'
state_dir="$shared_dir/health"
mkdir -p "$state_dir"
chmod 700 "$state_dir"
pending="$state_dir/awesome.pending"
active="$state_dir/awesome.active"
state="$state_dir/awesome.state"
alert_file="$state_dir/awesome.alert"
body_file=''
claimed=false
alert_ready=false
max_attempts=8
log() {
  echo "awesome: $* (mode $mode)" >&2
  command -v logger >/dev/null && logger -t kimi-builders-awesome -- "$* (mode $mode)" || true
}
# A pending request coalesces repeated invocations. A request arriving during
# an active run survives that run; the API's digest comparison is idempotent.
if [[ "$mode" == sync ]]; then
  printf '0\n' > "$pending.$$"
  mv -f -- "$pending.$$" "$pending"
fi
# Serializing queue ownership before the deployment lock avoids two runners
# publishing together. Deep health takes only the deployment lock.
exec 8>"$shared_dir/awesome-job.lock"
if ! flock -w "$wait_seconds" 8; then
  log 'deferred: runner busy; sync request retained for retry'
  exit 75
fi
cleanup() {
  if [[ "$claimed" == true && -f "$active" ]]; then
    ln "$active" "$pending" 2>/dev/null || true
    rm -f -- "$active"
  fi
  [[ -z "$body_file" ]] || rm -f -- "$body_file"
}
trap cleanup EXIT
# Recover a request interrupted by an uncatchable process termination.
if [[ -f "$active" ]]; then
  ln "$active" "$pending" 2>/dev/null || true
  rm -f -- "$active"
fi
flush_alert() {
  [[ "$alert_ready" == true && -f "$alert_file" ]] || return 0
  if [[ -n "${HEALTH_ALERT_WEBHOOK_URL:-}" ]]; then
    local alert
    alert="$(AWESOME_ALERT_MESSAGE="$(cat "$alert_file")" node -e 'process.stdout.write(JSON.stringify({service:"kimi.builders",check:"awesome",text:process.env.AWESOME_ALERT_MESSAGE}))')"
    if ! curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
      -H 'Content-Type: application/json' --data-binary "$alert" "$HEALTH_ALERT_WEBHOOK_URL" >/dev/null; then
      log 'alert delivery failed; retained for next retry or health check'
      return 0
    fi
  fi
  rm -f -- "$alert_file"
}
record() {
  local status="$1" reason="$2" previous
  log "$status: $reason"
  [[ "$mode" != dry-run ]] || return 0
  previous="$(cat "$state" 2>/dev/null || true)"
  if [[ "$previous" != "$status" ]]; then
    printf '%s\n' "$status" > "$state.$$"
    mv -f -- "$state.$$" "$state"
    # Never source a release environment while deployment owns its lock.
    # An undelivered failure is preserved until a runner can load it safely.
    if [[ ! -f "$alert_file" ]]; then
      printf 'kimi.builders awesome %s: %s\n' "$status" "$reason" > "$alert_file"
    fi
  fi
  flush_alert
}
if [[ "$mode" == sync || "$mode" == retry ]]; then
  if [[ ! -f "$pending" ]]; then log 'idle: no pending sync'; exit 0; fi
  attempts="$(cat "$pending")"
  [[ "$attempts" =~ ^[0-8]$ ]] || die 'invalid pending attempt count'
  if (( attempts>=max_attempts )); then
    record failed 'retry budget exhausted; inspect logs then run sync to re-arm'
    exit 1
  fi
  mv -f -- "$pending" "$active"
  claimed=true
  printf '%s\n' "$((attempts+1))" > "$active"
fi
exec 9>"$shared_dir/deploy-health.lock"
if ! flock -w "$wait_seconds" 9; then
  record deferred 'deployment/health lock timeout; pending sync retries every 15 minutes (8 attempts maximum); manual sync re-arms'
  exit 75
fi
current="$(readlink -f "$deploy_root/current")"
version="$(basename "$current")"
[[ "$current" == "$deploy_root/releases/"* && "$version" =~ ^[0-9a-f]{40}$ ]] || die 'invalid current release'
[[ -f "$current/.env.production" ]] || die 'release environment missing'
set -a
source "$current/.env.production"
set +a
[[ ${#CRON_SECRET} -ge 32 ]] || die 'cron secret missing or too short'
[[ -z "${HEALTH_ALERT_WEBHOOK_URL:-}" || "$HEALTH_ALERT_WEBHOOK_URL" == https://* ]] || die 'invalid alert webhook'
alert_ready=true
flush_alert
if [[ ! -f "$current/AWESOME_SYNC_ENABLED" ]]; then
  record deferred 'release does not support Awesome sync; request retained; restore a capable release and run sync'
  exit 75
fi
request_method=POST
payload='{}'
if [[ "$mode" == health ]]; then request_method=GET; payload=''; fi
if [[ "$mode" == dry-run ]]; then payload='{"dryRun":true}'; fi
if [[ "$mode" == rollback ]]; then payload="{\"rollbackRunId\":$rollback_id}"; fi
body_file="$(mktemp)"
status=ok
# Passing authorization in stdin avoids credentials in curl arguments/logs.
if ! curl --fail --silent --show-error --connect-timeout 2 --max-time 120 \
  --output "$body_file" --config - <<EOF
url = "http://127.0.0.1:$app_port/api/cron/awesome-sync"
request = "$request_method"
header = "Authorization: Bearer $CRON_SECRET"
header = "Content-Type: application/json"
$(if [[ -n "$payload" ]]; then printf 'data = "%s"\n' "${payload//\"/\\\"}"; fi)
EOF
then status=failed; fi
if [[ "$status" == ok ]] && ! node - "$body_file" <<'JS'
const fs=require('node:fs');
try {
  const b=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if (b.ok!==true) process.exit(1);
  console.log(JSON.stringify({service:'awesome',ok:true,runId:b.runId,revision:b.revision,counts:b.counts,lastSuccess:b.lastSuccess}));
} catch {process.exit(1);}
JS
then status=failed; fi
if [[ "$status" != ok ]]; then record failed 'endpoint failed; pending sync retained for bounded retry'; exit 1; fi
if [[ "$claimed" == true ]]; then rm -f -- "$active"; claimed=false; fi
if [[ -f "$pending" ]]; then
  if [[ "$(cat "$pending")" == 8 ]]; then record failed 'retry budget exhausted; run sync after diagnosis'; exit 1; fi
  record deferred 'pending sync remains; retry will execute it'; exit 75
fi
record ok 'request completed; no pending sync'
