/* 作品库:社区成员用 Kimi 构建的真实作品(works 表)。
   source=site → 成员作品,上 /works 墙;source=awesome → 推荐的站外项目
   (author_label 是外部作者名),只上 /awesome。/awesome 展示全部来源。
   agents = 参与构建的 Agent 品牌键(注册表 src/lib/agents.ts)。
   作者自助增改删,归属校验钉在 SQL WHERE 里(同帖子)。
   getWorkDetail / getAuthorClaimContext 走 React cache:详情页与右栏元数据卡
   同一请求共享查询(无 dispatcher 的环境自动退化为普通调用)。 */
import { cache } from "react";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { canModerate } from "./featured";
import { getVerifiableTokenTotals, type ClaimProjectTotal } from "./usage/verifiable";

type Queryable = Pool | PoolConnection;

export interface WorkRow {
  id: number;
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  /* 已知取舍:screenshot_url 保持允许任意 http(s) 外链，方便展示托管在作者站点的截图；
     接受访客跟踪像素风险，后续如需收紧应引入受限图片代理。 */
  screenshotUrl: string;
  tags: string[];
  agents: string[];
  source: string;
  /* public/private(20260828_work_visibility,语义同 posts.visibility:私密=仅作者可见) */
  visibility: string;
  /* 治理屏蔽(20260830):非空 = 已被管理员屏蔽;公开侧已滤,仅作者/管理员视角拿到 */
  hiddenAt: Date | null;
  hiddenReason: string | null;
  createdAt: Date;
  /* 站内作者(user_id 空 = awesome 外部条目,用 authorLabel) */
  userId: number | null;
  handle: string | null;
  avatarUrl: string | null;
  authorLabel: string;
  /* 每周精选 v0:featured_at 非空 = 精选态(理由/定夺编辑在 featured.ts 查询) */
  featuredAt: Date | null;
  featuredReason: string | null;
  /* 冗余计数(P1-2,随 work_votes / work_comments 写路径维护) */
  voteCount: number;
  commentCount: number;
  /* 用量声明制:作者声明的该作品构建投入 tokens;null = 未声明(无徽章) */
  claimedTokens: number | null;
  /* 20260824_work_meta:作品元数据(状态/模型/平台/长描述/awesome 收录口径) */
  status: string;
  models: string[];
  /* 作品类型(app/miniapp/website/extension/cli/skill/prompt/slides/demo/content/other) */
  kind: string;
  descriptionMd: string;
  /* Awesome 收录口径:base/eco/part;仅 awesome 条目,作品墙恒 "" */
  scope: string;
  /* 20260826_work_media:Logo 存储 key(空 = 无)+ 配图 key 数组(≤9,第一张 = 封面)。
     DB 只存 key,公开 URL 渲染时由 storage.ts mediaUrl 拼接 */
  logoKey: string;
  imageKeys: string[];
}

function parseStrArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string");
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapWork(r: RowDataPacket): WorkRow {
  return {
    id: Number(r.id),
    name: r.name,
    tagline: r.tagline,
    url: r.url,
    repoUrl: r.repo_url,
    screenshotUrl: r.screenshot_url,
    tags: parseStrArray(r.tags),
    agents: parseStrArray(r.agents),
    source: r.source,
    visibility: r.visibility ?? "public",
    hiddenAt: r.hidden_at ?? null,
    hiddenReason: r.hidden_reason ?? null,
    createdAt: r.created_at,
    userId: r.user_id === null ? null : Number(r.user_id),
    handle: r.handle ?? null,
    avatarUrl: r.avatar_url ?? null,
    authorLabel: r.author_label,
    featuredAt: r.featured_at ?? null,
    featuredReason: r.featured_reason ?? null,
    voteCount: Number(r.vote_count ?? 0),
    commentCount: Number(r.comment_count ?? 0),
    claimedTokens: r.claimed_tokens === null ? null : Number(r.claimed_tokens),
    status: r.status ?? "released",
    models: parseStrArray(r.models),
    kind: r.kind ?? "app",
    descriptionMd: r.description_md ?? "",
    scope: r.scope ?? "",
    logoKey: r.logo_key ?? "",
    imageKeys: parseStrArray(r.image_keys),
  };
}

const WORK_COLUMNS = `w.id, w.user_id, w.name, w.tagline, w.url, w.repo_url,
       w.screenshot_url, w.tags, w.agents, w.source, w.visibility, w.hidden_at, w.hidden_reason,
       w.author_label, w.created_at,
       w.featured_at, w.featured_reason, w.vote_count, w.comment_count, w.claimed_tokens,
       w.status, w.models, w.kind, w.description_md, w.scope, w.logo_key, w.image_keys`;

/* 可见性谓词(20260828):私密=仅作者(推荐人)本人可见。
   公共上下文(右栏/精选/海报/统计)恒用 PUBLIC_ONLY;列表/详情带 viewerId 放行作者本人。
   user_id 为 NULL 的编辑收录条目恒 public(不经表单,列默认即 public)。 */
const VISIBILITY_PUBLIC = "w.visibility = 'public'";
/* 治理屏蔽谓词(20260830):公共上下文恒过滤;作者本人视角另行放行。 */
const HIDDEN_PUBLIC = "w.hidden_at IS NULL";

/* 单条目的可见性判定(详情页/海报/互动 action 共用):
   被屏蔽 → 仅作者或 admin/mod(治理评审需要);否则公开或本人。 */
export function canViewWork(
  work: { visibility: string; userId: number | null; hiddenAt: Date | null },
  viewer: { id: number; role: string } | null,
): boolean {
  if (work.hiddenAt) {
    return !!viewer && (work.userId === viewer.id || canModerate(viewer.role));
  }
  return work.visibility === "public" || (viewer !== null && work.userId === viewer.id);
}

const SELECT_WORKS = `SELECT ${WORK_COLUMNS},
       u.handle, u.avatar_url
     FROM works w LEFT JOIN users u ON u.id = w.user_id`;

/* 详情页(P1-2):多联一次定夺编辑(featured_by → handle,精选徽章 tooltip 署名)。 */
const SELECT_WORK_DETAIL = `SELECT ${WORK_COLUMNS},
       u.handle, u.avatar_url, e.handle AS editor_handle
     FROM works w LEFT JOIN users u ON u.id = w.user_id
     LEFT JOIN users e ON e.id = w.featured_by`;

/* 作品列表分页:游标 keyset —— new = 裸 id(id 自增随 created_at 单调);
   hot = "votes|id" 复合(vote_count 降序 + id 降序键集,UNSIGNED 列无负值坑)。
   每页多取 1 条判断是否还有下一页。非法游标按首页处理(不静默 500)。 */
export const WORKS_PAGE_SIZE = 100;
export const AWESOME_PAGE_SIZE = 200;
export type WorksSort = "hot" | "new";

export interface WorksPage {
  works: WorkRow[];
  nextCursor: string | null;
}

export function encodeWorksCursor(c: { id: number; votes?: number }): string {
  return c.votes !== undefined ? `${c.votes}|${c.id}` : String(c.id);
}

export function decodeWorksCursor(
  raw: string | undefined,
  sort: WorksSort,
): { id: number; votes?: number } | null {
  if (raw === undefined || raw === "") return null;
  if (sort === "hot") {
    const m = /^(\d{1,20})\|(\d{1,20})$/.exec(raw);
    if (!m) return null;
    const votes = Number(m[1]);
    const id = Number(m[2]);
    if (!Number.isSafeInteger(votes) || votes < 0) return null;
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return { id, votes };
  }
  if (!/^\d{1,20}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? { id } : null;
}

export function worksPageQuery(opts: {
  source: "site" | "all";
  sort?: WorksSort;
  agents?: string[];
  kinds?: string[];
  scope?: string;
  after?: string;
  /* 登录浏览者:私密条目仅作者本人可见(同 posts feed 口径);缺省 = 匿名,仅公开 */
  viewerId?: number;
}): { sql: string; args: (string | number)[] } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.viewerId) {
    where.push(`(${VISIBILITY_PUBLIC} OR w.user_id = ?)`);
    args.push(opts.viewerId);
    /* 治理屏蔽:公开侧滤掉;作者本人仍可见(卡片带「已被管理员屏蔽」标注) */
    where.push(`(${HIDDEN_PUBLIC} OR w.user_id = ?)`);
    args.push(opts.viewerId);
  } else {
    where.push(VISIBILITY_PUBLIC);
    where.push(HIDDEN_PUBLIC);
  }
  if (opts.source === "site") where.push("w.source = 'site'");
  /* 参与 Agent 多选:任一命中即可(JSON 数组成员,OR 链) */
  if (opts.agents && opts.agents.length > 0) {
    where.push(`(${opts.agents.map(() => "JSON_CONTAINS(w.agents, JSON_QUOTE(?))").join(" OR ")})`);
    args.push(...opts.agents.slice(0, 10));
  }
  /* 作品类型多选:IN 列表 */
  if (opts.kinds && opts.kinds.length > 0) {
    where.push(`w.kind IN (${opts.kinds.map(() => "?").join(",")})`);
    args.push(...opts.kinds.slice(0, 12));
  }
  /* awesome 收录口径过滤(base/eco/part) */
  if (opts.scope) {
    where.push("w.scope = ?");
    args.push(opts.scope);
  }
  const sort: WorksSort = opts.sort === "hot" ? "hot" : "new";
  const cursor = decodeWorksCursor(opts.after, sort);
  if (cursor) {
    if (sort === "hot" && cursor.votes !== undefined) {
      where.push("(w.vote_count < ? OR (w.vote_count = ? AND w.id < ?))");
      args.push(cursor.votes, cursor.votes, cursor.id);
    } else {
      where.push("w.id < ?");
      args.push(cursor.id);
    }
  }
  const size = opts.source === "site" ? WORKS_PAGE_SIZE : AWESOME_PAGE_SIZE;
  const order = sort === "hot" ? "w.vote_count DESC, w.id DESC" : "w.id DESC";
  return {
    sql: `${SELECT_WORKS} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${order} LIMIT ${size + 1}`,
    args,
  };
}

async function runWorksPage(
  q: { sql: string; args: (string | number)[] },
  size: number,
  sort: WorksSort,
): Promise<WorksPage> {
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  const kept = rows.length > size ? rows.slice(0, size) : rows;
  let nextCursor: string | null = null;
  if (rows.length > size && kept.length > 0) {
    const last = kept[kept.length - 1];
    nextCursor =
      sort === "hot"
        ? encodeWorksCursor({ id: Number(last.id), votes: Number(last.vote_count ?? 0) })
        : encodeWorksCursor({ id: Number(last.id) });
  }
  return { works: kept.map(mapWork), nextCursor };
}

/* /works 墙:只看成员自己的作品;Agent/类型多选过滤 + 排序。
   viewerId = 登录浏览者:自己的私密作品可见(卡片带「私密」标),他人私密不出现。 */
export async function getWorksPage(
  opts: { sort?: WorksSort; agents?: string[]; kinds?: string[]; after?: string; viewerId?: number } = {},
): Promise<WorksPage> {
  const sort = opts.sort === "hot" ? "hot" : "new";
  return runWorksPage(
    worksPageQuery({
      source: "site",
      sort,
      agents: opts.agents,
      kinds: opts.kinds,
      after: opts.after,
      viewerId: opts.viewerId,
    }),
    WORKS_PAGE_SIZE,
    sort,
  );
}

/* /awesome:全部来源;Agent/类型/收录口径过滤 + 排序。可见性口径同上。 */
export async function getAwesomeWorksPage(
  opts: {
    sort?: WorksSort;
    agents?: string[];
    kinds?: string[];
    scope?: string;
    after?: string;
    viewerId?: number;
  } = {},
): Promise<WorksPage> {
  const sort = opts.sort === "hot" ? "hot" : "new";
  return runWorksPage(
    worksPageQuery({
      source: "all",
      sort,
      agents: opts.agents,
      kinds: opts.kinds,
      scope: opts.scope,
      after: opts.after,
      viewerId: opts.viewerId,
    }),
    AWESOME_PAGE_SIZE,
    sort,
  );
}

/* 个人主页「作品」页签:成员自有作品(source=site)。
   self=true(本人)含私密与被屏蔽条目(带标注);访客只见公开且未屏蔽(同 getUserPosts)。 */
export async function getUserWorks(
  userId: number,
  self = false,
): Promise<WorkRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `${SELECT_WORKS} WHERE w.source = 'site' AND w.user_id = ? ${self ? "" : `AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`} ORDER BY w.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map(mapWork);
}

/* ---- 作品用量声明制(20260822_work_claims)----
   徽章语义(替换旧的「作者总量」徽章,原 badgeTokensOf 已移除):
   作者为自己的每个作品声明一个构建投入 token 数(claimed_tokens),
   同一作者全部未删作品 Σ声明 ≤ 该作者可验证总量(usage/social 同口径的
   usage_buckets 全时间 SUM,但走 usage/verifiable.ts 的内部查询,
   不做 show_on_leaderboard 门禁 —— 声明行为本身即公开授权,总量数字不公开展示)。
   展示时兜底:总量缩水(删数据/retention)使 Σ声明 > 总量 → 该作者所有作品
   徽章整体不渲染(无负面标记),作者在列表/编辑页看到重新分配提示。
   作品物理删除,声明随删除自然释放额度。 */

/* 紧凑数字解析:「612M」「1.5M」「2k」「1.2B」「10,000」→ 整 tokens。
   空串 = 未声明(none);非空但解析不出/非正整数/超安全整数 → invalid。 */
export type ClaimInputParse =
  | { kind: "none" }
  | { kind: "ok"; value: number }
  | { kind: "invalid" };

const CLAIM_UNITS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

export function parseClaimInput(raw: string): ClaimInputParse {
  const s = raw.trim().toLowerCase().replace(/[,_\s]+/g, "");
  if (!s) return { kind: "none" };
  const m = /^(\d+(?:\.\d+)?)([kmb])?$/.exec(s);
  if (!m) return { kind: "invalid" };
  const value = Number(m[1]) * (m[2] ? CLAIM_UNITS[m[2]] : 1);
  if (!Number.isSafeInteger(value) || value <= 0) return { kind: "invalid" };
  return { kind: "ok", value };
}

/* 写时校验(纯函数):声明值 ≤ 剩余可声明额度才放行(等于剩余放行,超 1 拒绝);
   null(撤销声明)永远放行。remaining = 可验证总量 − 其他作品已声明合计。 */
export type ClaimCheck = { ok: true } | { ok: false; remaining: number };

export function checkClaimAllowance(
  claim: number | null,
  remaining: number,
): ClaimCheck {
  if (claim === null) return { ok: true };
  return claim <= remaining ? { ok: true } : { ok: false, remaining };
}

/* 展示不变式(纯函数):本作品的徽章值;null = 不渲染(无负面标记)。
   隐藏条件:awesome 外部条目 / 无站内作者 / 未声明 / 声明 ≤ 0 /
   作者无可验证数据(总量 ≤ 0)/ Σ声明 > 可验证总量(总量缩水 → 全部徽章暂停)。 */
export function claimBadgeOf(
  w: Pick<WorkRow, "userId" | "source" | "claimedTokens">,
  totals: Map<number, number>,
  claimSums: Map<number, number>,
): number | null {
  if (w.userId === null || w.source !== "site") return null;
  const claim = w.claimedTokens;
  if (claim === null || claim <= 0) return null;
  const total = totals.get(w.userId) ?? 0;
  if (total <= 0) return null;
  const sum = claimSums.get(w.userId) ?? 0;
  if (sum > total) return null;
  return claim;
}

/* 作者视角提示(纯函数):声明总额是否已超出可验证总量(徽章暂停,需重新分配)。 */
export function claimsPaused(total: number, claimSum: number): boolean {
  return claimSum > 0 && claimSum > total;
}

/* 建议预填匹配(纯函数):作品名与项目 label 大小写不敏感精确匹配优先,
   其次互为子串;都没有 → null。projects 上游已按 tokens 降序。 */
export function matchSuggestedClaim(
  workName: string,
  projects: ClaimProjectTotal[],
): ClaimProjectTotal | null {
  const n = workName.trim().toLowerCase();
  if (!n) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  return (
    projects.find((p) => norm(p.label) === n) ??
    projects.find((p) => {
      const l = norm(p.label);
      return l !== "" && (l.includes(n) || n.includes(l));
    }) ??
    null
  );
}

/* 一批作者 → 各自全部作品(物理删除,无软删过滤)的 Σclaimed_tokens。
   批量一条 IN 查询,与徽章总量查询配对(展示时不变式的两侧)。 */
export function workClaimSumsQuery(
  userIds: (number | null)[],
): { sql: string; args: unknown[] } | null {
  const ids = [
    ...new Set(
      userIds.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0),
    ),
  ];
  if (ids.length === 0) return null;
  return {
    sql: `SELECT user_id, SUM(claimed_tokens) AS claimed
          FROM works WHERE user_id IN (?) GROUP BY user_id`,
    args: [ids],
  };
}

export async function getWorkClaimSums(
  userIds: (number | null)[],
  db: Queryable = getPool(),
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const q = workClaimSumsQuery(userIds);
  if (!q) return map;
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  for (const r of rows) map.set(Number(r.user_id), Number(r.claimed) || 0);
  return map;
}

export interface ClaimAllowance {
  /* 作者可验证总量(内部口径,不公开渲染) */
  total: number;
  /* 其他作品已声明合计(编辑时排除本作品);删除作品后自然回落 = 释放额度 */
  claimed: number;
  /* 剩余可声明额度 = max(0, total − claimed) */
  remaining: number;
}

/* 写时/表单侧的额度口径:总量(内部验证)+ 已声明合计(可排除本作品)。 */
export async function getClaimAllowance(
  userId: number,
  excludeWorkId?: number,
  db: Queryable = getPool(),
): Promise<ClaimAllowance> {
  const exclude =
    excludeWorkId !== undefined &&
    Number.isSafeInteger(excludeWorkId) &&
    excludeWorkId > 0;
  const [totals, [rows]] = await Promise.all([
    getVerifiableTokenTotals([userId], db),
    db.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(claimed_tokens), 0) AS claimed
       FROM works WHERE user_id = ?${exclude ? " AND id <> ?" : ""}`,
      exclude ? [userId, excludeWorkId] : [userId],
    ),
  ]);
  const total = totals.get(userId) ?? 0;
  const claimed = Number(rows[0]?.claimed ?? 0) || 0;
  return { total, claimed, remaining: Math.max(0, total - claimed) };
}

export async function getWork(id: number): Promise<WorkRow | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `${SELECT_WORKS} WHERE w.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapWork(rows[0]) : null;
}

export interface WorkFields {
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  screenshotUrl: string;
  tags: string[];
  agents: string[];
  authorLabel: string; // 非空 → source=awesome(推荐站外项目)
  /* public/private;action 层已钉死枚举(非 'private' 一律 public) */
  visibility: "public" | "private";
  /* 构建投入声明(声明制);null = 未声明。额度校验在 action 层(checkClaimAllowance) */
  claimedTokens: number | null;
  /* 20260824_work_meta;action 层已做白名单校验 */
  status: string;
  models: string[];
  kind: string;
  descriptionMd: string;
  /* awesome 收录口径(base/eco/part);作品墙条目恒 null */
  scope: string | null;
  /* 20260826_work_media;action 层已做形状 + 前缀校验(isWorkLogoKey/areWorkImageKeys) */
  logoKey: string;
  imageKeys: string[];
}

/* ---- 作品媒体 key 校验(20260826_work_media)----
   实现在 src/lib/work-media.ts(纯函数,客户端组件可引);这里 re-export
   让 action / 测试维持从 works 导入的既有习惯。 */
export {
  areWorkImageKeys,
  isWorkLogoKey,
  isWorkMediaKey,
  parseWorkImageKeysInput,
  WORK_IMAGE_MAX,
} from "./work-media";
import { WORK_IMAGE_MAX } from "./work-media";

export async function createWork(
  userId: number,
  f: WorkFields,
): Promise<number> {
  const source = f.authorLabel ? "awesome" : "site";
  const [res] = await getPool().query<ResultSetHeader>(
    `INSERT INTO works (user_id, name, tagline, url, repo_url, screenshot_url, tags, agents, source, visibility, author_label, claimed_tokens, status, models, kind, description_md, scope, logo_key, image_keys)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      f.name.slice(0, 120),
      f.tagline.slice(0, 300),
      f.url.slice(0, 500),
      f.repoUrl.slice(0, 500),
      f.screenshotUrl.slice(0, 500),
      JSON.stringify(f.tags.slice(0, 5)),
      JSON.stringify(f.agents.slice(0, 10)),
      source,
      f.visibility === "private" ? "private" : "public",
      f.authorLabel.slice(0, 120),
      /* awesome 条目强制无声明(声明是作品墙的作者自报语义) */
      source === "awesome" ? null : f.claimedTokens,
      f.status,
      JSON.stringify(f.models.slice(0, 10)),
      f.kind,
      f.descriptionMd || null,
      source === "awesome" ? f.scope : null,
      /* 媒体同声明:仅作品墙条目,awesome 强制为空 */
      source === "awesome" ? "" : f.logoKey.slice(0, 255),
      source === "awesome" || f.imageKeys.length === 0
        ? null
        : JSON.stringify(f.imageKeys.slice(0, WORK_IMAGE_MAX)),
    ],
  );
  return Number(res.insertId);
}

export async function updateWork(
  userId: number,
  workId: number,
  f: WorkFields,
): Promise<boolean> {
  const source = f.authorLabel ? "awesome" : "site";
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE works SET name = ?, tagline = ?, url = ?, repo_url = ?, screenshot_url = ?,
       tags = ?, agents = ?, source = ?, visibility = ?, author_label = ?, claimed_tokens = ?,
       status = ?, models = ?, kind = ?, description_md = ?, scope = ?,
       logo_key = ?, image_keys = ?
     WHERE id = ? AND user_id = ?`,
    [
      f.name.slice(0, 120),
      f.tagline.slice(0, 300),
      f.url.slice(0, 500),
      f.repoUrl.slice(0, 500),
      f.screenshotUrl.slice(0, 500),
      JSON.stringify(f.tags.slice(0, 5)),
      JSON.stringify(f.agents.slice(0, 10)),
      source,
      f.visibility === "private" ? "private" : "public",
      f.authorLabel.slice(0, 120),
      source === "awesome" ? null : f.claimedTokens,
      f.status,
      JSON.stringify(f.models.slice(0, 10)),
      f.kind,
      f.descriptionMd || null,
      source === "awesome" ? f.scope : null,
      source === "awesome" ? "" : f.logoKey.slice(0, 255),
      source === "awesome" || f.imageKeys.length === 0
        ? null
        : JSON.stringify(f.imageKeys.slice(0, WORK_IMAGE_MAX)),
      workId,
      userId,
    ],
  );
  return res.affectedRows > 0;
}

export async function deleteWork(
  userId: number,
  workId: number,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM works WHERE id = ? AND user_id = ?",
    [workId, userId],
  );
  return res.affectedRows > 0;
}


/* ---- 作品详情 + 互动(P1-2)----
   支持:只有「顶」没有踩,再点取消;复合主键 (work_id, user_id) 天然幂等。
   评论:单层(无楼中楼)、软删;评论作者本人或作品作者可删,权限钉在 SQL WHERE。
   冗余计数 vote_count / comment_count 随写路径维护,减侧 GREATEST 兜底(并发不击穿 0)。
   AI 不介入作品评论(无 is_ai、不触发 ai_reply_jobs)。 */

export interface WorkDetail extends WorkRow {
  /* 精选定夺编辑(featured_by)的 handle;未精选/账号已注销 → null */
  editorHandle: string | null;
}

export const getWorkDetail = cache(
  async (id: number): Promise<WorkDetail | null> => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${SELECT_WORK_DETAIL} WHERE w.id = ? LIMIT 1`,
      [id],
    );
    const r = rows[0];
    return r ? { ...mapWork(r), editorHandle: r.editor_handle ?? null } : null;
  },
);

/* 声明徽章上下文(作者可验证总量 + Σ声明):作品详情页与右栏元数据卡共用,
   React cache 按请求去重(getVerifiableTokenTotals/getWorkClaimSums 的入参是数组,
   直接 cache 去重不了,这里收敛成标量 userId 入口)。 */
export const getAuthorClaimContext = cache(
  async (userId: number): Promise<{ total: number; claimSum: number }> => {
    const [totals, sums] = await Promise.all([
      getVerifiableTokenTotals([userId]),
      getWorkClaimSums([userId]),
    ]);
    return {
      total: totals.get(userId) ?? 0,
      claimSum: sums.get(userId) ?? 0,
    };
  },
);

/* 作品详情右栏「相关作品」:同作者或同 Agent(任一交集),同作者优先,其余按新到旧。
   右栏是公共上下文,只取 public —— 别人的私密作品不能借右栏漏出(同 relatedPostsQuery)。
   站内作者与 agents 都没有(理论上的空条目)时不构成任何条件 → null,调用方不查库。 */
export function relatedWorksQuery(
  work: { id: number; userId: number | null; agents: string[] },
  limit = 5,
): { sql: string; args: (string | number)[] } | null {
  const conds: string[] = [];
  const args: (string | number)[] = [work.id];
  if (work.userId !== null) {
    conds.push("w.user_id = ?");
    args.push(work.userId);
  }
  if (work.agents.length > 0) {
    conds.push("JSON_OVERLAPS(w.agents, ?)");
    args.push(JSON.stringify(work.agents.slice(0, 10)));
  }
  if (conds.length === 0) return null;
  const n = Math.max(1, Math.min(20, Math.floor(limit)));
  let order = "w.id DESC";
  if (work.userId !== null) {
    /* 同作者的排前面;order 部分的 ? 跟在 where 之后(位置参数按序绑定) */
    order = "(w.user_id = ?) DESC, w.id DESC";
    args.push(work.userId);
  }
  return {
    sql: `${SELECT_WORKS} WHERE w.id <> ? AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC} AND (${conds.join(" OR ")})
     ORDER BY ${order} LIMIT ${n}`,
    args,
  };
}

export async function getRelatedWorks(
  work: { id: number; userId: number | null; agents: string[] },
  limit = 5,
): Promise<WorkRow[]> {
  const q = relatedWorksQuery(work, limit);
  if (!q) return [];
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map(mapWork);
}

/* /awesome 右栏来源统计:站内成员作品 vs 站外推荐条目数(公共上下文,仅公开条目)。 */
/* /works 列表右栏:按支持数的热门站内作品(精选与否不参与排序,徽章只是编辑意志) */
export async function getTopWorks(limit = 5): Promise<WorkRow[]> {
  const n = Math.max(1, Math.min(20, Math.floor(limit)));
  const [rows] = await getPool().query<RowDataPacket[]>(
    `${SELECT_WORKS} WHERE w.source = 'site' AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC} ORDER BY w.vote_count DESC, w.id DESC LIMIT ${n}`,
  );
  return rows.map(mapWork);
}

export function awesomeSourceStatsQuery(): { sql: string; args: string[] } {
  return {
    sql: `SELECT w.source, COUNT(*) AS n FROM works w WHERE ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC} GROUP BY w.source`,
    args: [],
  };
}

export async function getAwesomeSourceStats(): Promise<{
  site: number;
  awesome: number;
}> {
  const q = awesomeSourceStatsQuery();
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  let site = 0;
  let awesome = 0;
  for (const r of rows) {
    if (r.source === "site") site = Number(r.n);
    else if (r.source === "awesome") awesome = Number(r.n);
  }
  return { site, awesome };
}

/* ---- 列表右栏统计(20260824 改造)---- */

/* /works 右栏:上架作品 / 作者 / 声明投入 Σ / 本周新上架(全部 source='site';
   公共上下文,仅公开条目——私密作品的数量也不计入,同 posts 社区统计口径)。 */
export async function getWorksWallStats(): Promise<{
  works: number;
  authors: number;
  claimedSum: number;
  weeklyNew: number;
}> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS works, COUNT(DISTINCT w.user_id) AS authors,
            COALESCE(SUM(w.claimed_tokens), 0) AS claimed_sum,
            COALESCE(SUM(CASE WHEN w.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END), 0) AS weekly_new
     FROM works w WHERE w.source = 'site' AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`,
  );
  const r = rows[0] ?? {};
  return {
    works: Number(r.works ?? 0),
    authors: Number(r.authors ?? 0),
    claimedSum: Number(r.claimed_sum ?? 0),
    weeklyNew: Number(r.weekly_new ?? 0),
  };
}

/* 活跃 Agent 分布(按参与作品数;JSON 成员在 JS 侧摊开,作品量小无需 JSON_TABLE)。
   公共上下文,仅公开条目。 */
export async function getWorksAgentStats(
  source: "site" | "awesome",
  limit = 6,
): Promise<{ agent: string; count: number }[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    source === "site"
      ? `SELECT w.agents FROM works w WHERE w.source = 'site' AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`
      : `SELECT w.agents FROM works w WHERE w.source = 'awesome' AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`,
  );
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const a of parseStrArray(r.agents)) {
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/* /awesome 右栏:收录项目 / 参与 Agent / 本周新增 / 推荐成员(公共上下文,仅公开条目)。 */
export async function getAwesomeStats(): Promise<{
  items: number;
  agents: number;
  weeklyNew: number;
  recommenders: number;
}> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT w.agents, w.user_id, w.created_at FROM works w WHERE w.source = 'awesome' AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`,
  );
  const agentSet = new Set<string>();
  const recommenderSet = new Set<number>();
  let weeklyNew = 0;
  const weekAgo = Date.now() - 7 * 86_400_000;
  for (const r of rows) {
    for (const a of parseStrArray(r.agents)) agentSet.add(a);
    if (r.user_id !== null) recommenderSet.add(Number(r.user_id));
    if (r.created_at && new Date(r.created_at).getTime() >= weekAgo) weeklyNew += 1;
  }
  return {
    items: rows.length,
    agents: agentSet.size,
    weeklyNew,
    recommenders: recommenderSet.size,
  };
}

/* /awesome 收录口径计数(base/eco/part;公共上下文,仅公开条目)。 */
export async function getAwesomeScopeStats(): Promise<{
  base: number;
  eco: number;
  part: number;
}> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT w.scope, COUNT(*) AS n FROM works w WHERE w.source = 'awesome' AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC} GROUP BY w.scope`,
  );
  const out = { base: 0, eco: 0, part: 0 };
  for (const r of rows) {
    if (r.scope === "base" || r.scope === "eco" || r.scope === "part") {
      out[r.scope as "base" | "eco" | "part"] = Number(r.n);
    }
  }
  return out;
}

/* 类型分布(按作品数;卡片 chip / 筛选下拉 / 右栏共用同一预设表 work-kinds.ts)。
   公共上下文,仅公开条目。 */
export async function getWorksKindStats(
  source: "site" | "awesome",
): Promise<{ kind: string; count: number }[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT w.kind, COUNT(*) AS n FROM works w WHERE w.source = ? AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC} GROUP BY w.kind ORDER BY n DESC`,
    [source],
  );
  return rows.map((r) => ({ kind: String(r.kind), count: Number(r.n) }));
}

/* 浏览者是否已支持(详情页支持按钮初态)。 */
export async function hasWorkVote(
  userId: number,
  workId: number,
): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id FROM work_votes WHERE work_id = ? AND user_id = ? LIMIT 1",
    [workId, userId],
  );
  return !!rows[0];
}

/* INSERT IGNORE:并发重复/双击由复合主键挡住,不报错的幂等插入。 */
export function workVoteInsertQuery(
  workId: number,
  userId: number,
): { sql: string; args: number[] } {
  return {
    sql: "INSERT IGNORE INTO work_votes (work_id, user_id) VALUES (?, ?)",
    args: [workId, userId],
  };
}

export function workVoteDeleteQuery(
  workId: number,
  userId: number,
): { sql: string; args: number[] } {
  return {
    sql: "DELETE FROM work_votes WHERE work_id = ? AND user_id = ?",
    args: [workId, userId],
  };
}

/* 减侧先 CAST 成 SIGNED 再 GREATEST:UNSIGNED 直接 -1 会回绕成巨值
   (同 posts.ts hotExpr 的坑),兜底在并发误删时不击穿 0。 */
export function workVoteCountQuery(
  workId: number,
  delta: 1 | -1,
): { sql: string; args: number[] } {
  return {
    sql:
      delta > 0
        ? "UPDATE works SET vote_count = vote_count + 1 WHERE id = ?"
        : "UPDATE works SET vote_count = GREATEST(0, CAST(vote_count AS SIGNED) - 1) WHERE id = ?",
    args: [workId],
  };
}

/* insert 的 affectedRows:1 = 这次新支持(计数 +1);0 = 已支持过(这次 = 取消)。 */
export function workVoteBranch(insertAffectedRows: number): "support" | "cancel" {
  return insertAffectedRows > 0 ? "support" : "cancel";
}

/* 支持 toggle:插入成功即支持,已存在则删除取消;返回本次终态(客户端乐观路径
   只关心 ok,返回值供调用方/测试对齐语义)。 */
export async function toggleWorkVote(
  userId: number,
  workId: number,
): Promise<"support" | "cancel"> {
  const pool = getPool();
  const ins = workVoteInsertQuery(workId, userId);
  const [res] = await pool.query<ResultSetHeader>(ins.sql, ins.args);
  const branch = workVoteBranch(res.affectedRows);
  if (branch === "support") {
    const q = workVoteCountQuery(workId, 1);
    await pool.query(q.sql, q.args);
  } else {
    const del = workVoteDeleteQuery(workId, userId);
    const [d] = await pool.query<ResultSetHeader>(del.sql, del.args);
    if (d.affectedRows > 0) {
      const q = workVoteCountQuery(workId, -1);
      await pool.query(q.sql, q.args);
    }
  }
  return branch;
}

/* ---- 评论 ---- */

export interface WorkCommentRow {
  id: number;
  workId: number;
  userId: number;
  body: string;
  createdAt: Date;
  handle: string | null;
  avatarUrl: string | null;
}

/* 单层评论分页:id 游标,时间正序(旧的在前,对话从下往上长),每页多取 1 条
   判断下一页;翻页期间新增评论只追加在末尾,不会顶乱已翻过的页(同社区取舍)。 */
export const WORK_COMMENT_PAGE_SIZE = 50;

export function workCommentPageQuery(
  workId: number,
  after: number,
): { sql: string; args: number[] } {
  return {
    sql: `SELECT c.id, c.work_id, c.user_id, c.body, c.created_at,
            u.handle, u.avatar_url
     FROM work_comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.work_id = ? AND c.deleted_at IS NULL AND c.id > ?
     ORDER BY c.id ASC LIMIT ${WORK_COMMENT_PAGE_SIZE + 1}`,
    args: [workId, after],
  };
}

/* 可见评论总数:与 workCommentPageQuery 同口径(滤软删),两者必须一起改。 */
export function workCommentCountQuery(workId: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: "SELECT COUNT(*) AS n FROM work_comments WHERE work_id = ? AND deleted_at IS NULL",
    args: [workId],
  };
}

export interface WorkCommentPage {
  comments: WorkCommentRow[];
  total: number;
  nextCursor: number | null;
}

export async function getWorkCommentsPage(
  workId: number,
  after = 0,
): Promise<WorkCommentPage> {
  const count = workCommentCountQuery(workId);
  const page = workCommentPageQuery(workId, after);
  const pool = getPool();
  const [countRows, rows] = await Promise.all([
    pool.query<RowDataPacket[]>(count.sql, count.args).then(([r]) => r),
    pool.query<RowDataPacket[]>(page.sql, page.args).then(([r]) => r),
  ]);
  const kept =
    rows.length > WORK_COMMENT_PAGE_SIZE
      ? rows.slice(0, WORK_COMMENT_PAGE_SIZE)
      : rows;
  return {
    comments: kept.map((r) => ({
      id: Number(r.id),
      workId: Number(r.work_id),
      userId: Number(r.user_id),
      body: r.body,
      createdAt: r.created_at,
      handle: r.handle ?? null,
      avatarUrl: r.avatar_url ?? null,
    })),
    total: Number(countRows[0]?.n ?? 0),
    nextCursor:
      rows.length > WORK_COMMENT_PAGE_SIZE && kept.length > 0
        ? Number(kept[kept.length - 1].id)
        : null,
  };
}

/* 发评论:插入 + 冗余计数 +1(两条语句,同社区 createComment 的非事务取舍);
   不发通知、不排 AI 任务(作品评论从简)。 */
export function workCommentInsertQuery(
  workId: number,
  userId: number,
  body: string,
): { sql: string; args: (string | number)[] } {
  return {
    sql: "INSERT INTO work_comments (work_id, user_id, body) VALUES (?, ?, ?)",
    args: [workId, userId, body.slice(0, 10000)],
  };
}

export async function createWorkComment(
  workId: number,
  userId: number,
  body: string,
): Promise<number> {
  const pool = getPool();
  const ins = workCommentInsertQuery(workId, userId, body);
  const [res] = await pool.query<ResultSetHeader>(ins.sql, ins.args);
  await pool.query(
    "UPDATE works SET comment_count = comment_count + 1 WHERE id = ?",
    [workId],
  );
  return Number(res.insertId);
}

/* 删评论(软删):评论作者本人或作品作者可删,权限钉在 WHERE(c.user_id 或
   w.user_id);多表 UPDATE 一条语句同时把 works.comment_count 减 1。
   affectedRows = 0 → 不存在/已删/越权,调用方按失败处理。 */
export function workCommentDeleteQuery(
  commentId: number,
  userId: number,
): { sql: string; args: number[] } {
  return {
    sql: `UPDATE work_comments c JOIN works w ON w.id = c.work_id
     SET c.deleted_at = NOW(),
         w.comment_count = GREATEST(0, CAST(w.comment_count AS SIGNED) - 1)
     WHERE c.id = ? AND c.deleted_at IS NULL
           AND (c.user_id = ? OR w.user_id = ?)`,
    args: [commentId, userId, userId],
  };
}

export async function deleteWorkComment(
  userId: number,
  commentId: number,
): Promise<boolean> {
  const q = workCommentDeleteQuery(commentId, userId);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return res.affectedRows > 0;
}
