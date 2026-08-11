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

[[ "$(uname -m)" == "x86_64" ]] ||
  die "this workflow builds native dependencies for x86_64; use an x64 server or matching self-hosted runner"

releases_dir="$deploy_root/releases"
incoming_dir="$deploy_root/incoming"
shared_dir="$deploy_root/shared"
release_dir="$releases_dir/$release"
staged_release="$incoming_dir/$release"
current_link="$deploy_root/current"
runtime_env="$shared_dir/.env.production"

mkdir -p "$releases_dir" "$incoming_dir" "$shared_dir"
chmod 700 "$shared_dir"

if [[ ! -f "$runtime_env" ]]; then
  die "$runtime_env is missing; create it before the first deployment"
fi
chmod 600 "$runtime_env"

set -a
# Actions generates this server-side runtime copy atomically from repository
# Secrets. Shell-safe assignments keep manual restarts and PM2 recovery
# independent from the short-lived GitHub runner.
source "$runtime_env"
set +a

# Source the operator environment before checking binaries so a manually
# installed Node / PM2 can expose its bin directory through PATH here.
for command in cmp curl node pm2 sha256sum; do
  command -v "$command" >/dev/null 2>&1 || die "$command is not installed or not on PATH"
done

database_url="${DATABASE_URL:-}"
auth_secret="${AUTH_SECRET:-}"
usage_key_pepper="${USAGE_KEY_PEPPER:-}"
cron_secret="${CRON_SECRET:-}"
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

verify_release_identity() {
  local target="$1"
  local expected="$2"
  local build_version

  [[ -f "$target/server.js" ]] || die "$target: standalone server.js is missing"
  [[ -f "$target/ecosystem.config.cjs" ]] ||
    die "$target: PM2 ecosystem config is missing"
  [[ -f "$target/RELEASE" ]] || die "$target: RELEASE marker is missing"
  [[ "$(<"$target/RELEASE")" == "$expected" ]] ||
    die "$target: release SHA does not match $expected"

  build_version="$(
    REQUIRED_SERVER_FILES="$target/.next/required-server-files.json" \
      node -e '
        const fs = require("node:fs");
        const requiredFiles = JSON.parse(
          fs.readFileSync(process.env.REQUIRED_SERVER_FILES, "utf8"),
        );
        const deploymentId = requiredFiles.config?.deploymentId;
        if (typeof deploymentId !== "string") process.exit(1);
        process.stdout.write(deploymentId);
      '
  )" || die "$target: Next deploymentId is missing"
  [[ "$build_version" == "$expected" ]] ||
    die "$target: Next deploymentId $build_version does not match $expected"
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

# Next can load this file itself, while the shell export above makes the same
# values available to PM2. The symlink also makes manual starts predictable.
if [[ -e "$release_dir/.env.production" || -L "$release_dir/.env.production" ]]; then
  [[ -L "$release_dir/.env.production" ]] ||
    die "release .env.production path is not a symlink"
else
  ln -s "$runtime_env" "$release_dir/.env.production"
fi

# Apply database migrations BEFORE the atomic switch: the migration runner
# ships inside the release (scripts/ + db/ are packaged alongside the
# standalone bundle, and mysql2 rides in the traced node_modules). A failed
# migration dies here — current still points at the previous healthy release,
# which keeps serving traffic, so this is the safe state to stop in.
[[ -f "$release_dir/scripts/db-migrate.mjs" ]] ||
  die "$release_dir: migration runner scripts/db-migrate.mjs is missing"
[[ -d "$release_dir/db/migrations" ]] ||
  die "$release_dir: migration directory db/migrations is missing"
(
  cd "$release_dir"
  node scripts/db-migrate.mjs migrate
) || die "database migration failed for $release; previous release stays live"

previous_release=""
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link" || true)"
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
  version="$(basename "$target")"
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
      PM2_EXPECTED_APP="$app_name" PM2_EXPECTED_RELEASE="$target" \
      node -e '
        const path = require("node:path");
        let apps = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { apps += chunk; });
        process.stdin.on("end", () => {
          const app = JSON.parse(apps).find(
            (candidate) => candidate.name === process.env.PM2_EXPECTED_APP,
          );
          if (!app) {
            console.error("deploy: PM2 app is missing after start");
            process.exit(1);
          }
          const expectedRoot = path.resolve(process.env.PM2_EXPECTED_RELEASE);
          const expectedScript = path.join(expectedRoot, "server.js");
          const actualScript = path.resolve(app.pm2_env?.pm_exec_path || "");
          const actualCwd = path.resolve(app.pm2_env?.pm_cwd || "");
          if (actualScript !== expectedScript || actualCwd !== expectedRoot) {
            console.error(
              `deploy: PM2 target mismatch (script=${actualScript}, cwd=${actualCwd})`,
            );
            process.exit(1);
          }
        });
      '
}

healthy_release() {
  local expected="$1"
  local body=""
  local attempt
  for attempt in {1..15}; do
    if body="$(curl --fail --silent --show-error \
      --connect-timeout 2 --max-time 5 \
      "http://127.0.0.1:${app_port}${health_path}" 2>/dev/null)" &&
      [[ "$body" == *"\"version\":\"${expected}\""* ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

switch_current "$release_dir"
if ! start_release "$release_dir" || ! healthy_release "$release"; then
  echo "deploy: activation check failed for $release; rolling back" >&2
  pm2 logs "$app_name" --lines 80 --nostream || true

  if [[ -n "$previous_release" && -d "$previous_release" &&
        -f "$previous_release/ecosystem.config.cjs" ]]; then
    switch_current "$previous_release"
    previous_version="$(basename "$previous_release")"
    start_release "$previous_release" && healthy_release "$previous_version" ||
      die "new release failed and rollback health check also failed"
    pm2 save
    die "release $release failed; rolled back to $previous_version"
  fi

  pm2 delete "$app_name" || true
  rm -f -- "$current_link"
  die "first release failed its health check; no rollback was available"
fi

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
    fi
  fi
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d \
  -name '[0-9a-f]*' -printf '%T@ %p\n' | sort -nr)

echo "deploy: release $release is healthy on 127.0.0.1:$app_port"
