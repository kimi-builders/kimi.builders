import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("database backup is restorable, checksummed, and published atomically", () => {
  const script = source("ops/db-backup.sh");
  assert.match(script, /--single-transaction/);
  assert.match(script, /--routines --events --triggers --hex-blob/);
  assert.doesNotMatch(script, /^\s+--databases\b/m);
  assert.match(script, /gzip -t/);
  assert.match(script, /sha256sum/);
  assert.match(script, /remote size does not match local dump/);
  assert.match(script, /--s3-no-check-bucket --s3-no-head/);
  assert.ok(
    script.indexOf('rclone copyto "$manifest_path"') >
      script.indexOf('rclone copyto "$checksum_path"'),
  );
  assert.ok(
    script.indexOf('rclone copyto "$checksum_path"') >
      script.indexOf("remote size does not match local dump"),
  );
  assert.ok(script.indexOf("backup-last-success") < script.indexOf("echo \"backup: ok"));
});

test("restore drill refuses production and database-selecting dumps", () => {
  const script = source("ops/restore-backup-drill.sh");
  assert.match(script, /refusing to run on the production application host/);
  assert.match(script, /\^kbu_restore_/);
  assert.match(script, /dump contains database-selection statements/);
  assert.match(script, /sha256sum --check/);
  assert.match(script, /mysqlcheck/);
  assert.match(script, /status --strict --require-clean/);
  assert.match(script, /DROP DATABASE IF EXISTS/);
});
