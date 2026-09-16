import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const monitor = new URL("../ops/deep-health-check.sh", import.meta.url).pathname;
const verifier = new URL("../ops/verify-deploy-state.mjs", import.meta.url).pathname;

test("legacy rollback keeps the compatible shared verifier for deep health", () => {
  const root = mkdtempSync(join(tmpdir(), "kb-deep-health-"));
  const release = "a".repeat(40);
  const shared = join(root, "shared");
  const releaseDir = join(root, "releases", release);
  const bin = join(root, "bin");
  const fakeCurl = join(bin, "curl");
  const curlArgs = join(root, "curl-args");
  const currentSecret = "s".repeat(32);
  try {
    mkdirSync(shared, { recursive: true });
    mkdirSync(releaseDir, { recursive: true });
    mkdirSync(join(releaseDir, "ops"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    symlinkSync(releaseDir, join(root, "current"));
    copyFileSync(verifier, join(shared, "verify-deploy-state.mjs"));
    writeFileSync(
      join(releaseDir, "ops/verify-deploy-state.mjs"),
      "#!/usr/bin/env node\nprocess.exit(99);\n",
    );
    writeFileSync(
      join(releaseDir, ".env.production"),
      `CRON_SECRET='${currentSecret}'\n`,
    );
    writeFileSync(join(shared, ".env.production"), `CRON_SECRET='${"x".repeat(32)}'\n`);
    writeFileSync(join(bin, "logger"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(join(bin, "flock"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const run = () => spawnSync("bash", [monitor, root, "3210"], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_CURL_ARGS: curlArgs,
        PATH: `${bin}:${process.env.PATH}`,
      },
    });
    writeFileSync(
      fakeCurl,
      `#!/bin/sh\nprintf '%s\n' "$*" > "$FAKE_CURL_ARGS"\nprintf '%s' '{"ok":true,"db":true,"version":"${release}"}'\n`,
      { mode: 0o755 },
    );
    const firstHealthy = run();
    assert.equal(
      firstHealthy.status,
      0,
      `stdout=${firstHealthy.stdout}\nstderr=${firstHealthy.stderr}`,
    );
    assert.match(readFileSync(curlArgs, "utf8"), new RegExp(currentSecret));
    assert.doesNotMatch(readFileSync(curlArgs, "utf8"), new RegExp("x{32}"));
    assert.equal(readFileSync(join(shared, "health/deep-health.state"), "utf8").trim(), "healthy");

    writeFileSync(fakeCurl, "#!/bin/sh\nexit 22\n");
    chmodSync(fakeCurl, 0o755);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(join(shared, "health/deep-health.state"), "utf8").trim(), "failed");

    writeFileSync(
      fakeCurl,
      `#!/bin/sh\nprintf '%s' '{"ok":true,"db":true,"version":"${release}"}'\n`,
    );
    chmodSync(fakeCurl, 0o755);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(join(shared, "health/deep-health.state"), "utf8").trim(), "healthy");

    writeFileSync(join(bin, "flock"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, "flock"), 0o755);
    writeFileSync(fakeCurl, "#!/bin/sh\nexit 99\n");
    chmodSync(fakeCurl, 0o755);
    assert.equal(run().status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("error digest mode uses the live release secret and is rollback-safe", () => {
  const root = mkdtempSync(join(tmpdir(), "kb-error-digest-"));
  const release = "b".repeat(40);
  const shared = join(root, "shared");
  const releaseDir = join(root, "releases", release);
  const bin = join(root, "bin");
  const fakeCurl = join(bin, "curl");
  const curlArgs = join(root, "curl-args");
  const currentSecret = "d".repeat(32);
  try {
    mkdirSync(shared, { recursive: true });
    mkdirSync(releaseDir, { recursive: true });
    mkdirSync(bin, { recursive: true });
    symlinkSync(releaseDir, join(root, "current"));
    writeFileSync(join(releaseDir, ".env.production"), `CRON_SECRET='${currentSecret}'\n`);
    writeFileSync(join(releaseDir, "ERROR_DIGEST_ENABLED"), "enabled\n");
    writeFileSync(join(bin, "flock"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(
      fakeCurl,
      "#!/bin/sh\nprintf '%s\\n' \"$*\" > \"$FAKE_CURL_ARGS\"\nprintf '%s' '{\"ok\":true}'\n",
      { mode: 0o755 },
    );

    const run = () =>
      spawnSync("bash", [monitor, root, "3210", "error-digest"], {
        encoding: "utf8",
        env: {
          ...process.env,
          FAKE_CURL_ARGS: curlArgs,
          PATH: `${bin}:${process.env.PATH}`,
        },
      });

    const sent = run();
    assert.equal(sent.status, 0, `stdout=${sent.stdout}\nstderr=${sent.stderr}`);
    assert.match(readFileSync(curlArgs, "utf8"), new RegExp(currentSecret));
    assert.match(readFileSync(curlArgs, "utf8"), /\/api\/cron\/error-digest/);

    writeFileSync(
      fakeCurl,
      "#!/bin/sh\nprintf '%s' '{\"ok\":false}'\n",
      { mode: 0o755 },
    );
    assert.equal(run().status, 1);

    rmSync(join(releaseDir, "ERROR_DIGEST_ENABLED"));
    rmSync(curlArgs, { force: true });
    writeFileSync(fakeCurl, "#!/bin/sh\nexit 99\n", { mode: 0o755 });
    assert.equal(run().status, 0);
    assert.equal(existsSync(curlArgs), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
