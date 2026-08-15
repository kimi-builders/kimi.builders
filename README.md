# kimi.builders

[kimi.builders](https://kimi.builders) 社区官方站点 —— Kimi 用户自建的公益 builder 社区（非官方）的门面与网络平台。

## 简介

站点承载社区的线上阵地：首页定位与品牌展示、社区讨论、成员作品墙、Token 用量统计、知识库与 Awesome 清单展示等。视觉体系来自社区品牌资产包 [kimi-builders-brand-kit](https://github.com/kimi-builders/kimi-builders-brand-kit)（月球 + 轨道 + 双星 Logo，已内置于 `public/brand/`）。

## 技术栈

- **框架**：Next.js 16（App Router · Turbopack）+ React 19 + TypeScript
- **样式**：Tailwind CSS v4，品牌令牌见 `app/globals.css`
- **数据库**：MySQL（`mysql2` 连接池，见 `src/lib/db.ts`）；表结构定义在 `db/schema.sql`，演进走 `db/migrations/`（`npm run db:migrate`）
- **包管理**：npm（唯一锁文件 `package-lock.json`，CI 用 `npm ci`）
- **部署**：自托管 —— GitHub Actions（`.github/workflows/deploy.yml`）构建 standalone 产物，rsync 到服务器，先跑数据库迁移再 PM2 原子重启（`ops/deploy-release.sh`），最后按 `/api/health` 的版本号校验本次提交已上线。定时任务在服务器 crontab：`cron-call.sh` 携带 `CRON_SECRET` 调用 `/api/cron/*`（AI 回帖重试每 10 分钟、用量/分析清理每日、数据库备份每日）

## 目录结构

```
app/            # App Router 页面与全局样式、站点图标
public/brand/   # 品牌资产(Logo 动/静态、头像)
src/lib/        # 服务端模块(数据库连接等)
db/schema.sql   # MySQL 表结构
docs/           # 设计文档(本地,不入库)
```

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填写 DATABASE_URL、OAuth、KIMI_API_KEY 等
npm run dev
```

数据库初始化：在 MySQL 实例上执行 `db/schema.sql`。

## License

[MIT](./LICENSE)
