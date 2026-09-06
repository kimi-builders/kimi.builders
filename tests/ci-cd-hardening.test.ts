import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("terminal schema includes the email-auth columns", () => {
  const schema = source("db/schema.sql");
  assert.match(schema, /password_hash VARCHAR\(190\) NULL/);
  assert.match(schema, /email_verified_at DATETIME NULL/);
});

test("database validation is reusable, pinned to MySQL 8, and runs every DB suite", () => {
  const workflow = source(".github/workflows/db-validate.yml");
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /image:\s*mysql:8\.0\./);
  assert.doesNotMatch(workflow, /uses:\s*actions\/(?:checkout|setup-node)@v[0-9]+/);
  assert.match(workflow, /init-ledger --fresh-schema/);
  assert.match(workflow, /--strict --require-clean/);
  assert.match(
    workflow,
    /ALTER DATABASE `kbu-mysql-upgrade` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/,
  );
  for (const suite of [
    "test:usage-db",
    "test:analytics-db",
    "test:auth-db",
    "test:works-db",
    "test:moderation-db",
  ]) {
    assert.ok(workflow.includes(suite), `db-validate.yml must run ${suite}`);
  }
  assert.match(workflow, /db-compare-schemas\.mjs/);
  assert.match(workflow, /check-migration-immutability\.mjs/);
});

test("production deploy waits for database validation and can roll back public failures", () => {
  const workflow = source(".github/workflows/deploy.yml");
  assert.match(workflow, /db-validation:[\s\S]*uses:\s*\.\/\.github\/workflows\/db-validate\.yml/);
  assert.match(workflow, /needs:\s*db-validation/);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(workflow, /env_dir\/\$GITHUB_SHA\.env/);
  assert.match(workflow, /USAGE_OBSERVABILITY_VERBOSE/);
  assert.match(workflow, /Capture rollback release/);
  assert.match(workflow, /Rollback public verification failure/);
  assert.match(workflow, /ops\/deep-health-check\.sh/);
  assert.match(workflow, /HEALTH_ALERT_WEBHOOK_URL/);
});

test("manual production migration uses the deploy host and the production lock", () => {
  const workflow = source(".github/workflows/db-migrate-prod.yml");
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /group:\s*kimi-builders-production/);
  assert.match(workflow, /ssh/);
  assert.match(workflow, /db-migrate\.mjs status --strict --require-clean/);
  assert.doesNotMatch(workflow, /PROD_DATABASE_URL/);
  assert.doesNotMatch(workflow, /uses:\s*actions\/(?:checkout|setup-node)@v[0-9]+/);
});

test("release activation pins runtime config and verifies process stability", () => {
  const script = source("ops/deploy-release.sh");
  assert.match(script, /env_dir="\$shared_dir\/env"/);
  assert.match(script, /release_env="\$env_dir\/\$release\.env"/);
  assert.match(script, /node scripts\/db-migrate\.mjs status --strict/);
  assert.match(script, /node scripts\/db-migrate\.mjs migrate --strict/);
  assert.match(script, /--require-clean/);
  assert.match(script, /node_major/);
  assert.match(script, /stable_release/);
  assert.match(script, /target_env="\$target\/\.env\.production"/);
  assert.match(script, /source "\$target_env"/);
  assert.match(script, /install_deep_health_monitor/);
  assert.match(script, /crontab "\$cron_dir\/next"/);
  assert.match(script, /! install_deep_health_monitor "\$release_dir"; then/);
  assert.match(script, /deploy-health\.lock/);
  assert.match(script, /flock 9 \|\| die/);
  const switched = script.indexOf('switch_current "$release_dir"');
  const monitorGate = script.indexOf('! install_deep_health_monitor "$release_dir"; then');
  const rollback = script.indexOf('switch_current "$previous_release"', monitorGate);
  assert.ok(switched >= 0 && monitorGate > switched && rollback > monitorGate);
  assert.match(script, /mv -f -- "\$monitor_backup" "\$monitor_script" \|\| true/);
  const monitorInstaller = script.slice(
    script.indexOf("install_deep_health_monitor()"),
    switched,
  );
  assert.match(monitorInstaller, /source_verifier="\$target\/ops\/verify-deploy-state\.mjs"/);
  assert.match(
    monitorInstaller,
    /retaining shared deep-health monitor and verifier for legacy rollback/,
  );
  assert.match(monitorInstaller, /install -m 644 "\$source_verifier" "\$verifier_next"/);
  assert.match(monitorInstaller, /mv -f -- "\$verifier_backup" "\$shared_verifier" \|\| true/);
  assert.doesNotMatch(script.slice(0, script.indexOf("install_deep_health_monitor()")), /verifier_temp/);
});

test("deep health monitor authenticates locally and alerts only on transitions", () => {
  const script = source("ops/deep-health-check.sh");
  assert.match(script, /127\.0\.0\.1:\$\{app_port\}\/api\/health\/deep/);
  assert.match(script, /Authorization: Bearer \$cron_secret/);
  assert.match(script, /--connect-timeout 2 --max-time 5/);
  assert.match(script, /verify-deploy-state\.mjs/);
  assert.match(script, /deep-health "\$expected_version"/);
  assert.match(script, /previous_state.*!= "failed"/);
  assert.match(script, /HEALTH_ALERT_WEBHOOK_URL/);
  assert.match(script, /notify_transition "recovered"/);
  assert.match(script, /flock --nonblock 9 \|\| exit 0/);
  assert.match(script, /runtime_env="\$current_release\/\.env\.production"/);
  assert.doesNotMatch(script, /runtime_env="\$shared_dir\/\.env\.production"/);
});
