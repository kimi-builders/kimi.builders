#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const mysql = require('mysql2/promise');

const queries = {
  tables: `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
             FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME`,
  columns: `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT,
                   IS_NULLABLE, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME,
                   EXTRA, GENERATION_EXPRESSION
              FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ?
             ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  indexes: `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX,
                   COLUMN_NAME, COLLATION, SUB_PART, INDEX_TYPE
              FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ?
             ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  foreignKeys: `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, ORDINAL_POSITION,
                       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                  FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
                 ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
};

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
    for (const [section, sql] of Object.entries(queries)) {
      const [rows] = await connection.query(sql, [schema]);
      result[section] = normalize(rows);
    }
    return result;
  } finally {
    await connection.end();
  }
}

function firstDifference(left, right) {
  for (const section of Object.keys(queries)) {
    const leftRows = left[section];
    const rightRows = right[section];
    const limit = Math.max(leftRows.length, rightRows.length);
    for (let index = 0; index < limit; index += 1) {
      if (JSON.stringify(leftRows[index]) !== JSON.stringify(rightRows[index])) {
        return { section, index, fresh: leftRows[index], upgraded: rightRows[index] };
      }
    }
  }
  return null;
}

async function main() {
  const freshUrl = process.env.FRESH_DATABASE_URL;
  const upgradeUrl = process.env.UPGRADE_DATABASE_URL;
  if (!freshUrl || !upgradeUrl) {
    throw new Error('FRESH_DATABASE_URL and UPGRADE_DATABASE_URL are required');
  }
  const [fresh, upgraded] = await Promise.all([snapshot(freshUrl), snapshot(upgradeUrl)]);
  const difference = firstDifference(fresh, upgraded);
  if (difference) {
    console.error('fresh and upgraded database schemas differ:');
    console.error(JSON.stringify(difference, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log('schema parity: fresh install matches upgraded database');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
