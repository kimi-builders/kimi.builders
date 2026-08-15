import assert from "node:assert/strict";
import test from "node:test";
import {
  USAGE_DASHBOARD_COMMAND,
  USAGE_INIT_COMMAND,
  USAGE_SYNC_COMMAND,
  usageDashboardConnectionGuide,
  usageInitMeaning,
  usageSyncMeaning,
} from "../src/lib/usage/device-onboarding";

test("device onboarding exposes one current command for each distinct operation", () => {
  assert.equal(USAGE_DASHBOARD_COMMAND, "npx @kimi.builders/usage@latest dashboard");
  assert.equal(USAGE_INIT_COMMAND, "npx @kimi.builders/usage@latest init");
  assert.equal(USAGE_SYNC_COMMAND, "npx @kimi.builders/usage@latest sync");
  assert.equal(new Set([USAGE_DASHBOARD_COMMAND, USAGE_INIT_COMMAND, USAGE_SYNC_COMMAND]).size, 3);
});

test("device onboarding never describes authorization as scanning or uploading", () => {
  const zh = usageInitMeaning(true);
  const en = usageInitMeaning(false);
  assert.match(zh, /只完成设备授权/);
  assert.match(zh, /不扫描、不上传/);
  assert.doesNotMatch(zh, /首传|一次完成/);
  assert.match(en, /only authorizes this device/i);
  assert.match(en, /does not scan or upload/i);
  assert.doesNotMatch(en, /first upload/i);
});

test("novice and returning-device guidance names its evidence and action boundaries", () => {
  assert.match(usageDashboardConnectionGuide(true), /验证码、倒计时、同步范围和断开/);
  assert.match(usageDashboardConnectionGuide(false), /code, countdown, sync scope, and disconnect/i);
  assert.match(usageSyncMeaning(true), /本机并同步/);
  assert.match(usageSyncMeaning(false), /Local \+ sync/);
});
