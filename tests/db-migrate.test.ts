import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  applyMigrationFile,
  classifyMigrationState,
  parseFlags,
  splitStatements,
  statusExitCode,
} from "../scripts/db-migrate.mjs";
import {
  changedAppliedMigrations,
  verifyAppendOnlyOrder,
} from "../scripts/check-migration-immutability.mjs";

interface FakeStep {
  step_index: number;
  checksum: string;
}

function fakeConnection(failOnceOn = "") {
  const steps: FakeStep[] = [];
  const executed: string[] = [];
  const files: string[] = [];
  let failed = false;
  return {
    steps,
    executed,
    files,
    async query(sql: string, args: unknown[] = []) {
      if (sql.startsWith("SELECT step_index")) return [steps];
      if (sql.startsWith("INSERT INTO _migration_steps")) {
        steps.push({ step_index: Number(args[1]), checksum: String(args[2]) });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("INSERT INTO _migrations")) {
        files.push(String(args[0]));
        return [{ affectedRows: 1 }];
      }
      executed.push(sql);
      if (!failed && failOnceOn && sql.includes(failOnceOn)) {
        failed = true;
        throw new Error("injected statement failure");
      }
      return [{}];
    },
  };
}

test("statement splitter strips line comments and preserves ordered SQL blocks", () => {
  assert.deepEqual(
    splitStatements("-- head\nALTER ONE;\n\n-- next\nALTER TWO;\n"),
    ["ALTER ONE", "ALTER TWO"],
  );
});

test("failed migration resumes after checkpointed statements instead of rerunning DDL", async () => {
  const db = fakeConnection("ALTER TWO");
  const sql = "ALTER ONE;\nALTER TWO;\nALTER THREE;";
  await assert.rejects(() => applyMigrationFile(db, "x.sql", sql), /injected/);
  assert.deepEqual(db.executed, ["ALTER ONE", "ALTER TWO"]);
  assert.deepEqual(db.steps.map((step) => step.step_index), [0]);

  const result = await applyMigrationFile(db, "x.sql", sql);
  assert.deepEqual(db.executed, ["ALTER ONE", "ALTER TWO", "ALTER TWO", "ALTER THREE"]);
  assert.deepEqual(result, { statements: 3, executed: 2, skipped: 1 });
  assert.deepEqual(db.steps.map((step) => step.step_index), [0, 1, 2]);
  assert.deepEqual(db.files, ["x.sql"]);
});

test("a recorded statement checksum drift fails closed before executing it", async () => {
  const db = fakeConnection();
  await applyMigrationFile(db, "drift.sql", "ALTER ORIGINAL;");
  db.files.length = 0;
  await assert.rejects(
    () => applyMigrationFile(db, "drift.sql", "ALTER CHANGED;"),
    /statement 1 checksum drift/,
  );
  assert.deepEqual(db.executed, ["ALTER ORIGINAL"]);
});

test("duplicate DDL fails closed instead of recording an unverified step", async () => {
  const steps: FakeStep[] = [];
  const db = {
    async query(sql: string, args: unknown[] = []) {
      if (sql.startsWith("SELECT step_index")) return [steps];
      if (sql.startsWith("ALTER TABLE")) {
        throw Object.assign(new Error("Duplicate column"), { code: "ER_DUP_FIELDNAME" });
      }
      if (sql.startsWith("INSERT INTO _migration_steps")) {
        steps.push({ step_index: Number(args[1]), checksum: String(args[2]) });
      }
      return [{}];
    },
  };
  await assert.rejects(
    () => applyMigrationFile(
      db,
      "legacy-partial.sql",
      "ALTER TABLE users ADD COLUMN already_there INT;",
    ),
    /Duplicate column/,
  );
  assert.deepEqual(steps, []);
});

test("migration state reports drift, pending, and missing applied files", () => {
  const state = classifyMigrationState(
    new Map([
      ["001.sql", "current-001"],
      ["002.sql", "current-002"],
      ["003.sql", "current-003"],
    ]),
    new Map([
      ["001.sql", "current-001"],
      ["002.sql", "old-002"],
      ["removed.sql", "old-removed"],
    ]),
  );

  assert.deepEqual(state.pending, ["003.sql"]);
  assert.deepEqual(state.drift, ["002.sql"]);
  assert.deepEqual(state.missing, ["removed.sql"]);
});

test("status exit contract: gates fail on pending, pre-migrate tolerates it", () => {
  const dirty = { pending: ["004.sql"], drift: [], missing: [] };
  const broken = { pending: [], drift: ["002.sql"], missing: [] };
  const hole = { pending: [], drift: [], missing: ["gone.sql"] };

  /* Deploy gates must pin their contract explicitly. */
  assert.equal(statusExitCode(dirty, parseFlags(["--strict", "--require-clean"])), 1);
  /* Pre-migrate status tolerates pending but never drift/missing. */
  assert.equal(statusExitCode(dirty, parseFlags(["--strict", "--allow-pending"])), 0);
  assert.equal(statusExitCode(broken, parseFlags(["--strict", "--allow-pending"])), 1);
  assert.equal(statusExitCode(hole, parseFlags(["--strict", "--allow-pending"])), 1);
  /* Clean state passes under every flag combination. */
  const clean = { pending: [], drift: [], missing: [] };
  assert.equal(statusExitCode(clean, parseFlags(["--strict", "--require-clean"])), 0);
  assert.equal(statusExitCode(clean, parseFlags([])), 0);
  /* Bare `status` is the human informational mode: pending prints, exit 0. */
  assert.equal(statusExitCode(dirty, parseFlags([])), 0);
});

test("runner flags: unknown or contradictory flags fail loudly instead of being ignored", () => {
  assert.deepEqual(parseFlags(["--strict"]), {
    strict: true,
    requireClean: false,
    allowPending: false,
    freshSchema: false,
    filesFrom: null,
  });
  assert.equal(parseFlags(["--files-from", "list.txt"]).filesFrom, "list.txt");
  assert.throws(() => parseFlags(["--strick"]), /unknown flag/);
  assert.throws(
    () => parseFlags(["--require-clean", "--allow-pending"]),
    /contradictory/,
  );
  assert.throws(() => parseFlags(["--files-from"]), /--files-from requires/);
});

test("pending migrations preserve the explicit dependency order", () => {
  const state = classifyMigrationState(
    new Map([
      ["later-name.sql", "one"],
      ["earlier-name.sql", "two"],
    ]),
    new Map(),
  );
  assert.deepEqual(state.pending, ["later-name.sql", "earlier-name.sql"]);
});

test("migration immutability permits additions and rejects edits, deletes, or renames", () => {
  const changes = [
    "A\tdb/migrations/004.sql",
    "M\tdb/migrations/001.sql",
    "D\tdb/migrations/002.sql",
    "R100\tdb/migrations/003.sql\tdb/migrations/renamed.sql",
    "M\tdb/schema.sql",
  ].join("\n");
  assert.deepEqual(changedAppliedMigrations(changes), [
    "db/migrations/001.sql",
    "db/migrations/002.sql",
    "db/migrations/003.sql",
    "db/migrations/renamed.sql",
  ]);
});

test("migration order is complete, dependency-safe, and append-only", () => {
  const order = readFileSync(
    new URL("../db/migration-order.txt", import.meta.url),
    "utf8",
  ).trim().split("\n");
  const migrationNames = readdirSync(
    new URL("../db/migrations", import.meta.url),
  ).filter((name) => name.endsWith(".sql")).sort();
  assert.deepEqual([...order].sort(), migrationNames);
  assert.ok(
    order.indexOf("20260816_work_ai_summon.sql") >
      order.indexOf("20260821_work_interactions.sql"),
  );
  assert.doesNotThrow(() => verifyAppendOnlyOrder(order, [...order, "next.sql"]));
  assert.throws(
    () => verifyAppendOnlyOrder(order, [order[1], order[0], ...order.slice(2)]),
    /append-only/,
  );
});

test("comments governance index matches hidden-state filter plus id cursor order", () => {
  const sql = readFileSync(
    new URL("../db/migrations/20260831_comments_hidden_index.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /\(hidden_at, id\)/);
});

test("analytics event storage stays pinned in the migration and schema", () => {
  const migration = readFileSync(
    new URL("../db/migrations/20260903_analytics_events.sql", import.meta.url),
    "utf8",
  );
  const schema = readFileSync(
    new URL("../db/schema.sql", import.meta.url),
    "utf8",
  );

  for (const source of [migration, schema]) {
    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS analytics_events\s*\(/,
    );
    assert.match(source, /viewer CHAR\(64\) NOT NULL/);
    assert.match(source, /meta JSON NULL/);
    assert.match(
      source,
      /KEY idx_event_time \(event, created_at\)/,
    );
    assert.match(
      source,
      /KEY idx_target \(target_kind, target_id, created_at\)/,
    );
  }
});
