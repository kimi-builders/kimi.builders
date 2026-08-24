#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function changedAppliedMigrations(nameStatus) {
  return nameStatus
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [status, ...paths] = line.split(/\s+/);
      if (status === 'A') return [];
      return paths.filter((path) => path.startsWith('db/migrations/'));
    });
}

export function verifyAppendOnlyOrder(previous, current) {
  if (current.length < previous.length) {
    throw new Error('db/migration-order.txt cannot remove applied migrations');
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== current[index]) {
      throw new Error('db/migration-order.txt is append-only');
    }
  }
}

function main() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('usage: node scripts/check-migration-immutability.mjs <base-ref>');
    process.exit(2);
  }
  const result = spawnSync(
    'git',
    ['diff', '--name-status', '--find-renames', `${baseRef}...HEAD`, '--', 'db/migrations'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  const changed = changedAppliedMigrations(result.stdout);
  if (changed.length > 0) {
    console.error('Applied migration files are immutable. Add a corrective migration instead:');
    for (const path of changed) console.error(`  ${path}`);
    process.exit(1);
  }

  const previousOrder = spawnSync('git', ['show', `${baseRef}:db/migration-order.txt`], {
    encoding: 'utf8',
  });
  if (previousOrder.status === 0) {
    const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);
    verifyAppendOnlyOrder(
      lines(previousOrder.stdout),
      lines(readFileSync('db/migration-order.txt', 'utf8')),
    );
  }
  console.log('migration immutability: ok');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
