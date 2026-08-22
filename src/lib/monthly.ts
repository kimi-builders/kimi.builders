/* Monthly letter assembly: /blog issues assemble from real data, never
   hand-written. The early letters are AI-assisted monthlies with three
   layers: 01 editorial review (articles.body_md, a curator-written long
   form; any AI participation must be disclosed), 02 fact sheet (L1,
   verifiable snapshots), 03 editorial decisions (L2, featured + published
   governance rulings). Assembly definitions (published in the footer,
   recomputable):
   - L2 facts <- community totals (members/posts/works/comments) + the
     site-wide token total + the last-30-day cache hit rate and top model
     (window aggregates from usage/community.ts); missing values honestly
     show "—", never invented;
   - L3 decisions <- the article month's (published_at, UTC) featured
     posts/works (featured_reason + deciding editor handle) +
     payload.governance rulings.
   payload (articles.payload, JSON) stores only the editorial decisions
   data cannot provide: governance rulings and AI disclosure; NULL = pure
   automatic assembly. Pure functions (validation/assembly/query building)
   are separated from DB access, aligned with ./articles and ./featured. */
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

/* ---- Display types (render contract; mock blueprint in
   tests/fixtures/monthly-mock.ts) ---- */

/* L2 fact sheet: one verifiable snapshot; value = MISSING ("—") marks
   absent data. */
export interface IssueFact {
  label: string;
  value: string;
}

/* L3 editorial decisions: featured posts/works (system-provided) +
   payload governance rulings. */
export type IssueDecisionKind = "post" | "work" | "governance";

export interface IssueDecision {
  kind: IssueDecisionKind;
  title: string;
  href: string; // post -> /community/<id>; work -> its link; governance ->
                 // rulingUrl
  authorHandle: string; // on-site handle (no @); external works use
                         // author_label; governance is empty
  authorHref: string | null;
  note: string; // featured_reason / ruling note
  editorHandle: string; // deciding editor; empty when missing (display
                         // skips gracefully)
  rulingUrl: string | null; // governance: full ruling (community post)
}

/* AI participation disclosure: which sections had AI and how much; a
   missing key = no AI in that section. Section keys match anchors:
   digest (editorial) / facts / decisions. */
export type AiDisclosure = Partial<
  Record<"digest" | "facts" | "decisions", string>
>;

export interface AssembledIssue {
  slug: string;
  issue: number; // issue number = 1-based position among published letters
                  // by published_at ascending
  month: string; // YYYY-MM(published_at,UTC)
  title: string;
  summary: string;
  /* Editorial review (articles.body_md): the detail page's section 01;
     overview assembly skips it (the list query never selects body_md),
     always empty — share posters don't consume it either. */
  bodyMd: string;
  editorHandle: string;
  publishedAt: Date;
  facts: IssueFact[];
  decisions: IssueDecision[];
  aiDisclosure: AiDisclosure | null;
  assembledAt: Date; // data cutoff (published in the footer)
}

/* Lightweight shape for lists/navigation (three layers not assembled). */
export interface LetterIssueMeta {
  slug: string;
  issue: number;
  month: string;
  title: string;
  summary: string;
  editorHandle: string;
  publishedAt: Date;
  locale: MonthlyLocale; // actual language version (fallback = differs
                          // from UI locale)
  fallback: boolean;
}

/* ---- payload (articles.payload) contract and validation ---- */

export interface LetterGovernanceEntry {
  title: string;
  note: string;
  rulingUrl?: string;
}

export interface LetterPayload {
  aiDisclosure?: AiDisclosure;
  governance?: LetterGovernanceEntry[];
  /* Tag dimension of the explore lenses: <=5 tags, <=24 chars each,
     deduped. */
  tags?: string[];
  /* Cover: on-site path or https image, on the list card's left column;
     default = the automatic chapter brick. */
  cover?: string;
  /* Chapter-brick tone (same palette as work name bricks): applies
     without an uploaded cover/image; allowlist in cover-tones.ts (theme =
     follow the theme, default). */
  coverTone?: string;
}

export type PayloadParseResult =
  | { ok: true; payload: LetterPayload }
  | { ok: false; error: string };

const GOVERNANCE_MAX = 20;
const TAGS_MAX = 5;
const TAG_MAX_LEN = 24;

/* Tag validation (shared by both payloads): <=TAGS_MAX, 1-24 chars each,
   deduped. */
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

/* rulingUrl: on-site relative path (/...) or an http(s) link, <=500
   chars. */
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

/* Strict validation: unknown fields/invalid values yield specific errors
   (inline hints in the edit console); the render path
   (letterPayloadFromDb) tolerates and falls back to an empty payload so
   one bad row never kills the page. */
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

/* Edit-console entry: JSON text -> strict validation; empty string -> ok
   + empty payload (NULL semantics: pure automatic assembly). */
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

/* DB read entry (render path): tolerant — the driver already parsed the
   JSON; invalid content falls back to an empty payload, the issue still
   auto-assembles, one bad payload never kills the page. */
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

/* ---- Month windows (UTC; consistent with published_at/created_at, see
   db.ts) ---- */

export function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* "2026-08" -> ["2026-08-01 00:00:00", "2026-09-01 00:00:00") (half-open);
   invalid -> null. */
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
  tokensTotal: number; // site-wide total (same as the home stats bar)
  cacheHitRate: number | null; // last 30 days; null = no input-side
                                // traffic
  topModel: { name: string; share: number } | null; // last 30 days, share
                                                     // 0-1
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

/* Model distribution aggregation (pure): merge window rows by canonical
   model, top limit by tokens desc, share = fraction. Aligned with
   canonicalModelOf in usage/query.ts. */
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

/* Unified view of featured posts/works (month-window query rows -> this
   shape -> IssueDecision). */
export interface MonthlyFeaturedEntry {
  kind: "post" | "work";
  id: number;
  href: string;
  title: string;
  authorHandle: string; // on-site handle (no @); external works use
                         // author_label
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

/* ---- Issue assembly (pure) ---- */

export interface AssembleIssueInput {
  article: {
    slug: string;
    title: string;
    summary: string;
    /* Editorial review body; the overview (listArticles never selects
       body_md) omits it -> empty string. */
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

/* Published letters -> lightweight issues (number = 1-based by publish
   time ascending). Input is display order (newest first, listArticles
   convention), so number = count - position. */
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

/* ---- Query building (pure) ---- */

/* Work total (public definition: public and unhidden; members/posts/
   comments via posts.getCommunityStats). */
export function communityWorksCountQuery(): { sql: string; args: never[] } {
  return {
    sql: `SELECT COUNT(*) AS n FROM works
          WHERE visibility = 'public' AND hidden_at IS NULL`,
    args: [],
  };
}

/* L2: featured posts inside the article's month (featured time
   in-window, ASC = decision order). */
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

/* L2: featured works inside the article's month (same as posts; u
   nullable = awesome external entry). */
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

/* ---- DB assembly ---- */

function mapFeaturedPostRow(r: RowDataPacket): MonthlyFeaturedEntry {
  const id = Number(r.id);
  return {
    kind: "post",
    id,
    href: `/community/${id}`,
    /* Untitled posts fall back to a body excerpt (same as the feed). */
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

/* L1 snapshot: community stats + work count + token total + last-30-day
   hit rate/top model. */
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

/* L2 data: featured posts + works inside the article's month (merged by
   featured time ASC). */
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

/* List: lightweight issues of published letters (newest first; numbers
   precomputed). */
export async function listLetterIssueMetas(
  uiLocale: MonthlyLocale,
): Promise<LetterIssueMeta[]> {
  const articles = await listArticles("letter", uiLocale);
  return letterIssueMetas(articles);
}

/* Overview page: the latest issue fully assembled + all lightweight
   issues; no published letter -> latest=null (empty state). */
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

/* Detail/overview shared: assemble a full issue by slug. null = no such
   published issue (page notFound/empty state). issueNumber comes from the
   caller (list position); stats may be passed in (the overview avoids
   double aggregation). */
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
