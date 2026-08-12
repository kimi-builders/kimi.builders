# 三轮功能只读评审报告

## 修复轮复核（2026-08-12）

- 工作分支：`fix/review-findings`；修复提交范围：`3e0a41e..a3ab2fa`。
- 结果：2 个 Blocker、7 个 Major、2 个 Minor 均已修复并在对应条目下标注提交；3 项遗留视觉打磨也已完成。
- 常规门禁：`npx tsc --noEmit`、`npm run lint`、`npm test`（306/306）、`npm run build` 全部通过。
- 隔离数据库门禁：仅使用 `mysql://root@127.0.0.1:3306/kbu-mysql`；`test:auth-db`、`test:moderation-db`（含 Action 可见性集成测试）、`test:works-db` 全部通过。
- 迁移复核：隔离库执行后为 24 applied / 0 pending / 0 drift；statement ledger 的中断续跑、checksum drift 与旧 partial DDL 收编均有回归测试。
- 视觉复核：仅在 `:3112` 临时实例验证；390px 个人主页三项操作保持单行且无溢出，浅色英文排行榜选中态为低对比蓝色浅底/描边，浏览器控制台无错误。临时实例已关闭。
- 修复轮上线判断：本报告所列不变量与完成门禁均已满足，当前分支达到进入发布流程的条件。

## 原始评审结论（修复前）

评审范围为 `main` 的 `a134480..HEAD`（`252f32e`、`3adeeec`，57 个文件）。共发现 **2 个 Blocker、7 个 Major、2 个 Minor**。当前版本**未达到可上线质量**：私密/屏蔽帖仍有可直接泄露内容或绕过门禁写入的路径，资料隐私开关也未覆盖公开分享海报；此外治理动作的业务变更与审计不在同一事务中，无法满足“每个治理动作必有审计”的不变量。建议至少修完全部 Blocker 与 Major，并补齐针对性集成测试后再发布。

## 评审与验证方式

- 通读 `git log --oneline a134480..HEAD`、完整变更清单与重点模块实现，核对列表、详情、海报、右栏、精选、个人主页、分页与管理动作。
- `pnpm test`：285/285 通过。
- `./node_modules/.bin/tsc --noEmit`：通过。
- `./node_modules/.bin/eslint .`：通过。
- `./node_modules/.bin/next build --webpack`：生产构建通过。
- 使用唯一允许的隔离库 `mysql://root@127.0.0.1:3306/kbu-mysql` 运行 `moderation.integration.ts`、`work-visibility.integration.ts`、`auth-avatar.integration.ts`：全部通过。
- 在隔离库与 `:3112` 临时实例上做匿名运行时复现；测试数据已清理，未执行迁移、未改生产数据、未输出任何密钥。

## Blocker

### B-01 私密/屏蔽帖标题在匿名响应元数据中直接泄露

> 修复状态：✅ 已修复（`3e0a41e`）— metadata 与页面主体共用 `canViewPost`，并覆盖匿名、非作者、作者和管理角色。

- **位置**：`app/(app)/community/[id]/page.tsx:39-48`、`app/(app)/community/[id]/page.tsx:59-71`、`src/lib/posts.ts:240-261`
- **问题**：`generateMetadata()` 先用不带可见性条件的 `getPost()` 读取标题/正文并生成 `<title>`；页面组件随后才检查私密与屏蔽状态。匿名访客虽然看到 404 主体，响应的 RSC/metadata 仍包含真实标题，屏蔽帖同样受影响。
- **复现/依据**：在隔离库插入标题为 `PRIVATE_META_SENTINEL_*` 的私密帖后匿名请求 `/community/[id]`，响应主体为 404，但响应中实际出现 `<title>PRIVATE_META_SENTINEL_* — kimi.builders</title>`，开发服务器记录该请求为 200。只需知道或枚举自增 ID 即可读到私密标题。
- **建议修法**：建立统一的 `canViewPost`/可见单帖查询，让 `generateMetadata` 与页面在读取可展示字段前走同一会话、私密、屏蔽门禁；无权限时只返回统一的通用元数据与不存在语义。

### B-02 社区 Server Action 绕过详情页可见性/屏蔽门禁

> 修复状态：✅ 已修复（`81c5eb6`）— 六条 Action 接入统一门禁，写入在事务内锁定帖子/评论后复核可见性。

- **位置**：`app/(app)/community/actions.ts:131-169`、`app/(app)/community/actions.ts:173-191`、`app/(app)/community/actions.ts:223-285`、`src/lib/posts.ts:531-633`
- **问题**：详情页在组件层拦截私密/屏蔽帖，但创建评论、帖子/评论反应、订阅、投票均未验证调用者能否查看目标；“加载更多评论”只检查 `visibility`，完全没检查 `hidden_at`。因此已知 ID 的登录用户可向别人的私密或屏蔽帖写评论/投票/订阅，匿名或普通用户还可通过加载更多动作读取已屏蔽帖的评论。订阅私密帖后还可能收到后续评论通知；多态 `reactions` 无目标外键，评论反应甚至可为不存在/未来 ID 预埋孤儿记录。
- **复现/依据**：`createCommentAction()` 从 `post_id` 直接进入 INSERT；`setPostReactionAction()`、`setCommentReactionAction()`、`toggleSubscribeAction()`、`votePollAction()` 都只校验登录与 ID 形状；唯一取帖的 `loadMoreCommentsAction()` 在 `app/(app)/community/actions.ts:185-188` 只拒绝他人的 private，不拒绝 hidden。底层写函数也没有 JOIN 到可见帖子作原子约束。
- **建议修法**：把详情页判定抽成统一的服务端守卫并用于所有读写 Action，同时让关键 INSERT/UPDATE 以 JOIN/事务钉住“目标仍可见且未屏蔽”，所有拒绝统一返回不存在语义，并补私密、屏蔽、已删、并发变更的 Action 集成测试。

## Major

### M-01 资料隐私三开关未应用到公开个人主页海报

> 修复状态：✅ 已修复（`29f970b`）— 海报快照使用访客资料口径；个人海报改为 `no-store`，隐私开关下次请求立即生效。

- **位置**：`src/lib/share-posters.ts:239-250`、`src/lib/share-posters.ts:271-299`、`app/api/share/u/[handle]/ProfileSharePoster.tsx:33-72`、`app/(app)/u/[handle]/page.tsx:298-305`
- **问题**：个人主页本身通过 `profileDisplay()` 隐藏显示名/头像/简介，但公开海报快照直接使用原始 `profile.name`、由原始名字生成的 initials 和 `profile.bio`。关闭显示名或简介后，任何人仍可访问 `/api/share/u/[handle]` 读到被隐藏字段；路由还允许 5 分钟公共缓存。头像海报虽不画原图，但关闭显示名时仍会通过姓名和姓名首字母泄露身份信息。
- **复现/依据**：`getProfileShareSnapshot()` 调用访客口径统计，却把未经过 `profileDisplay(profile, false)` 的完整 `UserProfile` 传给 `buildProfileShareSnapshot()`；现有海报测试只使用三个开关全为 `true` 的 fixture，没有覆盖关闭场景。
- **建议修法**：海报快照统一使用 `profileDisplay(profile, false)` 的访客视图，并为三个开关逐一关闭及缓存失效补路由/快照测试。

### M-02 治理变更、级联计数与审计日志不具原子性

> 修复状态：✅ 已修复（`521c71d`）— 所有治理写路径统一为“锁目标 → 业务/计数 → 审计”的单连接事务，审计失败回滚已由真实外键失败注入验证。

- **位置**：`src/lib/moderation.ts:117-184`、`src/lib/moderation.ts:203-269`、`src/lib/moderation.ts:310-389`
- **问题**：所有治理函数都先修改业务表，最后再用独立 pool query 写 `moderation_actions`，没有事务、没有复用同一连接。任何审计 INSERT 失败都会留下“动作已生效但无审计”的状态；硬删帖子/评论还会在删除 reactions、内容、更新计数之间产生部分完成。`adminDeleteComment()` 先 SELECT、后无条件 UPDATE 并减计数，并发重复调用可双减 `comment_count`。
- **复现/依据**：例如 `hardDeletePost()` 依次删除两类 reaction、帖子，最后才 `logModeration()`；`hardDeleteComment()` 删除树、减计数后才记审计。现有集成测试只覆盖每条 SQL 都成功的顺序执行路径，无法证明失败或并发时仍满足审计/计数不变量。
- **建议修法**：每个治理动作使用同一 `PoolConnection` 和事务包住目标锁定、业务变更、级联计数与审计 INSERT，并以受影响行数/`SELECT ... FOR UPDATE` 保证幂等与并发正确性。

### M-03 屏蔽评论未同步公开冗余计数，泄露屏蔽数量并污染热门排序

> 修复状态：✅ 已修复（`521c71d`）— 评论屏蔽/解除在同一事务内减/加 `comment_count`，软删与硬删避免二次扣减。

- **位置**：`src/lib/moderation.ts:117-133`、`src/lib/posts.ts:194-200`、`src/lib/posts.ts:376-388`、`src/lib/posts.ts:756-770`、`src/lib/share-posters.ts:135-137`
- **问题**：屏蔽评论只写 `comments.hidden_at`，没有调整 `posts.comment_count`；详情页重新 COUNT 后会隐藏该评论，但 feed、个人主页帖子卡、右栏热门、首页回落和帖子海报继续展示旧的冗余总数，且热门公式仍把被屏蔽评论计入权重。访客可用卡片/海报数量减详情可见数量推断被屏蔽评论数。
- **复现/依据**：`hideContent()` 对三类表做同一种 UPDATE；`commentCountQuery()` 明确过滤 hidden，但 Feed/Post share 使用 `p.comment_count`。治理集成测试只断言评论正文消失，没有断言卡片、海报与热门计数同步。
- **建议修法**：在屏蔽/解除评论的同一事务中原子减/加帖子公开评论计数，或取消该冗余并让所有公开面使用同一可见计数口径。

### M-04 两处公开聚合仍统计私密/屏蔽内容

> 修复状态：✅ 已修复（`38a8ca6`）— 访客获赞与社区评论总量均 JOIN 父帖并限制为公开、未删、未屏蔽内容。

- **位置**：`src/lib/users.ts:115-130`、`src/lib/posts.ts:780-788`
- **问题**：访客个人主页的“获赞”子查询没有套用 `self=false` 的可见性条件：帖子获赞会包含私密/屏蔽帖，评论获赞还未 JOIN 所在帖子，也未过滤屏蔽评论。社区总量的评论数只检查评论自身未删/未屏蔽，没有排除私密、已删或已屏蔽帖子下的评论。两者均能通过聚合差值推断隐藏活动。
- **复现/依据**：`postVis`/`commentVis` 仅用于帖子数和评论数，没有进入 lines 127-130 的 likes；社区 comments 子查询在 lines 787 未 JOIN `posts`。
- **建议修法**：为访客 likes 与社区 comments 都 JOIN 父帖子并复用统一的 public/not-deleted/not-hidden 谓词，同时补“只有私密或屏蔽内容”的零泄露测试。

### M-05 头像与旧封面 URL 可指向任意外站，形成全站访客跟踪像素

> 修复状态：✅ 已修复（`f09d17d`）— 头像只接受自家 CDN 精确 host 和显式 OAuth host；作品截图按产品要求保留任意外链并记录风险取舍。

- **位置**：`app/(app)/settings/actions.ts:42-54`、`app/(app)/settings/_components/AvatarField.tsx:130-139`、`components/Avatar.tsx:18-26`、`app/(app)/works/actions.ts:118-129`、`app/(app)/works/_components/WorkScreenshot.tsx:43-50`、`src/lib/auth/users.ts:14-33`
- **问题**：头像和 `screenshot_url` 只要求 `http(s)`，随后由浏览器直接 `<img src>` 加载；恶意成员可填写带唯一 token 的自有域名，在帖子、评论、个人主页、作品墙与详情中收集访客 IP、UA、访问时间及站点来源。站点没有限制图片源的 CSP，当前 Referrer-Policy 仍会跨站发送主站 origin。更糟的是，任意外站只要路径以 `/avatar/` 开头就会被 `isOwnAvatarUrl()` 判为“站内自传头像”，从而被 OAuth 同步永久保护。
- **复现/依据**：服务端正则 `^https?://.+` 不限制 host；Avatar/WorkScreenshot 直接渲染 URL；单测还明确接受 `https://old-cdn.example.com/avatar/...` 为自有头像。相比之下，本轮新增的 `logo_key`/`image_keys` 已正确限制为上传签发的 key，说明 raw URL 路径与新模型不一致。
- **建议修法**：新提交只接受上传签发的媒体 key/自有 CDN 精确 origin+key 形状，遗留远程图片经受限图片代理迁移；至少禁止任意 off-origin URL，并去掉仅凭 `/avatar/` pathname 的信任。

### M-06 上传大小与限流发生在 multipart 全量解析之后，可被用于内存/临时盘 DoS

> 修复状态：✅ 已修复（`2c1e8e1`）— 上传配额与 8 MiB `Content-Length` 检查均前移到 `formData()` 之前，chunked 仍由 sharp 上限兜底。

- **位置**：`app/api/upload/route.ts:15-58`
- **问题**：`request.formData()` 会先解析/缓冲整个 multipart body，之后才读取 `File.size` 并执行每小时限流。因此 8 MiB 限制不能阻止超大请求进入解析，已超过 30 次配额的请求也仍会承担完整解析成本；同源与登录要求只能缩小攻击面，无法阻止恶意或被接管账号持续耗尽进程内存/临时盘。
- **复现/依据**：lines 30-35 完成 `formData()`，lines 44-45 才检查大小，lines 48-54 才消费限流。`processMedia()` 的 8 MiB 与 4000 万像素防护有效，但都发生在 body 已进进程之后。
- **建议修法**：在反代/平台层配置硬 body 上限并在读取 body 前检查可信 `Content-Length`、先消费上传配额，必要时改为带字节上限的流式 multipart 解析。

### M-07 新治理迁移不可安全重试，且多次大表 DDL 缺少上线锁风险控制

> 修复状态：✅ 已修复（`1e1b7a8`）— 新增 statement ledger 与旧 partial DDL 收编；新增 `(hidden_at, id)` 评论治理索引迁移。

- **位置**：`db/migrations/20260830_moderation.sql:9-42`、`db/migrations/20260828_work_visibility.sql:7-8`、`db/migrations/20260829_profile_privacy.sql:8-11`、`scripts/db-migrate.mjs:22-24`、`scripts/db-migrate.mjs:138-154`
- **问题**：迁移 runner 只在整个 SQL 文件全部成功后写 ledger，而 MySQL DDL 会自动提交。`20260830` 在一个文件中串行执行四个 `ALTER TABLE` 和一个 CREATE；若中途失败，前面的列/索引已永久生效但 ledger 未记录，重跑会在第一个重复列处再次失败，只能人工修库。posts/comments/works 上的索引与外键还可能扫描大表并持有 metadata lock，却没有拆阶段、在线 DDL/锁等待预检或回滚手册；comments 又是唯一未给 `hidden_at` 索引的内容表，管理台 hidden 查询会全表扫描。
- **复现/依据**：runner 自身注释明确承认“failed file may be partially applied”；错误路径只停止并不记录已完成 statement。`20260828/29` 的 NOT NULL+默认值能保持存量语义，现代 MySQL 可能 instant，但 `20260830` 的索引/外键仍是主要风险。
- **建议修法**：把每个不可事务化 DDL 拆成独立 ledger 单元并做 `INFORMATION_SCHEMA` 幂等预检，索引/外键采用经过预演的在线方案与锁超时/恢复步骤，同时为 comments 补合适的治理查询索引。

## Minor

### m-01 OAuth 头像同步存在 TOCTOU，极窄并发窗口仍可覆盖刚上传头像

> 修复状态：✅ 已修复（`f09d17d`）— provider 头像 UPDATE 将已读旧值钉入 WHERE，并检查 `affectedRows`。

- **位置**：`src/lib/auth/users.ts:45-59`、`src/lib/users.ts:167-176`
- **问题**：OAuth 登录先 SELECT 当前头像、在应用层判断，随后无条件 `UPDATE users SET avatar_url=? WHERE id=?`。如果用户上传/保存头像恰好发生在 SELECT 与 UPDATE 之间，登录请求会覆盖刚保存的 CDN 头像，违反防覆盖不变量。
- **复现/依据**：两条操作没有事务、版本列或把旧值带入 UPDATE WHERE；现有集成测试只做顺序登录/更新，未覆盖并发交错。
- **建议修法**：使用显式 `avatar_source`/版本字段，或把“当前仍等于已读 provider URL/仍非 custom”的条件放进原子 UPDATE WHERE 并检查 affectedRows。

### m-02 解禁 Action 的服务端保护未排除 admin 目标

> 修复状态：✅ 已修复（`521c71d`）— 用户治理目标角色守卫收敛到同一锁定函数，unmute SQL 额外保留 `role <> 'admin'` 防御。

- **位置**：`app/(app)/admin/actions.ts:140-150`、`src/lib/moderation.ts:326-336`
- **问题**：UI 隐藏 admin 行控件，禁言与资料重置 SQL 也排除 admin，但 `unmuteUser()` 只要求 `muted_until IS NOT NULL`。若 admin 因历史数据、人工维护或其他路径带有该值，任意 mod 可手工调用 Action 修改 admin 行，不符合“mod 不能动 admin 目标”的服务端不变量。
- **复现/依据**：Action 只 `requireModerator()`；底层 UPDATE 没有 `role <> 'admin'`，相关测试只覆盖“不能 mute admin”，没有覆盖 unmute admin。
- **建议修法**：所有用户治理动作统一走同一个目标角色守卫，并在 UPDATE WHERE 再加 `role <> 'admin'` 的防御条件。

## 遗留打磨复核

> ✅ 已完成（`a3ab2fa`）：移动端个人主页操作按钮改为紧凑单行；帖子空态合并为一句；用量榜分段选中态改为基于 `--color-blue` 的轻量浅底。

## Nit

本轮未单列仅属风格或命名偏好的 Nit；报告只保留会影响安全、隐私、数据一致性或上线运维的项目。

## 已核实无问题

- **作品/Awesome 可见性主链路**：匿名列表、作者本人列表、详情页、详情 metadata、个人主页作品页签、分享海报、相关作品、右栏热门及统计、Agent/类型/口径统计、精选位与 keyset cursor 均在查询前应用 public + not-hidden 口径；非作者看私密作品得到统一“不可见”页面。隔离库往返测试通过。
- **帖子公开主查询**：feed 首屏/加载更多、订阅 feed、个人主页帖子与评论页签、相关推荐、右栏热门、精选查询、帖子分享海报均有 public/not-hidden 过滤；本报告列出的 metadata、Action 与计数旁路除外。全局搜索当前只检索静态站点导航项，不建立帖子/作品内容索引，因此不存在该搜索面的私密内容泄露。
- **治理入口鉴权**：`/admin` 页面非 mod/admin 返回 notFound；新增治理 Action 均在服务端执行 `requireModerator`/`requireAdmin`，硬删仅 admin；角色变更只允许 member ⇄ mod，SQL 再次保护 admin 不可降；硬删 UI 有两次独立确认。顺序成功路径下，帖子/评论/作品级联与评论树计数通过隔离库测试，本报告的事务/失败并发风险除外。
- **禁言**：发帖、发评论、发作品、作品评论四条创建路径均在写库前调用 `getActiveMute()`；过去时间自动视为已解除，永久哨兵和四条路径的提示口径一致。
- **头像正常流程**：配置 CDN host 的 URL 不被 OAuth 覆盖；清空后下次 OAuth 登录会恢复 provider 头像；`URL.host` 的大小写规范化、默认端口归一、非默认端口区分与 base 尾斜杠处理符合预期。本报告列出的任意外站 pathname 信任与并发窗口除外。
- **上传处理本体**：`/api/upload` 要求 Origin 且与 canonical origin 精确相等、要求会话、使用独立 upload 配额；sharp 按文件内容解码而非信任 MIME，输入处理器内有 8 MiB 与 4000 万像素上限，动图静态化并统一输出 WebP；logo/avatar 方形裁剪、作品图长边限制与不放大测试通过。本报告列出的 body 读取时机除外。
- **媒体 key**：作品 logo/image 只接受上传签发形状的 `logo/`、`image/` key，配图上限 9，数据库不接受任意 key；内容寻址与 URL 拼接测试通过。
- **迁移数据语义**：作品可见性默认 `public`，资料三开关默认 `1`，存量数据不会因迁移被意外设私密；治理 hidden/mute 列均可空且无需数据回填；本轮三个迁移没有新增 JSON 列。本报告列出的 DDL 可重试与锁风险除外。
- **常规安全**：本轮 SQL 值均使用参数绑定；动态表名来自封闭枚举、内联 LIMIT 经过整数夹取，未发现用户可控 SQL 拼接。Markdown 使用 `react-markdown` 且未启用 raw HTML/`dangerouslySetInnerHTML`，React 文本默认转义，未发现新增 XSS。新增中英文键成对存在，生产构建、SSR 类型检查、ESLint 与深浅主题使用的全局颜色 token 均通过静态核查。

## 总体上线判断

原始评审要求的 2 个 Blocker、7 个 Major、2 个 Minor 已全部完成修复，并为各旁路补齐权限、失败回滚、并发窗口、隐私关闭和迁移续跑测试；常规门禁、隔离库门禁、生产构建与 `:3112` 视觉复核均通过。修复轮结论更新为：**`fix/review-findings` 达到进入发布流程的条件**。
