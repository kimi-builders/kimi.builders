#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  echo "restore-drill: $*" >&2
  exit 1
}

archive="${1:-}"
repo_root="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)}"
restore_url="${RESTORE_DATABASE_URL:-}"
[[ -f "$archive" ]] || die "usage: RESTORE_DATABASE_URL=... $0 <dump.sql.gz> [repo-root]"
[[ -f "$archive.sha256" ]] || die "$archive.sha256 is missing"
manifest="${archive%.sql.gz}.manifest.json"
[[ -f "$manifest" ]] || die "$manifest is missing"
[[ -f "$repo_root/scripts/db-migrate.mjs" ]] || die "repo root is invalid"

# This drill is deliberately off-host. Even a guarded temp database should not
# compete with production MySQL or share its administrative credentials.
[[ ! -e /home/deploy/kimi-builders/current ]] ||
  die "refusing to run on the production application host"

for command in gzip mysql mysqlcheck node sha256sum zgrep; do
  command -v "$command" >/dev/null 2>&1 || die "$command is not installed or not on PATH"
done
[[ -n "$restore_url" ]] || die "RESTORE_DATABASE_URL is required"

tmp_dir="$(mktemp -d)"
mysql_config="$tmp_dir/mysql.cnf"
database_created=0
database_name=""
cleanup() {
  if (( database_created == 1 )) && [[ "$database_name" =~ ^kbu_restore_[A-Za-z0-9_]+$ ]]; then
    mysql --defaults-extra-file="$mysql_config" \
      -e "DROP DATABASE IF EXISTS \`$database_name\`" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT

database_name="$(DATABASE_URL="$restore_url" MYSQL_CONFIG="$mysql_config" node -e '
  const fs = require("node:fs");
  const url = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const host = url.hostname;
  if (url.protocol !== "mysql:" || !/^kbu_restore_[A-Za-z0-9_]+$/.test(database)) process.exit(2);
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
')" || die "RESTORE_DATABASE_URL must target local MySQL and a kbu_restore_* database"

(
  cd "$(dirname "$archive")"
  sha256sum --check --status "$(basename "$archive.sha256")"
) || die "backup checksum verification failed"
gzip -t "$archive" || die "gzip integrity check failed"
if zgrep -Eiq '^[[:space:]]*((CREATE|DROP)[[:space:]]+DATABASE|USE[[:space:]])' "$archive"; then
  die "dump contains database-selection statements"
fi

existing="$(mysql --defaults-extra-file="$mysql_config" --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '$database_name'")"
[[ "$existing" == "0" ]] || die "$database_name already exists"
mysql --defaults-extra-file="$mysql_config" \
  -e "CREATE DATABASE \`$database_name\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
database_created=1

started_at="$(date +%s)"
gzip -dc "$archive" | mysql --defaults-extra-file="$mysql_config" "$database_name"
mysqlcheck --defaults-extra-file="$mysql_config" --check "$database_name" >/dev/null
elapsed_seconds="$(( $(date +%s) - started_at ))"

table_count="$(mysql --defaults-extra-file="$mysql_config" --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$database_name' AND table_type = 'BASE TABLE'")"
migration_count="$(mysql --defaults-extra-file="$mysql_config" --batch --skip-column-names \
  "$database_name" -e "SELECT COUNT(*) FROM _migrations")"

MANIFEST_PATH="$manifest" \
RESTORED_TABLES="$table_count" \
RESTORED_MIGRATIONS="$migration_count" \
  node -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"));
    if (manifest.database !== "kimi_builders") throw new Error("unexpected manifest database");
    if (manifest.dump !== process.argv[1]) throw new Error("manifest dump name mismatch");
    if (manifest.tableCount !== Number(process.env.RESTORED_TABLES)) throw new Error("table count mismatch");
    if (manifest.migrationCount !== Number(process.env.RESTORED_MIGRATIONS)) throw new Error("migration count mismatch");
  ' "$(basename "$archive")"

DATABASE_URL="$restore_url" node "$repo_root/scripts/db-migrate.mjs" \
  status --strict --require-clean >/dev/null

echo "restore-drill: ok dump=$(basename "$archive") seconds=$elapsed_seconds tables=$table_count migrations=$migration_count"
