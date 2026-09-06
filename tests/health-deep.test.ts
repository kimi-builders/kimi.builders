import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolConnection } from "mysql2/promise";
import {
  acquireHealthConnection,
  probeDatabase,
} from "../app/api/health/deep/route";

test("deep health acquisition times out and releases a late connection", async () => {
  let resolveConnection!: (connection: PoolConnection) => void;
  const pending = new Promise<PoolConnection>((resolve) => {
    resolveConnection = resolve;
  });
  const pool = {
    getConnection: () => pending,
  } as Pick<Pool, "getConnection">;

  await assert.rejects(
    acquireHealthConnection(pool, 10),
    /connection acquisition timed out/,
  );

  let releases = 0;
  resolveConnection({ release: () => releases += 1 } as unknown as PoolConnection);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(releases, 1);
});

test("deep health uses a query deadline without mutating session state", async () => {
  let options: { sql?: string; timeout?: number } | undefined;
  let releases = 0;
  const connection = {
    query: async (value: { sql?: string; timeout?: number }) => {
      options = value;
      return [[], []];
    },
    release: () => releases += 1,
  } as unknown as PoolConnection;
  const pool = {
    getConnection: async () => connection,
  } as Pick<Pool, "getConnection">;

  await probeDatabase(pool, 100);
  assert.equal(options?.sql, "SELECT 1");
  assert.ok(Number(options?.timeout) > 0 && Number(options?.timeout) <= 100);
  assert.equal(releases, 1);
});
