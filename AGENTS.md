# kimi.builders — Agent Brief

Kimi 用户自建的非商业 builder 社区(非官方),生产环境 <https://kimi.builders>。
自托管:PM2 + Caddy + `ops/deploy-release.sh` 原子切换(不走 Vercel)。

**栈**:Next.js 16 App Router(Turbopack)+ React 19 + TypeScript strict +
Tailwind v4(@theme 令牌)+ MySQL(`mysql2` 裸 SQL,无 ORM)+ `lucide-react` +
`next/og`(分享海报)。双语 zh/en(cookie `kb_locale`),双气质(poster 棱角 /
soft 圆润,cookie `kb_vibe`),双主题(cookie `kb_theme`)。

---

## 1 · 门禁(提交前必过)

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- `npm test` = 单测(`tests/**/*.test.ts`,node:test,纯函数/SQL 钉);
- 集成测试打真实 MySQL:`DATABASE_URL='mysql://root@127.0.0.1:3306/kbu-mysql'`
  跑 `npm run test:usage-db` / `test:analytics-db` / `test:auth-db` /
  `test:works-db` / `test:moderation-db`
  (库名必须含 "kbu-mysql",有守卫防误伤 dev 库);
- CI 的 `db-validate.yml` 同时验证 `schema.sql` 新装与历史基线从零重放全部迁移,
  并比较两者终态——**改了 `db/migrations/` 必须同步 `db/schema.sql` 终态**;
  两个库(dev `kb_dev` / 测试 `kbu-mysql`)都要 `npm run db:migrate`。
- migration 执行顺序只认 `db/migration-order.txt`:新 migration 必须追加到末尾;
  已有文件与已有顺序均不可修改、移动或删除。

## 2 · 目录地图

```
app/(app)/            壳内页面(社区/探索/作品/Awesome/用量/设置/关于)
  explore/            探索区:月刊 × 教程同一文章架(见 §4)
  community/ works/ awesome/ usage/  各分区(_components 就近放)
  _components/        壳:LeftNav / TopBar / RightSidebar / rail/* / right-rail.ts
app/api/              路由(usage ingest / share 海报 / auth / mp)
components/           跨区共享(Markdown / ShareButton / DetailTabs / VideoEmbed /
                      seg-classes / PageHeader / *Icon)
src/lib/              数据层(纯函数与 DB 读写分离;posts/works/articles/monthly/
                      tutorials/explore/learn-series/usage/*)
db/                   schema.sql(终态)+ migrations/(裸 DDL,runner 有账本)
ops/                  部署与运维脚本
tests/                单测 + *.integration.ts(打 kbu-mysql)
local-dev-docs/       本地开发文档(gitignore,不入库)
```

## 3 · 硬约定(踩过坑的都在这)

- **新路由必须加 `proxy.ts` 的 `config.matcher`**——右栏靠 proxy 写
  `x-kb-path` 请求头分发(right-rail.ts 的 railFor);漏加 = RailGate 把右栏
  藏成 `visibility:hidden`(20260821 探索区踩过)。
- **分段控件全站共享 `components/seg-classes.ts`**:容器 `SEG_WRAP`(+ 可换行
  `SEG_WRAP_FLOW`)+ 项 `SEG_ITEM` + 选中 `SEG_ITEM_ACTIVE`(反色实块,与
  usage-cli dashboard 同一语法,双边都别退回描边态);筛选下拉复用
  `works/_components/FilterDropdown` / `WorksFilterBar`(单选 `single`)。
- **视觉只走令牌**:`bg/card/moon/line/paper/grey/blue/ui-blue/status-*`;
  圆角走 `--radius-*`(poster 气质归零);状态色用 `status-ok/warn/danger-fg`;
  别引入新色值。页头用共享 `components/PageHeader.tsx`(eyebrow/title/lede/
  meta/actions/aside),标题进 `.kb-h1/.kb-h2/.kb-h3`,eyebrow 用 `.kb-eyebrow`。
- **纯图标控件的提示用 `data-tip`**(globals.css 的 CSS-only 实现),
  别用原生 `title`;文案走 `src/lib/i18n.ts` 的 DICT(t() 单语,zh/en 成对)。
- **数据层写法**:校验/组装/查询构建是纯函数(单测直接测),DB 读写在文件
  底部;编辑后台严校验 + 渲染路径容错(坏 payload 回落空,不打掉页面)——
  范式见 `monthly.ts` / `tutorials.ts`。
- **海报字体**:`app/api/share/poster-fonts.ts` 运行时拉 Google Fonts 子集;
  CJK 失败必须整组退空数组(宁弱不豆腐),别改回「拉丁-only」。
- ** articles 双 kind**:`letter`(月刊)与 `guide`(教程)同表;payload JSON 列
  承载分区语义;`sort_order` 在 guide 是集序。
- **可见性谓词**:公共上下文恒用 `visibility='public' AND hidden_at IS NULL`
  (works/posts 同口径),私密/被屏蔽内容不许借公共面漏出。
- **代码注释一律英文**(20260822 起,规范见 `docs/comment-style.md`):只写
  约束/不变量/契约/为什么,不写流程叙述、日期工单号、变更理由;DICT 的 value
  是产品文案(zh/en 成对)不在此列。门禁:`tests/comment-language.test.ts`
  按区域钉基线(`tests/comment-baseline.json`,只减不增),locked 文件永久
  零中文;转换 PR 用 `UPDATE_BASELINE=1 npm test` 重生成基线并登记 locked,
  注释-only 提交、不混逻辑改动。
- **品牌文案规范见 `local-dev-docs/brand-language.md`**(20260823 起):Builder 身份词
  中英同形不译、build 分层、术语表、同屏不堆口号、宣称须有核验落点、
  免责声明三处封顶;改 DICT / 海报 / SEO 文案前先查它。

## 4 · 探索区(月刊 × 教程合并,20260821)

**定位(20260824 拍板,上位约束)**:探索区收集**可复现、可验证的 builder
实践**(分享者亲自跑通的方法)——站内出示方法、证据与出处(署名 + 可核验),
**不承诺通用最优解**。章(学/做/得/立,见 `src/lib/kb-chapters.ts`)是
/explore 内部策展维度,不作全站叙事主轴;列表为一篇一卡的横列(冷启动不做
系列/教程架子;系列机制在数据层保留,内容长出来再上架)。**不是**教程、
操作手册、新闻资讯(AI 可无限供给,贬值最快)。产出未必发生在站内。
产品/职业/标签/归档是下拉透镜——**有内容才出选项,整维无内容连下拉不出**;
形态(文章/视频/演示稿)不筛选——每篇内容三媒体齐备,仅作卡上标记与详情 tab。

一页讲清:`local-dev-docs/explore-architecture.md`(四维浏览、payload 契约、
系列注册表、DetailTabs、308 重定向地图、编辑流)。

- `/explore` 四维(分类 kind / 系列注册表 / 标签 payload.tags / 归档);
- `/explore/<slug>` 详情 DetailTabs:letter = 评鉴/事实/定夺(组装),
  guide = 文稿/视频/演示稿/资源(条件 tab);
- `/explore/series/<slug>` 教程系列页(验证戳/讨论闭环/毕业归因);
- 旧 `/blog`、`/learn` 由 `proxy.ts` 出 308(`/blog/admin/*` 编辑台不重定向;
  页面层 permanentRedirect 桩留作兜底);
- 系列注册表 `src/lib/learn-series.ts`(策展,少而重;0 集系列不上架);
- 发内容:`/blog/admin/new` 选 kind,正文 + payload。

## 5 · 提交与身份

- 提交格式:`<type>(<scope>): <subject>`;别替用户提交,除非明说。
- 本树身份约定见上级目录 `../AGENTS.md`(kimi.builders 组织身份 +
  SSH 别名透明改写),别切成个人身份。

## 6 · 不要做的事

- 不引入新依赖前先查 package.json 有没有;
- 不写 wiki 式大知识库(内容贬值最快,策划制替代);
- 不加「可伪造」的声誉原语(自述思考/提效);担保只靠 token 证据;
- 不动 @kimi 互动形态、月刊组装口径、usage 隐私契约(只收 token/时间/计数);
- 不为「本地能跑」绕过 CI 门禁。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
