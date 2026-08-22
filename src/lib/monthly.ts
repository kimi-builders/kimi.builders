/* 月刊组装制(plan-monthly-learn-launch.md §一):/blog 期次从真实数据组装,不手写。
   20260921 产品转向:初期月刊 = AI 月刊,
   新三层:01 本月评鉴(articles.body_md,编辑手写的策展长文,AI 参与必披露)、
   02 事实盘点(L1,可验证快照)、03 编辑定夺(L2,featured + 治理公示)。
   组装口径(页脚公示,可复算):
   · L2 facts     ← 社区总量(成员/帖子/作品/评论)+ usage 全站累计 token
                    + 近 30 天缓存命中率与 TOP 模型(usage/community.ts 窗口聚合);
                    缺项诚实显示 "—",不编数;
   · L3 decisions ← 文章月份(published_at 所在月,UTC)的 featured 帖子/作品
                    (featured_reason + 定夺编辑 handle)+ payload.governance 公示条目。
   payload(articles.payload,JSON)只存数据给不了的编辑定夺:治理公示、
   AI 参与披露;NULL = 纯自动组装。
   纯函数(校验/组装/查询构建)与 DB 读写分离,写法对齐 ./articles、./featured。 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import {
  getArticleBySlug,
  listArticles,
  type ArticleListItem,
} from "./articles";
import { isCoverTone } from "./cover-tones";
import { compactNumber, plainExcerpt } from "./format";
import { getCommunityStats } from "./posts";
import { usageCacheHitRate } from "./usage-contract";
import { getCommunityTokenTotal, getCommunityUsageWindow } from "./usage/community";
import { canonicalUsageModel, usageModelDisplayName } from "./usage/model-meta";

export const MISSING = "—";

export type MonthlyLocale = "zh" | "en";

/* ---- 展示层类型(渲染契约;mock 类型蓝本见 tests/fixtures/monthly-mock.ts)---- */

/* L2 事实盘点:一条可验证快照;value = MISSING("—")表示数据缺项。 */
export interface IssueFact {
  label: string;
  value: string;
}

/* L3 编辑定夺:featured 帖子/作品(系统带出)+ payload 治理公示。 */
export type IssueDecisionKind = "post" | "work" | "governance";

export interface IssueDecision {
  kind: IssueDecisionKind;
  title: string;
  href: string; // 帖子 → /community/<id>;作品 → 作品链接;governance → rulingUrl
  authorHandle: string; // 站内作者 handle(不带 @);外部作品为 author_label;governance 为空串
  authorHref: string | null;
  note: string; // featured_reason / 公示说明
  editorHandle: string; // 定夺编辑;缺失为空串(展示容错跳过)
  rulingUrl: string | null; // governance:公示全文(社区帖)
}

/* AI 参与披露:哪节有 AI 参与、参与度(RFC §1 纪律);键缺省 = 该节无 AI 参与。
   分节键与锚一致:digest(本月评鉴)/ facts / decisions。 */
export type AiDisclosure = Partial<
  Record<"digest" | "facts" | "decisions", string>
>;

export interface AssembledIssue {
  slug: string;
  issue: number; // 期号 = 已发布 letter 按 published_at 正序的序号(1 起)
  month: string; // YYYY-MM(published_at,UTC)
  title: string;
  summary: string;
  /* 本月评鉴(articles.body_md):详情页的 01 节;总览组装不取
     (列表查询不选 body_md),恒为空串 —— 分享海报同样不消费 */
  bodyMd: string;
  editorHandle: string;
  publishedAt: Date;
  facts: IssueFact[];
  decisions: IssueDecision[];
  aiDisclosure: AiDisclosure | null;
  assembledAt: Date; // 数据截止时间(页脚公示)
}

/* 列表/导航用轻量形态(未组装三层)。 */
export interface LetterIssueMeta {
  slug: string;
  issue: number;
  month: string;
  title: string;
  summary: string;
  editorHandle: string;
  publishedAt: Date;
  locale: MonthlyLocale; // 实际语言版本(fallback=与 UI 语言不一致)
  fallback: boolean;
}

/* ---- payload(articles.payload)契约与校验 ---- */

export interface LetterGovernanceEntry {
  title: string;
  note: string;
  rulingUrl?: string;
}

export interface LetterPayload {
  aiDisclosure?: AiDisclosure;
  governance?: LetterGovernanceEntry[];
  /* 探索四维的标签维(20260821):≤5 个,每标签 ≤24 字,去重 */
  tags?: string[];
  /* 封面(20260822):站内路径或 https 图片,列表横列卡左列;缺省 = 自动章字砖(「刊」) */
  cover?: string;
  /* 章字砖色调(20260822,与作品名称砖同一色板):无上传封面/图挂时生效;
     白名单见 cover-tones.ts(theme = 跟随主题,缺省) */
  coverTone?: string;
}

export type PayloadParseResult =
  | { ok: true; payload: LetterPayload }
  | { ok: false; error: string };

const GOVERNANCE_MAX = 20;
const TAGS_MAX = 5;
const TAG_MAX_LEN = 24;

/* 标签校验(两种 payload 共用):≤TAGS_MAX 个、每个 1-24 字、去重 */
export function normalizeTags(value: unknown): { ok: true; tags: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length > TAGS_MAX) {
    return { ok: false, error: `tags 需为数组(≤${TAGS_MAX} 个)` };
  }
  const tags: string[] = [];
  for (const t of value) {
    const s = typeof t === "string" ? t.trim() : "";
    if (!s || s.length > TAG_MAX_LEN) {
      return { ok: false, error: `tags 每项需为 1-${TAG_MAX_LEN} 字文本` };
    }
    if (!tags.includes(s)) tags.push(s);
  }
  return { ok: true, tags };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function boundedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

/* rulingUrl:站内相对路径(/...)或 http(s) 链接,≤500 字。 */
function normalizeRulingUrl(v: unknown): string | null {
  const s = boundedString(v, 500);
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

function unknownKey(obj: Record<string, unknown>, known: string[]): string | null {
  return Object.keys(obj).find((k) => !known.includes(k)) ?? null;
}

/* 严格校验:未知字段/非法值给出具体错误(编辑后台就地提示);
   渲染路径(letterPayloadFromDb)容错回落空 payload,不让一条坏 payload 打掉整页。 */
export function validateLetterPayload(value: unknown): PayloadParseResult {
  if (!isPlainObject(value)) return { ok: false, error: "payload 必须是 JSON 对象" };
  const stray = unknownKey(value, ["aiDisclosure", "governance", "tags", "cover", "coverTone"]);
  if (stray) return { ok: false, error: `payload 未知字段:${stray}` };
  const payload: LetterPayload = {};

  if (value.cover !== undefined) {
    const s = boundedString(value.cover, 500);
    if (!s || (!s.startsWith("/") && !/^https?:\/\//i.test(s))) {
      return { ok: false, error: "cover 需为站内路径或 http(s) 图片链接" };
    }
    payload.cover = s;
  }
  if (value.coverTone !== undefined) {
    const c = boundedString(value.coverTone, 16);
    if (!c || !isCoverTone(c)) {
      return { ok: false, error: `coverTone 不在册:${String(value.coverTone)}(色板见 src/lib/cover-tones.ts)` };
    }
    payload.coverTone = c;
  }

  if (value.tags !== undefined) {
    const r = normalizeTags(value.tags);
    if (!r.ok) return r;
    payload.tags = r.tags;
  }

  if (value.aiDisclosure !== undefined) {
    if (!isPlainObject(value.aiDisclosure)) {
      return { ok: false, error: "aiDisclosure 必须是对象" };
    }
    const k = unknownKey(value.aiDisclosure, ["digest", "facts", "decisions"]);
    if (k) return { ok: false, error: `aiDisclosure 未知分节:${k}` };
    const disclosure: AiDisclosure = {};
    for (const section of ["digest", "facts", "decisions"] as const) {
      const note = value.aiDisclosure[section];
      if (note === undefined) continue;
      const s = boundedString(note, 280);
      if (!s) return { ok: false, error: `aiDisclosure.${section} 需为 1-280 字文本` };
      disclosure[section] = s;
    }
    payload.aiDisclosure = disclosure;
  }

  if (value.governance !== undefined) {
    if (!Array.isArray(value.governance) || value.governance.length > GOVERNANCE_MAX) {
      return { ok: false, error: `governance 需为数组(≤${GOVERNANCE_MAX} 条)` };
    }
    const governance: LetterGovernanceEntry[] = [];
    for (let i = 0; i < value.governance.length; i++) {
      const entry = value.governance[i];
      if (!isPlainObject(entry)) {
        return { ok: false, error: `governance[${i}] 必须是对象` };
      }
      const k = unknownKey(entry, ["title", "note", "rulingUrl"]);
      if (k) return { ok: false, error: `governance[${i}] 未知字段:${k}` };
      const title = boundedString(entry.title, 200);
      const note = boundedString(entry.note, 500);
      if (!title || !note) {
        return { ok: false, error: `governance[${i}] title/note 必填(title ≤200,note ≤500)` };
      }
      const out: LetterGovernanceEntry = { title, note };
      if (entry.rulingUrl !== undefined) {
        const url = normalizeRulingUrl(entry.rulingUrl);
        if (!url) {
          return { ok: false, error: `governance[${i}] rulingUrl 需为站内路径或 http(s) 链接` };
        }
        out.rulingUrl = url;
      }
      governance.push(out);
    }
    payload.governance = governance;
  }

  return { ok: true, payload };
}

/* 编辑后台入口:JSON 文本 → 严格校验;空串 → ok + 空 payload(NULL 语义:纯自动组装)。 */
export function parseLetterPayload(raw: string): PayloadParseResult {
  const text = raw.trim();
  if (!text) return { ok: true, payload: {} };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "payload 不是合法 JSON" };
  }
  return validateLetterPayload(value);
}

/* DB 读取入口(渲染路径):容错——JSON 已由驱动解析;非法内容回落空 payload,
   期次照常自动组装,不让一条坏 payload 打掉整页。 */
export function letterPayloadFromDb(raw: unknown): LetterPayload {
  if (raw === null || raw === undefined || raw === "") return {};
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  if (value === undefined) return {};
  const r = validateLetterPayload(value);
  return r.ok ? r.payload : {};
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/* ---- 月份窗口(UTC;与 published_at/created_at 的 UTC 口径一致,见 db.ts)---- */

export function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* "2026-08" → ["2026-08-01 00:00:00", "2026-09-01 00:00:00")(半开区间);非法返回 null。 */
export function monthWindow(month: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const next = mon === 12 ? { y: year + 1, m: 1 } : { y: year, m: mon + 1 };
  const fmt = (y: number, mm: number) =>
    `${y}-${String(mm).padStart(2, "0")}-01 00:00:00`;
  return { start: fmt(year, mon), end: fmt(next.y, next.m) };
}

/* ---- L1 facts ---- */

export interface MonthlyStatsSnapshot {
  members: number;
  posts: number;
  works: number;
  comments: number;
  tokensTotal: number; // 全站累计(与首页数据条同口径)
  cacheHitRate: number | null; // 近 30 天;null=无输入侧流量
  topModel: { name: string; share: number } | null; // 近 30 天,份额 0-1
}

export function buildFacts(
  snapshot: MonthlyStatsSnapshot,
  locale: MonthlyLocale,
): IssueFact[] {
  const zh = locale === "zh";
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return [
    {
      label: zh ? "全站同步 Token(累计)" : "Tokens synced (all-time)",
      value: compactNumber(snapshot.tokensTotal, locale),
    },
    {
      label: zh ? "社区成员" : "Members",
      value: String(snapshot.members),
    },
    {
      label: zh ? "社区帖子" : "Posts",
      value: String(snapshot.posts),
    },
    {
      label: zh ? "社区作品" : "Works",
      value: String(snapshot.works),
    },
    {
      label: zh ? "社区评论" : "Comments",
      value: String(snapshot.comments),
    },
    {
      label: zh ? "缓存命中率 · 近 30 天" : "Cache hit rate · 30d",
      value: snapshot.cacheHitRate === null ? MISSING : pct(snapshot.cacheHitRate),
    },
    {
      label: zh ? "TOP 模型 · 近 30 天" : "Top model · 30d",
      value: snapshot.topModel
        ? `${snapshot.topModel.name} · ${pct(snapshot.topModel.share)}`
        : MISSING,
    },
  ];
}

/* 模型分布聚合(纯):按 canonical 模型合并窗口行,按 token 降序取前 limit,share=占比。
   写法对齐 usage/query.ts 的 canonicalModelOf 口径。 */
export interface UsageModelTokensRow {
  source: string;
  model: string;
  modelCanonical: string;
  modelProvider: string;
  tokens: number;
}

export function topUsageModels(
  rows: UsageModelTokensRow[],
  limit = 3,
): { name: string; tokens: number; share: number }[] {
  const byCanonical = new Map<string, { name: string; tokens: number }>();
  let total = 0;
  for (const r of rows) {
    const identity = {
      source: r.source,
      model: r.model,
      modelCanonical: r.modelCanonical,
      modelProvider: r.modelProvider,
    };
    const canonical = canonicalUsageModel(identity) || r.model || "unknown";
    const entry = byCanonical.get(canonical) ?? {
      name: usageModelDisplayName(identity),
      tokens: 0,
    };
    entry.tokens += r.tokens;
    byCanonical.set(canonical, entry);
    total += r.tokens;
  }
  if (total <= 0) return [];
  return [...byCanonical.values()]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, Math.max(1, limit))
    .map((m) => ({ name: m.name, tokens: m.tokens, share: m.tokens / total }));
}

/* ---- L2 decisions ---- */

/* featured 帖子/作品的统一视图(月窗查询行 → 此形态,再 → IssueDecision)。 */
export interface MonthlyFeaturedEntry {
  kind: "post" | "work";
  id: number;
  href: string;
  title: string;
  authorHandle: string; // 站内 handle(不带 @);外部作品为 author_label
  authorHref: string | null;
  reason: string;
  editorHandle: string;
  featuredAt: Date;
}

export function buildDecisions(
  featured: MonthlyFeaturedEntry[],
  governance: LetterGovernanceEntry[],
): IssueDecision[] {
  const items: IssueDecision[] = featured.map((f) => ({
    kind: f.kind,
    title: f.title,
    href: f.href,
    authorHandle: f.authorHandle,
    authorHref: f.authorHref,
    note: f.reason,
    editorHandle: f.editorHandle,
    rulingUrl: null,
  }));
  for (const g of governance) {
    items.push({
      kind: "governance",
      title: g.title,
      href: g.rulingUrl ?? "",
      authorHandle: "",
      authorHref: null,
      note: g.note,
      editorHandle: "",
      rulingUrl: g.rulingUrl ?? null,
    });
  }
  return items;
}

/* ---- 期次组装(纯) ---- */

export interface AssembleIssueInput {
  article: {
    slug: string;
    title: string;
    summary: string;
    /* 本月评鉴正文;总览(listArticles 不选 body_md)省略 → 空串 */
    bodyMd?: string;
    authorHandle: string;
    publishedAt: Date;
  };
  issueNumber: number;
  stats: MonthlyStatsSnapshot;
  featured: MonthlyFeaturedEntry[];
  payload: LetterPayload;
  locale: MonthlyLocale;
  now: Date;
}

export function assembleIssue(input: AssembleIssueInput): AssembledIssue {
  const { article, payload } = input;
  const disclosure = payload.aiDisclosure;
  return {
    slug: article.slug,
    issue: input.issueNumber,
    month: monthOf(article.publishedAt),
    title: article.title,
    summary: article.summary,
    bodyMd: article.bodyMd ?? "",
    editorHandle: article.authorHandle,
    publishedAt: article.publishedAt,
    facts: buildFacts(input.stats, input.locale),
    decisions: buildDecisions(input.featured, payload.governance ?? []),
    aiDisclosure:
      disclosure && Object.keys(disclosure).length > 0 ? disclosure : null,
    assembledAt: input.now,
  };
}

/* 已发布 letter 列表 → 轻量期次(期号:发布时间正序 1 起)。
   输入按展示序(新期在前,listArticles 口径),期号 = 总数 - 位次。 */
export function letterIssueMetas(
  articles: Pick<
    ArticleListItem,
    "slug" | "title" | "summary" | "authorHandle" | "publishedAt" | "locale" | "fallback"
  >[],
): LetterIssueMeta[] {
  const total = articles.length;
  return articles.map((a, i) => ({
    slug: a.slug,
    issue: total - i,
    month: monthOf(a.publishedAt),
    title: a.title,
    summary: a.summary,
    editorHandle: a.authorHandle,
    publishedAt: a.publishedAt,
    locale: a.locale,
    fallback: a.fallback,
  }));
}

/* ---- 查询构建(纯) ---- */

/* 作品总数(公共口径:公开且未被屏蔽;成员/帖子/评论口径见 posts.getCommunityStats)。 */
export function communityWorksCountQuery(): { sql: string; args: never[] } {
  return {
    sql: `SELECT COUNT(*) AS n FROM works
          WHERE visibility = 'public' AND hidden_at IS NULL`,
    args: [],
  };
}

/* L2:文章月份内的精选帖子(精选时间落窗,ASC = 定夺先后)。 */
export function monthFeaturedPostsQuery(window: {
  start: string;
  end: string;
}): { sql: string; args: string[] } {
  return {
    sql: `SELECT p.id, p.title, LEFT(p.body_md, 300) AS body_excerpt,
                 p.featured_at, p.featured_reason,
                 u.handle AS author_handle, e.handle AS editor_handle
          FROM posts p
          JOIN users u ON u.id = p.user_id
          LEFT JOIN users e ON e.id = p.featured_by
          WHERE p.deleted_at IS NULL AND p.visibility = 'public' AND p.hidden_at IS NULL
                AND p.featured_at IS NOT NULL
                AND p.featured_at >= ? AND p.featured_at < ?
          ORDER BY p.featured_at ASC, p.id ASC`,
    args: [window.start, window.end],
  };
}

/* L2:文章月份内的精选作品(同帖口径;u 可空 = awesome 外部条目)。 */
export function monthFeaturedWorksQuery(window: {
  start: string;
  end: string;
}): { sql: string; args: string[] } {
  return {
    sql: `SELECT w.id, w.name, w.url, w.repo_url, w.author_label,
                 w.featured_at, w.featured_reason,
                 u.handle AS author_handle, e.handle AS editor_handle
          FROM works w
          LEFT JOIN users u ON u.id = w.user_id
          LEFT JOIN users e ON e.id = w.featured_by
          WHERE w.featured_at IS NOT NULL AND w.visibility = 'public' AND w.hidden_at IS NULL
                AND w.featured_at >= ? AND w.featured_at < ?
          ORDER BY w.featured_at ASC, w.id ASC`,
    args: [window.start, window.end],
  };
}

/* ---- DB 组装 ---- */

function mapFeaturedPostRow(r: RowDataPacket): MonthlyFeaturedEntry {
  const id = Number(r.id);
  return {
    kind: "post",
    id,
    href: `/community/${id}`,
    /* 无标题帖回退到正文摘要(同 feed 口径) */
    title: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
    authorHandle: r.author_handle ?? "",
    authorHref: r.author_handle ? `/u/${r.author_handle}` : null,
    reason: r.featured_reason ?? "",
    editorHandle: r.editor_handle ?? "",
    featuredAt: r.featured_at,
  };
}

function mapFeaturedWorkRow(r: RowDataPacket): MonthlyFeaturedEntry {
  const id = Number(r.id);
  const url: string = r.url || r.repo_url || "";
  return {
    kind: "work",
    id,
    href: url || "/works",
    title: r.name,
    authorHandle: r.author_handle ?? r.author_label ?? "",
    authorHref: r.author_handle ? `/u/${r.author_handle}` : null,
    reason: r.featured_reason ?? "",
    editorHandle: r.editor_handle ?? "",
    featuredAt: r.featured_at,
  };
}

/* L1 快照:社区统计 + 作品数 + token 累计 + 近 30 天命中率/TOP 模型。 */
export async function getMonthlyStatsSnapshot(
  days = 30,
): Promise<MonthlyStatsSnapshot> {
  const [stats, worksRows, tokensTotal, windowUsage] = await Promise.all([
    getCommunityStats(),
    (async () => {
      const q = communityWorksCountQuery();
      const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
      return rows;
    })(),
    getCommunityTokenTotal(),
    getCommunityUsageWindow(days),
  ]);
  const cacheHitRate = usageCacheHitRate({
    inputTokens: windowUsage.inputTokens,
    cacheWriteInputTokens: windowUsage.cacheWriteInputTokens,
    cacheReadInputTokens: windowUsage.cacheReadInputTokens,
  });
  const top = topUsageModels(windowUsage.models, 3)[0] ?? null;
  return {
    members: stats.members,
    posts: stats.posts,
    works: Number(worksRows[0]?.n ?? 0),
    comments: stats.comments,
    tokensTotal,
    cacheHitRate,
    topModel: top ? { name: top.name, share: top.share } : null,
  };
}

/* L2 数据:文章月份内的 featured 帖子 + 作品(混排按精选时间 ASC)。 */
export async function getMonthFeatured(month: string): Promise<MonthlyFeaturedEntry[]> {
  const window = monthWindow(month);
  if (!window) return [];
  const pool = getPool();
  const pq = monthFeaturedPostsQuery(window);
  const wq = monthFeaturedWorksQuery(window);
  const [postRows, workRows] = await Promise.all([
    pool.query<RowDataPacket[]>(pq.sql, pq.args).then(([rows]) => rows),
    pool.query<RowDataPacket[]>(wq.sql, wq.args).then(([rows]) => rows),
  ]);
  return [
    ...postRows.map(mapFeaturedPostRow),
    ...workRows.map(mapFeaturedWorkRow),
  ].sort((a, b) => a.featuredAt.getTime() - b.featuredAt.getTime());
}

/* 列表:已发布 letter 的轻量期次(新期在前;期号已算好)。 */
export async function listLetterIssueMetas(
  uiLocale: MonthlyLocale,
): Promise<LetterIssueMeta[]> {
  const articles = await listArticles("letter", uiLocale);
  return letterIssueMetas(articles);
}

/* 总览页:最新一期整期组装 + 全部轻量期次;无已发布 letter → latest=null(空态)。 */
export async function getBlogOverview(
  uiLocale: MonthlyLocale,
  opts: { now?: Date } = {},
): Promise<{ latest: AssembledIssue | null; metas: LetterIssueMeta[] }> {
  const [articles, stats] = await Promise.all([
    listArticles("letter", uiLocale),
    getMonthlyStatsSnapshot(),
  ]);
  const metas = letterIssueMetas(articles);
  const first = articles[0];
  if (!first) return { latest: null, metas };
  const payload = letterPayloadFromDb(first.payloadRaw);
  const featured = await getMonthFeatured(monthOf(first.publishedAt));
  const latest = assembleIssue({
    article: first,
    issueNumber: metas[0].issue,
    stats,
    featured,
    payload,
    locale: uiLocale,
    now: opts.now ?? new Date(),
  });
  return { latest, metas };
}

/* 详情/总览共用:按 slug 组装整期。返回 null = 无此已发布期(页面 notFound/空态)。
   issueNumber 由调用方给(列表位次);stats 可共享传入(总览页避免重复聚合)。 */
export async function getAssembledIssue(
  slug: string,
  uiLocale: MonthlyLocale,
  opts: { stats?: MonthlyStatsSnapshot; now?: Date } = {},
): Promise<{ issue: AssembledIssue; metas: LetterIssueMeta[] } | null> {
  const [article, articles, stats] = await Promise.all([
    getArticleBySlug("letter", slug, uiLocale),
    listArticles("letter", uiLocale),
    opts.stats ?? getMonthlyStatsSnapshot(),
  ]);
  if (!article) return null;
  const metas = letterIssueMetas(articles);
  const meta = metas.find((m) => m.slug === article.slug);
  if (!meta) return null;
  const payload = letterPayloadFromDb(article.payloadRaw);
  const featured = await getMonthFeatured(monthOf(article.publishedAt));
  const issue = assembleIssue({
    article: {
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      bodyMd: article.bodyMd,
      authorHandle: article.authorHandle,
      publishedAt: article.publishedAt,
    },
    issueNumber: meta.issue,
    stats,
    featured,
    payload,
    locale: uiLocale,
    now: opts.now ?? new Date(),
  });
  return { issue, metas };
}
