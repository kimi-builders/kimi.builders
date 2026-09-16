import assert from "node:assert/strict";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  errorDigestStats,
  insertErrorEvent,
  parseErrorReport,
  type ErrorDigestWindow,
} from "../src/lib/error-report";
import { getPool } from "../src/lib/db";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error(
    "Refusing to run error-report integration tests outside an isolated kbu-mysql database",
  );
}

async function main() {
  const pool = getPool();
  const release = `error-integration-${Date.now().toString(36)}`;
  const window: ErrorDigestWindow = {
    key: "2099-01-02",
    start: new Date("2099-01-02T00:00:00.000Z"),
    end: new Date("2099-01-03T00:00:00.000Z"),
  };

  try {
    const repeated = parseErrorReport({
      source: "client",
      message: "TypeError: integration failure?token=secret",
      url: "https://kimi.builders/login/reset?token=secret",
      stack: "at render (app.js:1)\nat root (app.js:2)\nat tail (app.js:3)",
    });
    const distinct = parseErrorReport({
      source: "global",
      message: "ReferenceError: integration failure",
      url: "/works/7?state=private",
      stack: "at global (app.js:9)",
    });
    assert.ok(repeated && distinct);

    await insertErrorEvent(repeated, { release, userAgent: "integration-browser" }, pool);
    await insertErrorEvent(repeated, { release, userAgent: "integration-browser" }, pool);
    await insertErrorEvent(distinct, { release, userAgent: "integration-browser" }, pool);
    await pool.execute<ResultSetHeader>(
      "UPDATE error_events SET created_at = ? WHERE `release` = ?",
      [new Date("2099-01-02T12:00:00.000Z"), release],
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT source, `release`, fingerprint, url, message, user_agent FROM error_events WHERE `release` = ? ORDER BY id",
      [release],
    );
    assert.equal(rows.length, 3);
    assert.equal(rows[0].release, release);
    assert.equal(rows[0].url, "/login/reset");
    assert.doesNotMatch(String(rows[0].message), /token=secret/);
    assert.equal(rows[0].user_agent, "integration-browser");
    assert.match(String(rows[0].fingerprint), /^[0-9a-f]{64}$/);
    assert.equal(rows[0].fingerprint, rows[1].fingerprint);
    assert.notEqual(rows[1].fingerprint, rows[2].fingerprint);

    const stats = await errorDigestStats(window, pool);
    assert.deepEqual(stats, {
      total: 3,
      topSource: "client",
      topMessage: rows[0].message,
      topCount: 2,
    });

    const [privacyColumns] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'error_events'
         AND COLUMN_NAME = 'user_id'`,
    );
    assert.equal(privacyColumns.length, 0);
  } finally {
    await pool.query("DELETE FROM error_events WHERE `release` = ?", [release]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
