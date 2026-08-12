#!/usr/bin/env node
/* db-migrate — kimi.builders migration runner (zero deps, Node >=20).
 *
 * Commands:
 *   migrate (default)  apply pending db/migrations/*.sql in filename order
 *   status             show applied / pending / checksum drift
 *   init-ledger        mark ALL migration files as applied WITHOUT running them
 *                      — only for databases already up to date (backfills the
 *                      ledger with checksum='legacy'; drift checks skip those)
 *   init-ledger --files-from <path>
 *                      mark only the files listed in <path> (one per line,
 *                      basenames or db/migrations/ paths) — CI upgrade-path use
 *
 * Env: DATABASE_URL=mysql://user:pass@host:3306/dbname (required).
 *
 * Design notes:
 * - File completion lives in _migrations; every statement is additionally
 *   checkpointed in _migration_steps because MySQL DDL auto-commits.
 * - Editing an already-applied migration is flagged as checksum drift
 *   (warning only) — write a corrective migration instead.
 * - A failed file resumes after its last completed statement. Recognized
 *   duplicate-DDL errors from an old partially-applied run are adopted once.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const mysql = require('mysql2/promise');

const ROOT = new URL('../', import.meta.url).pathname;
const MIGRATIONS_DIR = `${ROOT}db/migrations`;

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

function isAlreadyAppliedDdlError(error) {
  return new Set([
    'ER_DUP_FIELDNAME',
    'ER_DUP_KEYNAME',
    'ER_FK_DUP_NAME',
    'ER_TABLE_EXISTS_ERROR',
  ]).has(error?.code);
}

/* MySQL DDL 不能与 ledger INSERT 原子提交；逐句 checkpoint 把失败窗口缩到单句。
   对旧 runner 留下的“statement 已成功但 file 未记账”状态，仅收编明确的重复 DDL。 */
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
    try {
      await connection.query(statement);
    } catch (error) {
      if (!isAlreadyAppliedDdlError(error)) throw error;
    }
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

    const drift = files.filter(
      (file) =>
        applied.has(file) &&
        applied.get(file) !== 'legacy' &&
        applied.get(file) !== sha256(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')),
    );
    for (const file of drift) {
      console.warn(`⚠ checksum drift: ${file} was applied but its content changed — do not edit applied migrations; write a corrective one`);
    }

    const pending = files.filter((file) => !applied.has(file));

    if (command === 'status') {
      console.log(`applied: ${applied.size}  pending: ${pending.length}  drift: ${drift.length}`);
      for (const file of pending) console.log(`  pending  ${file}`);
      for (const file of drift) console.log(`  drift    ${file}`);
      return;
    }

    if (command !== 'migrate') {
      console.error(`unknown command: ${command}`);
      process.exit(2);
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
