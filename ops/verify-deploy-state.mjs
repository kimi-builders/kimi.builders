#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyReleaseIdentity(requiredFiles, expectedVersion) {
  const deploymentId = requiredFiles?.config?.deploymentId;
  if (deploymentId !== expectedVersion) {
    throw new Error(`Next deploymentId ${String(deploymentId)} does not match ${expectedVersion}`);
  }
}

function namedApp(apps, appName) {
  const app = apps.find((candidate) => candidate?.name === appName);
  if (!app) throw new Error(`PM2 app ${appName} is missing`);
  return app;
}

export function verifyPm2Target(apps, appName, releaseDir) {
  const app = namedApp(apps, appName);
  const expectedRoot = path.resolve(releaseDir);
  const expectedScript = path.join(expectedRoot, 'server.js');
  const actualScript = path.resolve(app.pm2_env?.pm_exec_path || '');
  const actualCwd = path.resolve(app.pm2_env?.pm_cwd || '');
  if (actualScript !== expectedScript || actualCwd !== expectedRoot) {
    throw new Error(`PM2 target mismatch (script=${actualScript}, cwd=${actualCwd})`);
  }
}

export function verifyPm2Stability(apps, appName, expectedVersion, now = Date.now()) {
  const app = namedApp(apps, appName);
  const env = app.pm2_env;
  const age = now - Number(env?.pm_uptime || 0);
  if (
    env?.status !== 'online' ||
    env?.DEPLOYMENT_VERSION !== expectedVersion ||
    Number(env?.restart_time || 0) !== 0 ||
    age < 9000
  ) {
    throw new Error('PM2 process did not remain stable for 10 seconds');
  }
}

export function verifyHealthBody(body, expectedVersion) {
  const health = JSON.parse(body);
  if (health?.ok !== true || health?.version !== expectedVersion) {
    throw new Error(`health response does not match release ${expectedVersion}`);
  }
}

export function verifyDeepHealthBody(body, expectedVersion) {
  const health = JSON.parse(body);
  if (
    health?.ok !== true ||
    health?.db !== true ||
    health?.version !== expectedVersion
  ) {
    throw new Error(`deep health response does not match release ${expectedVersion}`);
  }
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'identity') {
    verifyReleaseIdentity(JSON.parse(readFileSync(first, 'utf8')), second);
    return;
  }
  if (command === 'target') {
    verifyPm2Target(JSON.parse(await readStdin()), first, second);
    return;
  }
  if (command === 'stable') {
    verifyPm2Stability(JSON.parse(await readStdin()), first, second);
    return;
  }
  if (command === 'health') {
    verifyHealthBody(await readStdin(), first);
    return;
  }
  if (command === 'deep-health') {
    verifyDeepHealthBody(await readStdin(), first);
    return;
  }
  throw new Error('unknown deploy verification command');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(`deploy: ${error.message}`);
    process.exit(1);
  });
}
