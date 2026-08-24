import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyHealthBody,
  verifyPm2Stability,
  verifyPm2Target,
  verifyReleaseIdentity,
} from "../ops/verify-deploy-state.mjs";

const release = "/srv/kimi-builders/releases/0123456789abcdef0123456789abcdef01234567";
const version = "0123456789abcdef0123456789abcdef01234567";

function pm2App(overrides: Record<string, unknown> = {}) {
  return [{
    name: "kimi-builders",
    pm2_env: {
      pm_exec_path: `${release}/server.js`,
      pm_cwd: release,
      status: "online",
      DEPLOYMENT_VERSION: version,
      restart_time: 0,
      pm_uptime: 1_000,
      ...overrides,
    },
  }];
}

test("release identity requires the exact deployment id", () => {
  assert.doesNotThrow(() => verifyReleaseIdentity({ config: { deploymentId: version } }, version));
  assert.throws(
    () => verifyReleaseIdentity({ config: { deploymentId: "other" } }, version),
    /does not match/,
  );
});

test("PM2 must execute server.js from the selected immutable release", () => {
  assert.doesNotThrow(() => verifyPm2Target(pm2App(), "kimi-builders", release));
  assert.throws(
    () => verifyPm2Target(pm2App({ pm_cwd: "/srv/kimi-builders/current" }), "kimi-builders", release),
    /target mismatch/,
  );
});

test("PM2 stability rejects restarts, wrong versions, and short uptime", () => {
  assert.doesNotThrow(() => verifyPm2Stability(pm2App(), "kimi-builders", version, 11_000));
  assert.throws(
    () => verifyPm2Stability(pm2App({ restart_time: 1 }), "kimi-builders", version, 11_000),
    /stable/,
  );
  assert.throws(
    () => verifyPm2Stability(pm2App(), "kimi-builders", version, 5_000),
    /stable/,
  );
});

test("health verification requires ok=true and the exact release", () => {
  assert.doesNotThrow(() => verifyHealthBody(JSON.stringify({ ok: true, version }), version));
  assert.throws(
    () => verifyHealthBody(JSON.stringify({ ok: true, version: "old" }), version),
    /does not match/,
  );
});
