import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyMigrationFile, splitStatements } from "../scripts/db-migrate.mjs";

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

test("old partial DDL is adopted when MySQL reports an unambiguous duplicate", async () => {
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
  const result = await applyMigrationFile(
    db,
    "legacy-partial.sql",
    "ALTER TABLE users ADD COLUMN already_there INT;",
  );
  assert.equal(result.executed, 1);
  assert.deepEqual(steps.map((step) => step.step_index), [0]);
});

test("comments governance index matches hidden-state filter plus id cursor order", () => {
  const sql = readFileSync(
    new URL("../db/migrations/20260831_comments_hidden_index.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /\(hidden_at, id\)/);
});
