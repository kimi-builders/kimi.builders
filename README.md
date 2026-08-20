# kimi.builders

[English](./README_EN.md) · 中文

[kimi.builders](https://kimi.builders) —— Kimi 用户自建的公益 builder 社区(非官方)的线上阵地:
讨论、作品、用量、知识,以及一个真正住在社区里的 AI。

![首页](docs/images/home-dark.png)

## 功能特性

- **社区讨论**:发帖(文字/链接/投票)、楼中楼评论、顶踩、订阅与消息通知、私密帖、治理与审计。
- **AI 原生互动**([@kimi 召唤](#ai-召唤)):新帖可自动获得 Kimi 小筑(AI)的回复;在任何帖子、
  作品、Awesome 条目的评论区 `@kimi` 即可召唤它回答问题——两级开关(全局 + 内容级)、
  独立限流、召唤等待反馈、回复进通知中心。
- **作品墙**:成员展示用 Kimi 构建的作品,含截图九宫格、封面色调、构建投入(已验证 token 用量)。
- **Awesome 清单**:收录全世界用 Kimi 构建的项目,社区成员共建。
- **用量中心**:本地 CLI 采集 Kimi Code 等 Agent 的 token 用量,同步到个人看板——
  模型分布、费用估算、趋势图、分享海报;数据默认私有。CLI 见
  [kimi-builders/usage](https://github.com/kimi-builders/usage)。

## 相关项目

- **[kimi-builders/usage](https://github.com/kimi-builders/usage)** — 用量采集 CLI
  (npm `@kimi.builders/usage`):读取 Kimi Code、Claude Code、Codex、OpenCode 等 Agent
  已保存在本机的日志,汇总 Token、标准 API 费用估算、活跃时长、模型与项目分布;
  本地看板无需账号、默认不联网,同步到本站用量中心是可选能力(仅脱敏聚合数据)。
- **[kimi-builders-brand-kit](https://github.com/kimi-builders/kimi-builders-brand-kit)** ——
  社区品牌资产包(月球 + 轨道 + 双星 Logo),已内置于 `public/brand/`。
- **月刊与知识库**:社区月刊(`blog`)、新手指南与教程(`learn`)、Demo Night 活动页。
- **双语与双主题**:中文/English 一键切换;深色/浅色主题 + poster/soft 两种视觉气质。

## 公开价格目录 API

本站与 `@kimi.builders/usage` 共用同一份版本化标准 API 美元价格目录：
`GET /api/public/usage-pricing/v1/catalog`。端点无需登录，支持 `ETag` / `If-None-Match`，
只返回模型匹配规则、价格、生效窗口与来源，不接收或返回任何用户用量。CLI 会严格校验
schema、revision 和 SHA-256 完整性；更新失败时继续使用本机 last-known-good 或随包内置快照。
目录 revision 只增不改，同一 revision 不允许静默替换内容。

## 截图

| 社区讨论 | 作品墙 | Awesome |
|---|---|---|
| ![社区](docs/images/community.png) | ![作品墙](docs/images/works.png) | ![Awesome](docs/images/awesome.png) |

| @kimi 召唤 | 用量中心 |
|---|---|
| ![召唤](docs/images/post-summon.png) | ![用量](docs/images/usage.png) |

| 社区(浅色主题) | 移动端首页 |
|---|---|
| ![社区·浅色](docs/images/community-light.png) | <img src="docs/images/mobile-home.png" width="260" alt="移动端首页"> |

## AI 召唤

社区的一等公民是「Kimi 小筑」(bot)。三种互动方式:

1. **自动回帖**:发帖时勾选「允许 Kimi 小筑回复本帖」(默认开),小筑会针对帖子内容回一条;
2. **@kimi 召唤**:帖子/作品/Awesome 的评论或发帖正文里写 `@kimi`(编辑器输 `@` 有自动补全),
   小筑会结合上下文回答你的问题;发帖时 @ 与自动回帖合并为一条,不会刷屏;
3. **接话**:回复小筑的评论,它会带着对话链继续聊(单链有深度上限,防无限接龙)。

尊重内容所有者:帖主/作者关闭「AI 参与」后,其内容下不可召唤;用户可在设置里全局关闭 AI 互动、
或仅在浏览时隐藏 AI 回复。召唤有独立限流(20 次/小时),AI 不响应 AI。

## 技术栈

- **框架**:Next.js 16(App Router · Turbopack)+ React 19 + TypeScript strict
- **样式**:Tailwind CSS v4,品牌令牌见 `app/globals.css`;Logo 资产内置 `public/brand/`
- **数据库**:MySQL 8(`mysql2` 连接池,`src/lib/db.ts`);表结构 `db/schema.sql`,
  演进走 `db/migrations/`(`npm run db:migrate`,runner 带账本与断点续跑)
- **存储**:Cloudflare R2(图片上传);邮件 Resend;OAuth GitHub/Google + 邮箱密码(scrypt)
- **AI**:Moonshot(Kimi)API,`src/lib/ai-reply.ts` 任务队列 + 指数退避重试
- **包管理**:npm(唯一锁文件 `package-lock.json`,CI 用 `npm ci`)

## 目录结构

```
app/              # App Router 页面、API 路由、全局样式
components/       # 共享组件
src/lib/          # 服务端模块(db、auth、posts、works、usage、ai-reply…)
db/schema.sql     # MySQL 表结构(全量)
db/migrations/    # 增量迁移(YYYYMMDD_topic.sql)
tests/            # 单测(源码断言 + 纯函数)与 *.integration.ts(需隔离库)
docs/             # 开源文档与图片(版本化管理)
ops/              # 部署脚本(deploy-release.sh、PM2 配置)
scripts/          # db-migrate 等工具脚本
```

## 本地开发

要求:Node 22(见 `.nvmrc`)、MySQL 8。

```bash
npm install
cp .env.example .env.local   # 按下方说明填写
mysql -uroot kimi_builders < db/schema.sql   # 建库后初始化表结构
npm run db:migrate           # 应用增量迁移
npm run dev                  # http://localhost:3000
```

`.env.local` 关键变量(完整注释见 `.env.example`):

| 变量 | 用途 | 缺失时 |
|---|---|---|
| `DATABASE_URL` | MySQL 连接 | 站点不可用 |
| `AUTH_SECRET` | 会话签名(`openssl rand -base64 32`) | 登录不可用 |
| `AUTH_GITHUB_ID/SECRET`、`AUTH_GOOGLE_ID/SECRET` | OAuth 登录 | 对应入口失效 |
| `KIMI_API_KEY`(可选 `KIMI_MODEL`) | AI 回帖/召唤 | AI 任务标记 skipped,其余正常 |
| `RESEND_API_KEY` | 找回密码等事务邮件 | 发信软失败 |
| `R2_*` | 图片上传 | 上传接口 503 |
| `USAGE_KEY_PEPPER`、`CRON_SECRET` | 用量凭证 HMAC / cron 鉴权 | 对应功能不可用 |

## 测试与门禁

提交前请跑全:

```bash
npm test            # 单测(纯函数 + 路由/动作源码断言)
npm run lint
npx tsc --noEmit
npm run build
```

集成测试需要独立隔离库(绝不用开发/生产库):

```bash
export DATABASE_URL='mysql://root@127.0.0.1:3306/kbu-mysql'
npm run test:auth-db && npm run test:works-db && npm run test:moderation-db && npm run test:usage-db
```

## 部署

自托管:GitHub Actions(`deploy.yml`)构建 standalone 产物 → rsync 到服务器 →
先跑数据库迁移再 PM2 原子重启(`ops/deploy-release.sh`)→ 按 `/api/health` 版本号校验上线。
定时任务在服务器 crontab,携带 `CRON_SECRET` 调用 `/api/cron/*`。

fork 自行部署:在自己的环境中配置 `.env.example` 所列变量与对应 Actions Secrets 即可,
没有平台锁定。

## 贡献

欢迎 Issue 与 PR。PR 合并前请确保上方「测试与门禁」全绿;涉及表结构变更请新增
`db/migrations/` 迁移文件并同步 `db/schema.sql`(迁移写裸 DDL,幂等由 runner 账本保证)。

## 安全

发现安全漏洞请邮件 **we@kimi.builders**,不要开公开 Issue。详见 [SECURITY.md](./SECURITY.md)。

## License

[MIT](./LICENSE)
