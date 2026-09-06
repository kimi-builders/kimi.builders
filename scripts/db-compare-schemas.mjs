#!/usr/bin/env node
/* Structural parity check between a fresh schema.sql install and a
   database replayed through every migration (CI db-validate.yml). All
   differences are collected and reported — bailing at the first one let
   an unrelated table-list mismatch mask the real drift behind it. Rows
   are keyed by identity (table/column/index), never by position. */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const mysql = require('mysql2/promise');

const queries = {
  tables: {
    sql: `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
            FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
           ORDER BY TABLE_NAME`,
    key: (row) => row.TABLE_NAME,
  },
  columns: {
    sql: `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT,
                 IS_NULLABLE, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME,
                 EXTRA, GENERATION_EXPRESSION
            FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME, COLUMN_NAME`,
    key: (row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`,
  },
  indexes: {
    sql: `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX,
                 COLUMN_NAME, COLLATION, SUB_PART, INDEX_TYPE
            FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    key: (row) => `${row.TABLE_NAME}.${row.INDEX_NAME}.${row.SEQ_IN_INDEX}`,
  },
  foreignKeys: {
    sql: `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, ORDINAL_POSITION,
                 REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
           ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
    key: (row) => `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}.${row.COLUMN_NAME}`,
  },
};

/* Keep CI logs readable when a comparison diverges badly. */
const MAX_DIFFS_PER_SECTION = 20;

function databaseName(rawUrl) {
  const name = decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, ''));
  if (!name) throw new Error('database URL must include a database name');
  return name;
}

function normalize(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value === undefined ? null : value]),
  ));
}

async function snapshot(rawUrl) {
  const connection = await mysql.createConnection({ uri: rawUrl, timezone: 'Z' });
  const schema = databaseName(rawUrl);
  try {
    const result = {};
    for (const [section, { sql }] of Object.entries(queries)) {
      const [rows] = await connection.query(sql, [schema]);
      result[section] = normalize(rows);
    }
    return result;
  } finally {
    await connection.end();
  }
}

/* Returns a list of human-readable differences for one section:
   rows present on only one side, and rows present on both whose
   attributes diverge (e.g. TABLE_COLLATION). */
function sectionDifferences(section, leftRows, rightRows, sideNames) {
  const [leftName, rightName] = sideNames;
  const left = new Map(leftRows.map((row) => [queries[section].key(row), row]));
  const right = new Map(rightRows.map((row) => [queries[section].key(row), row]));
  const diffs = [];
  for (const [key, row] of left) {
    if (!right.has(key)) diffs.push(`only in ${leftName}: ${key} = ${JSON.stringify(row)}`);
  }
  for (const [key, row] of right) {
    if (!left.has(key)) diffs.push(`only in ${rightName}: ${key} = ${JSON.stringify(row)}`);
  }
  for (const [key, leftRow] of left) {
    const rightRow = right.get(key);
    if (!rightRow) continue;
    for (const attr of Object.keys(leftRow)) {
      if (leftRow[attr] !== rightRow[attr]) {
        diffs.push(
          `${key}.${attr}: ${leftName}=${JSON.stringify(leftRow[attr])} ${rightName}=${JSON.stringify(rightRow[attr])}`,
        );
      }
    }
  }
  return diffs;
}

async function main() {
  const freshUrl = process.env.FRESH_DATABASE_URL;
  const upgradeUrl = process.env.UPGRADE_DATABASE_URL;
  if (!freshUrl || !upgradeUrl) {
    throw new Error('FRESH_DATABASE_URL and UPGRADE_DATABASE_URL are required');
  }
  const leftName = `${databaseName(freshUrl)} (fresh)`;
  const rightName = `${databaseName(upgradeUrl)} (upgraded)`;
  const [fresh, upgraded] = await Promise.all([snapshot(freshUrl), snapshot(upgradeUrl)]);

  let total = 0;
  for (const section of Object.keys(queries)) {
    const diffs = sectionDifferences(
      section,
      fresh[section],
      upgraded[section],
      [leftName, rightName],
    );
    if (diffs.length === 0) continue;
    total += diffs.length;
    console.error(`schema mismatch in ${section} (${diffs.length}):`);
    for (const line of diffs.slice(0, MAX_DIFFS_PER_SECTION)) console.error(`  ${line}`);
    if (diffs.length > MAX_DIFFS_PER_SECTION) {
      console.error(`  … and ${diffs.length - MAX_DIFFS_PER_SECTION} more`);
    }
  }
  if (total > 0) {
    console.error(`fresh and upgraded database schemas differ: ${total} difference(s)`);
    process.exitCode = 1;
    return;
  }
  console.log('schema parity: fresh install matches upgraded database');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
