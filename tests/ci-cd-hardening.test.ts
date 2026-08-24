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
});
