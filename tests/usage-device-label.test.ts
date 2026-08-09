import assert from "node:assert/strict";
import test from "node:test";
import {
  isGenericUsageDeviceName,
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
    "Terminal · macOS · v0.3.3",
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
  assert.equal(usageSurfaceLabel("daemon"), "Background sync");
});
