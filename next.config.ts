import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 自托管生产用 Next 的最小 Node server;部署流水线把 public/ 与
  // .next/static 拷到 standalone 产物旁边再上传(参照 kimi-cookbook)。
  output: "standalone",

  // 部署工作流注入 git SHA;发布校验(release identity)用它确认
  // immutable release 与构建产物属于同一 commit。
  deploymentId: process.env.DEPLOYMENT_VERSION,

  // mysql2 保持外部化:Turbopack 默认把它打进 server chunks,但 release 里的
  // scripts/db-migrate.mjs 要走 createRequire 从 standalone node_modules 里
  // require 它(部署时在服务器上跑迁移),所以它必须被 nft 追踪进产物。
  serverExternalPackages: ["mysql2"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // 品牌 SVG/PNG 长期缓存(内容随部署版本固定)
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
