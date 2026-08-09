import assert from "node:assert/strict";
import test from "node:test";
import {
  isGenericUsageDeviceName,
  parseUsageAgentVersions,
  usageDeviceDetail,
  usageDeviceDisplayName,
  usagePlatformLabel,
  usageSurfaceLabel,
} from "../src/lib/usage/device-label";

test("legacy source-based device names fall back to stored environment facts", () => {
  assert.equal(isGenericUsageDeviceName("Kimi Code (darwin)"), true);
  assert.equal(
    usageDeviceDisplayName({
      name: "Kimi Code (darwin)",
      platform: "darwin",
      surface: "cli",
      clientVersion: "0.3.3",
    }),
    "CLI · macOS",
  );
});

test("a user-edited or collector-detected device name is preserved", () => {
  assert.equal(
    usageDeviceDisplayName({
      name: "iTerm2 · macOS (arm64)",
      platform: "darwin",
      surface: "cli",
      clientVersion: "0.3.3",
    }),
    "iTerm2 · macOS (arm64)",
  );
});

test("platform and surface labels use product language instead of Node enums", () => {
  assert.equal(usagePlatformLabel("win32"), "Windows");
  assert.equal(usageSurfaceLabel("cli"), "CLI");
  assert.equal(usageSurfaceLabel("daemon"), "Background sync");
});

test("device detail keeps terminal, OS, Collector, and parser versions separate", () => {
  assert.equal(
    usageDeviceDetail({
      terminalName: "Warp",
      terminalVersion: "v0.2026.07.29.09.05.stable_02",
      osName: "macOS",
      osVersion: "26.5.2",
      architecture: "arm64",
      clientVersion: "0.3.3",
      parserVersion: "multi-v0.3.3",
    }),
    "Warp v0.2026.07.29.09.05.stable_02 · macOS 26.5.2 (arm64) · Collector v0.3.3 · Parser multi-v0.3.3",
  );
  assert.deepEqual(parseUsageAgentVersions('{"kimi-code":"1.44.0","codex":"0.146.1"}'), {
    "kimi-code": "1.44.0",
    codex: "0.146.1",
  });
});
