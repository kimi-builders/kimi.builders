#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  echo "deploy: $*" >&2
  exit 1
}

deploy_root="${1:-}"
release="${2:-}"
app_name="${3:-}"
app_port="${4:-}"
health_path="${5:-/api/health}"
keep_releases="${6:-5}"
mode="${7:-deploy}"

[[ "$deploy_root" == /* && "$deploy_root" != "/" && ${#deploy_root} -gt 5 ]] ||
  die "DEPLOY_PATH must be a safe absolute path"
[[ "$deploy_root" =~ ^[A-Za-z0-9._/-]+$ ]] ||
  die "DEPLOY_PATH contains unsupported characters"
[[ "$release" =~ ^[0-9a-f]{40}$ ]] || die "release must be a full git SHA"
[[ "$app_name" =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid PM2 app name"
[[ "$app_port" =~ ^[0-9]{2,5}$ ]] || die "invalid application port"
(( app_port >= 1024 && app_port <= 65535 )) ||
  die "application port must be between 1024 and 65535"
[[ "$health_path" =~ ^/[A-Za-z0-9._/-]*$ ]] || die "invalid health path"
[[ "$keep_releases" =~ ^[0-9]+$ ]] || die "KEEP_RELEASES must be numeric"
(( keep_releases >= 3 && keep_releases <= 20 )) ||
  die "KEEP_RELEASES must be between 3 and 20"
[[ "$mode" == "deploy" || "$mode" == "rollback" ]] ||
  die "mode must be deploy or rollback"

[[ "$(uname -m)" == "x86_64" ]] ||
  die "this workflow builds native dependencies for x86_64; use an x64 server or matching self-hosted runner"

releases_dir="$deploy_root/releases"
incoming_dir="$deploy_root/incoming"
shared_dir="$deploy_root/shared"
env_dir="$shared_dir/env"
release_dir="$releases_dir/$release"
staged_release="$incoming_dir/$release"
current_link="$deploy_root/current"
release_env="$env_dir/$release.env"
legacy_runtime_env="$shared_dir/.env.production"
shared_verifier="$shared_dir/verify-deploy-state.mjs"

mkdir -p "$releases_dir" "$incoming_dir" "$shared_dir" "$env_dir"
chmod 700 "$shared_dir" "$env_dir"

previous_release=""
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link" || true)"
fi

[[ -f "$release_env" ]] ||
  die "$release_env is missing; sync the release environment before activation"
chmod 600 "$release_env"

managed_env_names=(
  DATABASE_URL AUTH_SECRET AUTH_GITHUB_ID AUTH_GITHUB_SECRET
  AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET KIMI_API_KEY KIMI_MODEL
  USAGE_KEY_PEPPER USAGE_OBSERVABILITY_VERBOSE CRON_SECRET
  R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
  R2_PUBLIC_BASE_URL RESEND_API_KEY MAIL_FROM
)

load_release_env() {
  local target="$1"
  local target_env="$target/.env.production"
  [[ -f "$target_env" ]] || die "$target: release environment is missing"
  unset "${managed_env_names[@]}"
  set -a
  source "$target_env"
  set +a
}

validate_runtime_env() {
  local database_url="${DATABASE_URL:-}"
  local auth_secret="${AUTH_SECRET:-}"
  local usage_key_pepper="${USAGE_KEY_PEPPER:-}"
  local cron_secret="${CRON_SECRET:-}"
  [[ "$database_url" =~ ^mysql:// ]] ||
    die "DATABASE_URL must be set and use the mysql:// scheme"
  [[ ${#auth_secret} -ge 32 ]] ||
    die "AUTH_SECRET must contain at least 32 characters"
  [[ ${#usage_key_pepper} -ge 32 ]] ||
    die "USAGE_KEY_PEPPER must contain at least 32 characters"
  [[ ${#cron_secret} -ge 32 ]] ||
    die "CRON_SECRET must contain at least 32 characters"
  [[ "$auth_secret" != "$usage_key_pepper" &&
     "$auth_secret" != "$cron_secret" &&
     "$usage_key_pepper" != "$cron_secret" ]] ||
    die "AUTH_SECRET, USAGE_KEY_PEPPER and CRON_SECRET must be different"
  for r2_variable in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    [[ -n "${!r2_variable:-}" ]] || die "$r2_variable must be set"
  done
}

# The deploy user must expose all runtime binaries through its login PATH.
for command in cmp curl node pm2 sha256sum; do
  command -v "$command" >/dev/null 2>&1 || die "$command is not installed or not on PATH"
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" == "22" ]] || die "Node.js 22 is required; found $(node --version)"

verifier_for() {
  local target="$1"
  if [[ -f "$target/ops/verify-deploy-state.mjs" ]]; then
    printf '%s\n' "$target/ops/verify-deploy-state.mjs"
  elif [[ -f "$shared_verifier" ]]; then
    printf '%s\n' "$shared_verifier"
  else
    die "$target: deploy state verifier is missing"
  fi
}

verify_release_identity() {
  local target="$1"
  local expected="$2"
  local verifier

  [[ -f "$target/server.js" ]] || die "$target: standalone server.js is missing"
  [[ -f "$target/ecosystem.config.cjs" ]] ||
    die "$target: PM2 ecosystem config is missing"
  [[ -f "$target/RELEASE" ]] || die "$target: RELEASE marker is missing"
  [[ "$(<"$target/RELEASE")" == "$expected" ]] ||
    die "$target: release SHA does not match $expected"
  verifier="$(verifier_for "$target")"
  node "$verifier" identity \
    "$target/.next/required-server-files.json" "$expected" ||
    die "$target: Next deploymentId verification failed"
}

verify_release_checksums() {
  local target="$1"

  [[ -f "$target/RELEASE.sha256" ]] ||
    die "$target: release checksum manifest is missing"
  (
    cd "$target"
    sha256sum --check --quiet RELEASE.sha256
  ) || die "$target: release checksum verification failed"
}

verify_release_bundle() {
  local target="$1"
  local expected="$2"

  verify_release_identity "$target" "$expected"
  verify_release_checksums "$target"
}

if [[ "$mode" == "rollback" && ! -d "$release_dir" ]]; then
  die "rollback release not found: $release_dir"
fi

if [[ ! -d "$release_dir" ]]; then
  [[ -d "$staged_release" ]] || die "staged release not found: $staged_release"
  verify_release_bundle "$staged_release" "$release"
  mv "$staged_release" "$release_dir"
else
  verify_release_identity "$release_dir" "$release"
  if [[ -f "$release_dir/RELEASE.sha256" ]]; then
    verify_release_checksums "$release_dir"
  elif [[ ! -d "$staged_release" ]]; then
    echo "deploy: warning: legacy release $release has no checksum manifest" >&2
  fi
  if [[ -d "$staged_release" ]]; then
    verify_release_bundle "$staged_release" "$release"
    [[ -f "$release_dir/RELEASE.sha256" ]] ||
      die "release $release already exists without an artifact manifest"
    cmp -s "$release_dir/RELEASE.sha256" "$staged_release/RELEASE.sha256" ||
      die "release $release already exists with a different artifact manifest"
    rm -rf -- "$staged_release"
  fi
fi

if [[ -f "$release_dir/ops/verify-deploy-state.mjs" ]]; then
  verifier_temp="$shared_dir/.verify-deploy-state.$$"
  install -m 644 "$release_dir/ops/verify-deploy-state.mjs" "$verifier_temp"
  mv -f -- "$verifier_temp" "$shared_verifier"
fi

link_release_env() {
  local target="$1"
  local target_env="$2"
  local env_link="$target/.env.production"
  local next_link="$target/.env.production.$$"
  if [[ -e "$env_link" && ! -L "$env_link" ]]; then
    die "$target: .env.production path is not a symlink"
  fi
  rm -f -- "$next_link"
  ln -s "$target_env" "$next_link"
  mv -Tf "$next_link" "$env_link"
}

# Preserve the live release's environment before replacing the compatibility
# pointer used by older releases and operator tooling.
if [[ -n "$previous_release" && -d "$previous_release" ]]; then
  previous_name="$(basename "$previous_release")"
  [[ "$previous_release" == "$releases_dir/"* && "$previous_name" =~ ^[0-9a-f]{40}$ ]] ||
    die "current release points outside the immutable release directory"
  previous_env="$env_dir/$previous_name.env"
  if [[ ! -f "$previous_env" ]]; then
    [[ -f "$legacy_runtime_env" ]] ||
      die "cannot snapshot the current release environment"
    cp -L -- "$legacy_runtime_env" "$previous_env"
    chmod 600 "$previous_env"
  fi
  link_release_env "$previous_release" "$previous_env"
fi

link_release_env "$release_dir" "$release_env"
load_release_env "$release_dir"
validate_runtime_env

# Apply database migrations before the atomic switch. Explicit rollback mode
# skips this step because additive migrations must remain compatible with the
# retained application release.
[[ -f "$release_dir/scripts/db-migrate.mjs" ]] ||
  die "$release_dir: migration runner scripts/db-migrate.mjs is missing"
[[ -d "$release_dir/db/migrations" ]] ||
  die "$release_dir: migration directory db/migrations is missing"
if [[ "$mode" == "deploy" ]]; then
  (
    cd "$release_dir"
    node scripts/db-migrate.mjs status --strict --allow-pending
    node scripts/db-migrate.mjs migrate --strict
    node scripts/db-migrate.mjs status --strict --require-clean
  ) || die "database migration failed for $release; previous release stays live"
fi

switch_current() {
  local target="$1"
  local next_link="$deploy_root/.current.$$"
  rm -f -- "$next_link"
  ln -s "$target" "$next_link"
  mv -Tf "$next_link" "$current_link"
}

start_release() {
  local target="$1"
  local version
  local verifier
  version="$(basename "$target")"
  verifier="$(verifier_for "$target")"
  load_release_env "$target"
  validate_runtime_env
  export APP_NAME="$app_name"
  export APP_PORT="$app_port"
  export RELEASE_DIR="$target"
  export DEPLOYMENT_VERSION="$version"
  # pm2 startOrReload keeps the originally-registered script path on reload —
  # it refreshes env vars but never switches the process to a NEW release
  # directory, so the app would serve the first-deployed release forever
  # (with the new DEPLOYMENT_VERSION stamped on top, which masked the
  # staleness behind a passing health check). Delete + start so the process
  # always comes up on the new release dir; the path assertion below catches
  # any future PM2 behavior change before the health probe can pass.
  pm2 delete "$app_name" >/dev/null 2>&1 || true
  pm2 start "$target/ecosystem.config.cjs" \
    --env production \
    --update-env &&
    pm2 jlist | \
      node "$verifier" target "$app_name" "$target"
}

healthy_release() {
  local expected="$1"
  local target="$2"
  local verifier
  local body=""
  local attempt
  verifier="$(verifier_for "$target")"
  for attempt in {1..15}; do
    if body="$(curl --fail --silent --show-error \
      --connect-timeout 2 --max-time 5 \
      "http://127.0.0.1:${app_port}${health_path}" 2>/dev/null)" &&
      printf '%s' "$body" | node "$verifier" health "$expected" 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

stable_release() {
  local expected="$1"
  local target="$2"
  local verifier
  verifier="$(verifier_for "$target")"
  sleep 10
  pm2 jlist | \
    node "$verifier" stable "$app_name" "$expected"
}

switch_current "$release_dir"
if ! start_release "$release_dir" ||
   ! healthy_release "$release" "$release_dir" ||
   ! stable_release "$release" "$release_dir"; then
  echo "deploy: activation check failed for $release; rolling back" >&2
  pm2 logs "$app_name" --lines 80 --nostream || true

  if [[ -n "$previous_release" && -d "$previous_release" &&
        -f "$previous_release/ecosystem.config.cjs" ]]; then
    switch_current "$previous_release"
    previous_version="$(basename "$previous_release")"
    start_release "$previous_release" &&
      healthy_release "$previous_version" "$previous_release" &&
      stable_release "$previous_version" "$previous_release" ||
      die "new release failed and rollback health check also failed"
    pm2 save
    die "release $release failed; rolled back to $previous_version"
  fi

  pm2 delete "$app_name" || true
  rm -f -- "$current_link"
  die "first release failed its health check; no rollback was available"
fi

next_runtime_env="$shared_dir/.env.production.$$"
rm -f -- "$next_runtime_env"
ln -s "$release_env" "$next_runtime_env"
mv -Tf "$next_runtime_env" "$legacy_runtime_env"

cat >"$shared_dir/deploy.env" <<EOF
APP_NAME='$app_name'
APP_PORT='$app_port'
DEPLOY_ROOT='$deploy_root'
EOF
chmod 600 "$shared_dir/deploy.env"

pm2 save

# Keep recent immutable releases for fast manual rollback. Every deletion is
# constrained to a full-SHA directory under releases/; current is never pruned.
current_release="$(readlink -f "$current_link")"
release_count=0
while read -r _ candidate; do
  [[ -n "$candidate" ]] || continue
  release_count=$((release_count + 1))
  if (( release_count > keep_releases )) && [[ "$candidate" != "$current_release" ]]; then
    candidate_name="$(basename "$candidate")"
    if [[ "$candidate" == "$releases_dir/"* &&
          "$candidate_name" =~ ^[0-9a-f]{40}$ ]]; then
      rm -rf -- "$candidate"
      rm -f -- "$env_dir/$candidate_name.env"
    fi
  fi
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d \
  -name '[0-9a-f]*' -printf '%T@ %p\n' | sort -nr)

echo "deploy: release $release is healthy on 127.0.0.1:$app_port"
