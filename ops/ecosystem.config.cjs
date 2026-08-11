/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("node:path");

const releaseDir = process.env.RELEASE_DIR;

if (!releaseDir || !path.isAbsolute(releaseDir)) {
  throw new Error("RELEASE_DIR must be an absolute release directory");
}

module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || "kimi-builders",
      script: path.join(releaseDir, "server.js"),
      cwd: releaseDir,
      instances: 1,
      exec_mode: "cluster",
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 10,
      listen_timeout: 15_000,
      kill_timeout: 30_000,
      max_memory_restart: process.env.PM2_MAX_MEMORY || "1G",
      env_production: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        HOSTNAME: "127.0.0.1",
        PORT: process.env.APP_PORT || "3210",
        DEPLOYMENT_VERSION:
          process.env.DEPLOYMENT_VERSION || "development",
      },
    },
  ],
};
