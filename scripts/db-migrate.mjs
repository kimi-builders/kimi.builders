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
 * - Idempotency lives in the _migrations ledger, not in SQL shape: one-shot
 *   ALTERs are exactly-once. Seed migrations stay re-runnable by their own
 *   guards but still run only once per database through the ledger.
 * - Editing an already-applied migration is flagged as checksum drift
 *   (warning only) — write a corrective migration instead.
 * - MySQL DDL auto-commits; a failed file may be partially applied. Fix the
 *   file or the DB and re-run — the ledger only records completed files.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const mysql = require('mysql2/promise');

const ROOT = new URL('../', import.meta.url).pathname;
const MIGRATIONS_DIR = `${ROOT}db/migrations`;

const command = process.argv[2] ?? 'migrate';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function splitStatements(sql) {
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
        for (const statement of statements) await connection.query(statement);
        await connection.query('INSERT INTO _migrations (name, checksum) VALUES (?, ?)', [
          file,
          sha256(sql),
        ]);
        console.log('ok');
      } catch (error) {
        console.log('FAILED');
        console.error(`  statement error: ${error.message}`);
        console.error('  ledger not updated — fix and re-run; earlier files are recorded');
        process.exitCode = 1;
        return;
      }
    }
    console.log('done');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
