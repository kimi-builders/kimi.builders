#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  echo "backup: $*" >&2
  exit 1
}

deploy_root="${1:-}"
[[ "$deploy_root" == /* && "$deploy_root" != "/" && ${#deploy_root} -gt 5 ]] ||
  die "DEPLOY_PATH must be a safe absolute path"
[[ "$deploy_root" =~ ^[A-Za-z0-9._/-]+$ ]] ||
  die "DEPLOY_PATH contains unsupported characters"
deploy_root="$(cd "$deploy_root" && pwd -P)" || die "DEPLOY_PATH is unavailable"

shared_dir="$deploy_root/shared"
runtime_env="$shared_dir/.env.production"
backup_env="$shared_dir/r2-backup.env"
lock_file="$shared_dir/db-backup.lock"
last_success="$shared_dir/backup-last-success"

for command in flock gzip mysql mysqldump node rclone sha256sum stat; do
  command -v "$command" >/dev/null 2>&1 || die "$command is not installed or not on PATH"
done
[[ -f "$runtime_env" ]] || die "$runtime_env is missing"
[[ -f "$backup_env" ]] || die "$backup_env is missing"

umask 077
exec 9>"$lock_file"
flock --nonblock 9 || die "another backup is already running"

set -a
source "$runtime_env"
source "$backup_env"
set +a

for variable in DATABASE_URL R2_ENDPOINT R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY; do
  [[ -n "${!variable:-}" ]] || die "$variable is missing"
done

backup_bucket="${R2_BACKUP_BUCKET:-kb-backups}"
backup_prefix="${R2_BACKUP_PREFIX:-daily}"
[[ "$backup_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] ||
  die "R2_BACKUP_BUCKET is invalid"
[[ "$backup_prefix" =~ ^[A-Za-z0-9._/-]+$ && "$backup_prefix" != /* ]] ||
  die "R2_BACKUP_PREFIX is invalid"
backup_prefix="${backup_prefix%/}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT
mysql_config="$tmp_dir/mysql.cnf"

database_name="$(MYSQL_CONFIG="$mysql_config" node -e '
  const fs = require("node:fs");
  const url = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const host = url.hostname;
  if (url.protocol !== "mysql:" || !database) process.exit(2);
  if (host !== "127.0.0.1" && host !== "localhost") process.exit(3);
  const quote = (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"`;
  fs.writeFileSync(process.env.MYSQL_CONFIG, [
    "[client]",
    `host=${quote(host)}`,
    `port=${quote(url.port || "3306")}`,
    `user=${quote(decodeURIComponent(url.username))}`,
    `password=${quote(decodeURIComponent(url.password))}`,
    "default-character-set=utf8mb4",
    "",
  ].join("\n"), { mode: 0o600 });
  process.stdout.write(database);
')" || die "DATABASE_URL is invalid or does not point to local MySQL"
[[ "$database_name" == "kimi_builders" ]] ||
  die "DATABASE_URL must target kimi_builders"

current_release="$(readlink -f "$deploy_root/current" || true)"
release="$(basename "$current_release")"
[[ "$current_release" == "$deploy_root/releases/"* && "$release" =~ ^[0-9a-f]{40}$ ]] ||
  die "current release is invalid"

created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
dump_name="kimi_builders-${timestamp}-${release}.sql.gz"
checksum_name="$dump_name.sha256"
manifest_name="${dump_name%.sql.gz}.manifest.json"
dump_path="$tmp_dir/$dump_name"
checksum_path="$tmp_dir/$checksum_name"
manifest_path="$tmp_dir/$manifest_name"

migration_count="$(mysql --defaults-extra-file="$mysql_config" --batch --skip-column-names \
  "$database_name" -e "SELECT COUNT(*) FROM _migrations")"
table_count="$(mysql --defaults-extra-file="$mysql_config" --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$database_name' AND table_type = 'BASE TABLE'")"
[[ "$migration_count" =~ ^[0-9]+$ && "$table_count" =~ ^[0-9]+$ ]] ||
  die "database inventory failed"

# Do not use --databases here. Database-level CREATE/USE statements make a
# nominal temp-database restore capable of switching back to production.
mysqldump --defaults-extra-file="$mysql_config" \
  --single-transaction --quick --skip-lock-tables \
  --set-gtid-purged=OFF --column-statistics=0 --no-tablespaces \
  --routines --events --triggers --hex-blob \
  "$database_name" | gzip -9 > "$dump_path"
[[ -s "$dump_path" ]] || die "dump is empty"
gzip -t "$dump_path" || die "gzip integrity check failed"
(
  cd "$tmp_dir"
  sha256sum "$dump_name" > "$checksum_name"
)

dump_sha256="$(cut -d' ' -f1 "$checksum_path")"
compressed_bytes="$(stat -c %s "$dump_path")"
MANIFEST_CREATED_AT="$created_at" \
MANIFEST_DUMP_NAME="$dump_name" \
MANIFEST_SHA256="$dump_sha256" \
MANIFEST_BYTES="$compressed_bytes" \
MANIFEST_RELEASE="$release" \
MANIFEST_MIGRATIONS="$migration_count" \
MANIFEST_TABLES="$table_count" \
  node -e '
    const fs = require("node:fs");
    const manifest = {
      schemaVersion: 1,
      createdAt: process.env.MANIFEST_CREATED_AT,
      database: "kimi_builders",
      dump: process.env.MANIFEST_DUMP_NAME,
      sha256: process.env.MANIFEST_SHA256,
      compressedBytes: Number(process.env.MANIFEST_BYTES),
      release: process.env.MANIFEST_RELEASE,
      migrationCount: Number(process.env.MANIFEST_MIGRATIONS),
      tableCount: Number(process.env.MANIFEST_TABLES),
    };
    fs.writeFileSync(process.argv[1], `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  ' "$manifest_path"

export RCLONE_CONFIG_KBB_TYPE=s3
export RCLONE_CONFIG_KBB_PROVIDER=Cloudflare
export RCLONE_CONFIG_KBB_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
export RCLONE_CONFIG_KBB_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_KBB_ENDPOINT="$R2_ENDPOINT"
remote_dir="kbb:${backup_bucket}/${backup_prefix}"

# Verify the dump before publishing its sidecars. Uploading the manifest last
# makes its presence the completion marker for the backup set.
rclone copyto "$dump_path" "$remote_dir/$dump_name" \
  --s3-no-check-bucket --s3-no-head
remote_size_json="$(rclone size "$remote_dir/$dump_name" --json --s3-no-check-bucket)"
remote_bytes="$(printf '%s' "$remote_size_json" | node -e '
  const input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (input.count !== 1 || !Number.isSafeInteger(input.bytes)) process.exit(2);
  process.stdout.write(String(input.bytes));
')" || die "remote size verification failed"
[[ "$remote_bytes" == "$compressed_bytes" ]] || die "remote size does not match local dump"

rclone copyto "$checksum_path" "$remote_dir/$checksum_name" \
  --s3-no-check-bucket --s3-no-head
rclone copyto "$manifest_path" "$remote_dir/$manifest_name" \
  --s3-no-check-bucket --s3-no-head

marker_next="$shared_dir/.backup-last-success.$$"
printf '%s %s %s\n' "$(date -u +%s)" "$dump_name" "$release" > "$marker_next"
chmod 600 "$marker_next"
mv -f -- "$marker_next" "$last_success"

# Retention failure must not hide a backup that was already uploaded and
# verified. The next run retries deletion while freshness monitoring stays true.
if ! rclone delete "$remote_dir" --min-age 14d --s3-no-check-bucket; then
  echo "backup: warning: retention cleanup failed" >&2
fi
echo "backup: ok dump=$dump_name bytes=$compressed_bytes migrations=$migration_count tables=$table_count"
