#!/usr/bin/env node
/* db-migrate — kimi.builders migration runner (zero deps, Node >=20).
 *
 * Commands:
 *   migrate (default)  apply pending db/migrations/*.sql in filename order
 *   status             show applied / pending / checksum drift
 *   init-ledger        mark ALL migration files as applied WITHOUT running them
 *                      — only for databases already up to date (backfills the
 *                      ledger with checksum='legacy'; drift checks skip those)
 *   init-ledger --fresh-schema
 *                      seed canonical data after loading db/schema.sql, then
 *                      initialize the complete legacy ledger
 *   init-ledger --files-from <path>
 *                      mark only the files listed in <path> (one per line,
 *                      basenames or db/migrations/ paths) — CI upgrade-path use
 *
 * Env: DATABASE_URL=mysql://user:pass@host:3306/dbname (required).
 *
 * Design notes:
 * - File completion lives in _migrations; every statement is additionally
 *   checkpointed in _migration_steps because MySQL DDL auto-commits.
 * - Editing or removing an already-applied migration fails closed.
 * - A failed file resumes after its last completed statement. A duplicate DDL
 *   error is never adopted without operator verification.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const mysql = require('mysql2/promise');

const ROOT = new URL('../', import.meta.url).pathname;
const MIGRATIONS_DIR = `${ROOT}db/migrations`;

const FRESH_SCHEMA_DATA_MIGRATIONS = [
  '20260809_usage_phase2.sql',
  '20260809_usage_prices_v2.sql',
  '20260810_usage_prices_v3.sql',
  '20260811_usage_prices_v4.sql',
  '20260813_usage_cost_facts.sql',
  '20260915_usage_price_kimi_for_coding.sql',
  '20260917_kimi_for_coding_price_source.sql',
  '20260919_usage_prices_v5.sql',
  '20260919_usage_prices_v5_repair.sql',
  '20260919_usage_prices_v6.sql',
];

const command = process.argv[2] ?? 'migrate';

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

/* MySQL DDL cannot commit atomically with the ledger INSERT. Per-statement
   checkpoints shrink the failure window to one statement. If DDL succeeds but
   its checkpoint does not, the retry fails closed so an operator can verify the
   exact database shape before recording recovery state. */
export async function applyMigrationFile(connection, file, sql) {
  const statements = splitStatements(sql);
  const [rows] = await connection.query(
    'SELECT step_index, checksum FROM _migration_steps WHERE migration_name = ? ORDER BY step_index',
    [file],
  );
  const appliedSteps = new Map(rows.map((row) => [Number(row.step_index), row.checksum]));
  let executed = 0;
  let skipped = 0;
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    const checksum = sha256(statement);
    const recorded = appliedSteps.get(index);
    if (recorded !== undefined) {
      if (recorded !== checksum) {
        throw new Error(`${file} statement ${index + 1} checksum drift`);
      }
      skipped += 1;
      continue;
    }
    await connection.query(statement);
    await connection.query(
      'INSERT INTO _migration_steps (migration_name, step_index, checksum) VALUES (?, ?, ?)',
      [file, index, checksum],
    );
    executed += 1;
  }
  await connection.query('INSERT INTO _migrations (name, checksum) VALUES (?, ?)', [
    file,
    sha256(sql),
  ]);
  return { statements: statements.length, executed, skipped };
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

export function classifyMigrationState(current, applied) {
  const pending = [...current.keys()].filter((file) => !applied.has(file)).sort();
  const drift = [...current.entries()]
    .filter(([file, checksum]) => {
      const recorded = applied.get(file);
      return recorded !== undefined && recorded !== 'legacy' && recorded !== checksum;
    })
    .map(([file]) => file)
    .sort();
  const missing = [...applied.keys()].filter((file) => !current.has(file)).sort();
  return { pending, drift, missing };
}

export function freshSchemaDataStatements(
  allowedFiles = new Set(FRESH_SCHEMA_DATA_MIGRATIONS),
) {
  return FRESH_SCHEMA_DATA_MIGRATIONS
    .filter((name) => allowedFiles.has(name))
    .flatMap((file) => {
      const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8');
      return splitStatements(sql).filter((statement) =>
        /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(statement),
      );
    });
}

async function seedFreshSchema(connection, allowedFiles) {
  for (const statement of freshSchemaDataStatements(allowedFiles)) {
    await connection.query(statement);
  }
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM usage_model_prices
      WHERE pricing_source_url <> '' AND verified_at IS NOT NULL`,
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    throw new Error('fresh schema seed verification failed: no verified usage prices');
  }
}

function maskUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.username}@${url.host}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }
  console.log(`target: ${maskUrl(databaseUrl)}`);
  const connection = await mysql.createConnection({ uri: databaseUrl, timezone: 'Z' });
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(190) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL COMMENT 'sha256 of file at apply time; "legacy" = backfilled, drift check skipped',
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.query(`CREATE TABLE IF NOT EXISTS _migration_steps (
      migration_name VARCHAR(190) NOT NULL,
      step_index INT UNSIGNED NOT NULL,
      checksum VARCHAR(64) NOT NULL COMMENT 'sha256 of normalized statement at apply time',
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (migration_name, step_index)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const files = migrationFiles();
    const current = new Map(
      files.map((file) => [file, sha256(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'))]),
    );
    const [rows] = await connection.query('SELECT name, checksum FROM _migrations');
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));

    if (command === 'init-ledger') {
      let names = files;
      const marker = process.argv.indexOf('--files-from');
      if (marker !== -1) {
        const listed = readFileSync(process.argv[marker + 1], 'utf8')
          .split('\n')
          .map((line) => line.trim().replace(/^db\/migrations\//, ''))
          .filter((line) => line.endsWith('.sql'));
        names = listed;
      }
      if (process.argv.includes('--fresh-schema')) {
        if (applied.size !== 0) {
          throw new Error('init-ledger --fresh-schema requires an empty migration ledger');
        }
        await seedFreshSchema(connection, new Set(names));
        console.log('fresh-schema: canonical data seeded and verified');
      }
      let marked = 0;
      for (const name of names) {
        const [result] = await connection.query(
          "INSERT IGNORE INTO _migrations (name, checksum) VALUES (?, 'legacy')",
          [name],
        );
        marked += result.affectedRows;
      }
      console.log(`init-ledger: ${marked} new, ${names.length - marked} already recorded (checksum='legacy')`);
      return;
    }

    const { pending, drift, missing } = classifyMigrationState(current, applied);
    for (const file of drift) {
      console.error(`checksum drift: ${file} was applied but its content changed; write a corrective migration`);
    }
    for (const file of missing) {
      console.error(`missing migration: ${file} is recorded in the database but absent from this release`);
    }

    if (command === 'status') {
      console.log(`applied: ${applied.size}  pending: ${pending.length}  drift: ${drift.length}  missing: ${missing.length}`);
      for (const file of pending) console.log(`  pending  ${file}`);
      for (const file of drift) console.log(`  drift    ${file}`);
      for (const file of missing) console.log(`  missing  ${file}`);
      const allowPending = process.argv.includes('--allow-pending');
      if (drift.length > 0 || missing.length > 0 || (!allowPending && pending.length > 0)) {
        process.exitCode = 1;
      }
      return;
    }

    if (command !== 'migrate') {
      console.error(`unknown command: ${command}`);
      process.exit(2);
    }

    if (drift.length > 0 || missing.length > 0) {
      throw new Error('migration integrity check failed; no pending migration was applied');
    }

    if (pending.length === 0) {
      console.log('nothing to apply — database is up to date');
      return;
    }
    console.log(`applying ${pending.length} migration(s):`);
    for (const file of pending) {
      const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8');
      const statements = splitStatements(sql);
      process.stdout.write(`  ${file} (${statements.length} statements) … `);
      try {
        const result = await applyMigrationFile(connection, file, sql);
        console.log(`ok (${result.executed} run, ${result.skipped} resumed)`);
      } catch (error) {
        console.log('FAILED');
        console.error(`  statement error: ${error.message}`);
        console.error('  completed statements are checkpointed — fix and re-run to resume');
        process.exitCode = 1;
        return;
      }
    }
    console.log('done');
  } finally {
    await connection.end();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
