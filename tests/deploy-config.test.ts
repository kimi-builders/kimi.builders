import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 部署流水线配置的轻量守卫:防回归(误删 standalone、改丢必配密钥名、
   迁移步骤被跳过等)。只断言文本,不解析 YAML/shell。 */

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("next.config.ts builds a standalone bundle with a deployment id", () => {
  const config = readRepoFile("next.config.ts");
  assert.match(config, /output:\s*"standalone"/);
  assert.match(config, /deploymentId:\s*process\.env\.DEPLOYMENT_VERSION/);
  // mysql2 必须外部化,否则 standalone node_modules 里没有它,
  // release 内的 db-migrate.mjs 无法 require
  assert.match(config, /serverExternalPackages:\s*\[\s*"mysql2"\s*\]/);
});

test(".nvmrc pins Node 22 (kb-sg runtime)", () => {
  assert.equal(readRepoFile(".nvmrc").trim(), "22");
});

test("ops/deploy-release.sh exists and carries the release pipeline", () => {
  const script = readRepoFile("ops/deploy-release.sh");
  // 切换 current 之前跑迁移,失败必须 die
  assert.match(script, /node scripts\/db-migrate\.mjs migrate/);
  // 必配运行时密钥校验
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
  // 健康探针按 release SHA 匹配
  assert.match(script, /\\"version\\":\\"\$\{expected\}\\"/);
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
  // 迁移由 release 内的 runner 执行(Activate 步骤注释锚定该契约)
  assert.match(workflow, /db-migrate\.mjs migrate/);
  // release 包必须带迁移所需文件
  assert.match(workflow, /cp -a scripts \.release\/scripts/);
  assert.match(workflow, /cp -a db \.release\/db/);
  assert.match(workflow, /\.release\/node_modules\/mysql2/);
  // 构建期注入版本,健康检查按它验收
  assert.match(workflow, /DEPLOYMENT_VERSION: \$\{\{ github\.sha \}\}/);
});
