import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Lightweight guard over the deploy pipeline config: against
   regressions like dropping standalone, losing required secret names,
   or skipping the migration step. Text assertions only — no YAML or
   shell parsing. */

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("next.config.ts builds a standalone bundle with a deployment id", () => {
  const config = readRepoFile("next.config.ts");
  assert.match(config, /output:\s*"standalone"/);
  assert.match(config, /deploymentId:\s*process\.env\.DEPLOYMENT_VERSION/);
  // mysql2 must stay externalized, or the standalone node_modules lacks it
  // and the release's db-migrate.mjs can't require it.
  assert.match(config, /serverExternalPackages:\s*\[\s*"mysql2"\s*\]/);
});

test(".nvmrc pins Node 22 (kb-sg runtime)", () => {
  assert.equal(readRepoFile(".nvmrc").trim(), "22");
});

test("ops/deploy-release.sh exists and carries the release pipeline", () => {
  const script = readRepoFile("ops/deploy-release.sh");
  // Migrations run before switching current; failure must die.
  assert.match(script, /node scripts\/db-migrate\.mjs migrate/);
  // Required runtime secret validation.
  for (const name of [
    "DATABASE_URL",
    "AUTH_SECRET",
    "USAGE_KEY_PEPPER",
    "CRON_SECRET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ]) {
    assert.ok(script.includes(name), `deploy-release.sh must validate ${name}`);
  }
  // The health probe delegates exact JSON/version matching to the tested verifier.
  assert.match(script, /verify-deploy-state\.mjs/);
  assert.match(script, /health "\$expected"/);
});

test("ops/ecosystem.config.cjs exists with kimi-builders defaults", () => {
  const config = readRepoFile("ops/ecosystem.config.cjs");
  assert.match(config, /"kimi-builders"/);
  assert.match(config, /"3210"/);
  assert.match(config, /"1G"/);
});

test("deploy.yml wires secrets, packaging and migration", () => {
  const workflow = readRepoFile(".github/workflows/deploy.yml");
  for (const name of [
    "DEPLOY_HOST",
    "DEPLOY_USER",
    "DEPLOY_SSH_PRIVATE_KEY",
    "DEPLOY_KNOWN_HOSTS",
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "KIMI_API_KEY",
    "KIMI_MODEL",
    "USAGE_KEY_PEPPER",
    "CRON_SECRET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
    "RESEND_API_KEY",
    "MAIL_FROM",
  ]) {
    assert.ok(workflow.includes(name), `deploy.yml must reference ${name}`);
  }
  for (const name of [
    "DEPLOY_PATH",
    "NEXT_PUBLIC_SITE_URL",
    "APP_PORT",
    "PM2_APP_NAME",
    "KEEP_RELEASES",
    "DEPLOY_SSH_PORT",
  ]) {
    assert.ok(workflow.includes(name), `deploy.yml must reference var ${name}`);
  }
  // Migrations run via the release's own runner (the Activate step's
  // comment anchors this contract).
  assert.match(workflow, /db-migrate\.mjs migrate/);
  // The release package must carry the files migrations need.
  assert.match(workflow, /cp -a scripts \.release\/scripts/);
  assert.match(workflow, /cp -a db \.release\/db/);
  assert.match(workflow, /\.release\/node_modules\/mysql2/);
  assert.match(workflow, /ops\/verify-deploy-state\.mjs \.release\/ops\/verify-deploy-state\.mjs/);
  // The build injects the version; the health check accepts by it.
  assert.match(workflow, /DEPLOYMENT_VERSION: \$\{\{ github\.sha \}\}/);
});
