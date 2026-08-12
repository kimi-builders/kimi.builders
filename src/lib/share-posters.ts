/* 分享海报(S5-2)的快照组装层:帖子 / 作品 / 个人主页三种 1080×1440 PNG 海报。
   纯函数(截断 / 截取 / 门禁判断)与 DB 查询分离,路由只取快照再渲染;
   纯函数可直接单测(见 tests/share-posters.test.ts)。
   隐私口径:
   - 私密帖 / 已删帖 → 快照 null,路由 404 不渲染(deleted 由 getPost 滤掉);
   - 私密作品同理(getWork 取出后由 canViewWork 拦截,海报是匿名公共上下文);
   - 主页统计用访客口径(getProfileStats self=false,不泄露私密量);
   - 个人主页用量行仅作者自愿公开(usage_settings.show_on_leaderboard=1)才带数字,
     门禁复用 usage/social.ts 的 getPublicTokenTotals(SQL JOIN 钉死),未公开 = null
     = 海报完全不渲染该行(无负面标记原则);
   - 作品构建投入为声明制(20260822_work_claims):数字 = 本作品 claimed_tokens,
     作者声明即公开授权,不做 opt-in 门禁;展示不变式(作者 Σ声明 ≤ 可验证总量,
     usage/verifiable.ts 内部口径)不满足 = null = 不渲染该 hero。 */
import type { RowDataPacket } from "mysql2";
import { agentName } from "./agents";
import { categoryLabel } from "./categories";
import { getPool } from "./db";
import { plainExcerpt } from "./format";
import { getPoll, getPost, type PollData, type PostDetail } from "./posts";
import { getPublicTokenTotals, getSocialDailyActivity } from "./usage/social";
import { getVerifiableTokenTotals } from "./usage/verifiable";
import { getProfileByHandle, getProfileStats, type ProfileStats, type UserProfile } from "./users";
import {
  canViewWork,
  claimBadgeOf,
  getWork,
  getWorkClaimSums,
  type WorkRow,
} from "./works";

/* 海报落点统一用主站绝对地址(QR 与页脚 URL 行共用)。 */
export const POSTER_SITE_ORIGIN = "https://kimi.builders";

export const POSTER_EXCERPT_MAX = 140;
export const POSTER_POLL_OPTIONS_MAX = 4;
export const POSTER_AGENTS_MAX = 5;

/* ---- 纯函数小件 ---- */

/* 收空白 + 截断加省略号(长度按 UTF-16 code unit,对齐 plainExcerpt 口径)。 */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/* 头像字母圆:两个单词取首字母,否则取前两个字符(同用量海报 initials 口径)。 */
export function posterInitials(name: string, handle: string): string {
  const source = name.trim() || handle.trim() || "KB";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  return [...source].slice(0, 2).join("").toUpperCase();
}

/* 链接帖的域名行:剥 www.;非法 URL 不渲染该行。 */
export function linkDomainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host ? host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/* 时间落库即 UTC(db.ts),海报日期行统一 YYYY-MM-DD。 */
export function posterYmd(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/* ---- 帖子海报 ---- */

export interface PosterAuthor {
  handle: string;
  name: string;
  initials: string;
}

export interface PostSharePoll {
  options: { label: string; votes: number }[];
  totalVotes: number;
  /* 超出截取上限的剩余选项数(0 = 全量显示) */
  more: number;
}

export interface PostShareSnapshot {
  id: number;
  type: string;
  categoryLabel: string;
  title: string;
  excerpt: string;
  linkDomain: string | null;
  poll: PostSharePoll | null;
  author: PosterAuthor;
  score: number;
  commentCount: number;
  publishedAt: string;
  path: string;
  url: string;
}

/* 投票块截取:按 position 顺序(上游已排好)最多取 max 条,标签超长截断;
   无选项 → null(海报按非投票帖渲染)。 */
export function pollForPoster(poll: PollData | null, max = POSTER_POLL_OPTIONS_MAX): PostSharePoll | null {
  if (!poll || poll.options.length === 0) return null;
  const options = poll.options
    .slice(0, Math.max(1, max))
    .map((o) => ({ label: clip(o.label, 28), votes: o.voteCount }));
  return { options, totalVotes: poll.total, more: poll.options.length - options.length };
}

/* 私密帖 / 被屏蔽帖 → null(路由 404)。标题非强制:无标题帖正文摘要坐到主标题位
   (同详情页/feed 的回退);摘要与主标题完全雷同时(短帖)不重复展示。 */
export function buildPostShareSnapshot(
  post: PostDetail,
  poll: PollData | null,
): PostShareSnapshot | null {
  if (post.visibility !== "public" || post.hiddenAt) return null;
  const hasTitle = post.title.trim().length > 0;
  const title = hasTitle ? clip(post.title, 66) : plainExcerpt(post.bodyMd, 66);
  const rawExcerpt = hasTitle ? plainExcerpt(post.bodyMd, POSTER_EXCERPT_MAX) : "";
  return {
    id: post.id,
    type: post.type,
    categoryLabel: categoryLabel("zh", post.category),
    title,
    excerpt: hasTitle && rawExcerpt !== title ? rawExcerpt : "",
    linkDomain: post.type === "link" && post.linkUrl ? linkDomainOf(post.linkUrl) : null,
    poll: post.type === "poll" ? pollForPoster(poll) : null,
    author: {
      handle: post.handle,
      name: post.name || post.handle,
      initials: posterInitials(post.name, post.handle),
    },
    score: post.score,
    commentCount: post.commentCount,
    publishedAt: posterYmd(post.createdAt),
    path: `/community/${post.id}`,
    url: `${POSTER_SITE_ORIGIN}/community/${post.id}`,
  };
}

export async function getPostShareSnapshot(id: number): Promise<PostShareSnapshot | null> {
  const post = await getPost(id);
  if (!post) return null;
  const poll = post.type === "poll" ? await getPoll(id, null) : null;
  return buildPostShareSnapshot(post, poll);
}

/* ---- 作品海报 ---- */

export interface WorkShareSnapshot {
  id: number;
  name: string;
  tagline: string;
  author: PosterAuthor;
  agents: string[];
  /* 超出截取上限的剩余 agent 数 */
  agentsMore: number;
  voteCount: number;
  commentCount: number;
  publishedAt: string;
  /* 声明构建投入(声明制:本作品 claimed_tokens,不变式满足才非空);null = 不渲染该 hero */
  claimedTokens: number | null;
  path: string;
  url: string;
}

export function buildWorkShareSnapshot(
  work: WorkRow,
  verifiableTotals: Map<number, number>,
  claimSums: Map<number, number>,
): WorkShareSnapshot {
  /* awesome 外部条目无站内作者:作者行落 authorLabel,handle 置空 */
  const authorName = work.handle ?? work.authorLabel;
  return {
    id: work.id,
    name: clip(work.name, 44),
    tagline: plainExcerpt(work.tagline, 120),
    author: {
      handle: work.handle ?? "",
      name: clip(authorName, 32),
      initials: posterInitials(authorName, work.handle ?? ""),
    },
    agents: work.agents.slice(0, POSTER_AGENTS_MAX).map(agentName),
    agentsMore: Math.max(0, work.agents.length - POSTER_AGENTS_MAX),
    voteCount: work.voteCount,
    commentCount: work.commentCount,
    publishedAt: posterYmd(work.createdAt),
    claimedTokens: claimBadgeOf(work, verifiableTotals, claimSums),
    path: `/works/${work.id}`,
    url: `${POSTER_SITE_ORIGIN}/works/${work.id}`,
  };
}

export async function getWorkShareSnapshot(id: number): Promise<WorkShareSnapshot | null> {
  const work = await getWork(id);
  /* 私密作品 → null(路由 404,同私密帖口径);海报是匿名公共上下文,viewer 恒 null */
  if (!work || !canViewWork(work, null)) return null;
  const [totals, claimSums] = await Promise.all([
    getVerifiableTokenTotals([work.userId]),
    getWorkClaimSums([work.userId]),
  ]);
  return buildWorkShareSnapshot(work, totals, claimSums);
}

/* ---- 个人主页海报 ---- */

export interface ProfileShareSnapshot {
  handle: string;
  name: string;
  initials: string;
  bio: string;
  joinedAt: string;
  stats: { posts: number; comments: number; likes: number; works: number };
  /* 累计 tokens + 活跃天数 + 日粒度活动图(仅 opt-in 公开用量时非空);null = 不渲染 */
  usage: {
    totalTokens: number;
    activeDays: number;
    /* 近 371 天 day(YYYY-MM-DD, UTC)→ tokens;无产出的日子缺席 */
    activity: Record<string, number>;
  } | null;
  path: string;
  url: string;
}

/* 作品数统计:成员自有作品(source='site'),与主页「作品」页签同口径。
   self=false(访客/海报等公共上下文)只数公开作品,不泄露私密度量。 */
export function userWorksCountQuery(
  userId: number,
  self = false,
): { sql: string; args: number[] } {
  return {
    sql: `SELECT COUNT(*) AS n FROM works WHERE source = 'site' AND user_id = ?${self ? "" : " AND visibility = 'public' AND hidden_at IS NULL"}`,
    args: [userId],
  };
}

export function buildProfileShareSnapshot(input: {
  profile: UserProfile;
  stats: ProfileStats;
  works: number;
  usage: { totalTokens: number; activeDays: number; activity?: Record<string, number> } | null;
}): ProfileShareSnapshot {
  const { profile, stats } = input;
  return {
    handle: profile.handle,
    name: clip(profile.name || profile.handle, 28),
    initials: posterInitials(profile.name, profile.handle),
    bio: clip(profile.bio, 100),
    joinedAt: posterYmd(profile.createdAt).slice(0, 7),
    stats: {
      posts: stats.posts,
      comments: stats.comments,
      likes: stats.likes,
      works: Math.max(0, Math.trunc(input.works)),
    },
    usage:
      input.usage && input.usage.totalTokens > 0
        ? {
            totalTokens: input.usage.totalTokens,
            activeDays: Math.max(0, input.usage.activeDays),
            activity: input.usage.activity ?? {},
          }
        : null,
    path: `/u/${profile.handle}`,
    url: `${POSTER_SITE_ORIGIN}/u/${profile.handle}`,
  };
}

export async function getProfileShareSnapshot(handle: string): Promise<ProfileShareSnapshot | null> {
  const profile = await getProfileByHandle(handle);
  if (!profile) return null;
  const worksQ = userWorksCountQuery(profile.id);
  const [stats, worksRows, totals] = await Promise.all([
    getProfileStats(profile.id, false),
    getPool().query<RowDataPacket[]>(worksQ.sql, worksQ.args).then(([r]) => r),
    getPublicTokenTotals([profile.id]),
  ]);
  const totalTokens = totals.get(profile.id) ?? 0;
  /* 活跃天数:近 371 天有 token 产出的天数(getSocialDailyActivity 日粒度映射);
     只在 opt-in 有总量时才取,未公开不做多余查询。tz 固定 0(UTC)——海报是
     公共缓存快照,不随浏览者时区漂移。 */
  const dailyActivity = totalTokens > 0 ? await getSocialDailyActivity(profile.id, 0) : {};
  const usage =
    totalTokens > 0
      ? {
          totalTokens,
          activeDays: Object.values(dailyActivity).filter((v) => v > 0).length,
          activity: dailyActivity,
        }
      : null;
  return buildProfileShareSnapshot({
    profile,
    stats,
    works: Number(worksRows[0]?.n ?? 0),
    usage,
  });
}

/* ---- dev 预览 mock(?preview=1,不碰 DB)---- */

export function mockPostShareSnapshot(): PostShareSnapshot {
  return {
    id: 128,
    type: "poll",
    categoryLabel: "经验分享",
    title: "用 Kimi 一周搓出全栈记账应用,分享我的提示词工程心得",
    excerpt:
      "从零到上线只用了七天:需求拆解、数据建模、接口联调全部交给 Kimi 完成。这篇文章记录完整的协作流程,以及踩过的三个坑和对应的提示词模板,适合想上手 AI 协作开发的同学参考。",
    linkDomain: null,
    poll: {
      options: [
        { label: "先写详细需求文档再让 AI 实现", votes: 87 },
        { label: "边聊边改,小步快跑迭代", votes: 156 },
        { label: "直接贴报错让它自己修", votes: 43 },
        { label: "看情况,两种混着用", votes: 62 },
      ],
      totalVotes: 348,
      more: 0,
    },
    author: { handle: "aklman", name: "Aklman Zhapar", initials: "AZ" },
    score: 214,
    commentCount: 86,
    publishedAt: "2026-08-06",
    path: "/community/128",
    url: `${POSTER_SITE_ORIGIN}/community/128`,
  };
}

export function mockWorkShareSnapshot(): WorkShareSnapshot {
  return {
    id: 42,
    name: "月面账本 MoonLedger",
    tagline: "给独立开发者的一人公司记账工具:多币种、自动归类、报税季一键导出,全部由 Kimi 协作构建。",
    author: { handle: "aklman", name: "Aklman Zhapar", initials: "AZ" },
    agents: ["Kimi", "Claude Code", "Cursor"],
    agentsMore: 0,
    voteCount: 96,
    commentCount: 23,
    publishedAt: "2026-07-28",
    claimedTokens: 3_800_000_000,
    path: "/works/42",
    url: `${POSTER_SITE_ORIGIN}/works/42`,
  };
}

/* mock 热力图:近 180 天的确定性伪随机活动 */
function mockActivity(): Record<string, number> {
  const activity: Record<string, number> = {};
  const today = new Date();
  for (let back = 0; back < 180; back += 1) {
    const wave = Math.sin(back * 0.9) * Math.cos(back * 0.23);
    if (wave < 0.15) continue;
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
    activity[day.toISOString().slice(0, 10)] = Math.round(20_000_000 + wave * 90_000_000);
  }
  return activity;
}

export function mockProfileShareSnapshot(): ProfileShareSnapshot {  return {
    handle: "aklman",
    name: "Aklman Zhapar",
    initials: "AZ",
    bio: "独立开发者,白天写代码晚上写提示词。正在用 Kimi 构建一人公司全家桶,记录每一次人机协作的实验。",
    joinedAt: "2025-12",
    stats: { posts: 47, comments: 231, likes: 1_280, works: 6 },
    usage: { totalTokens: 10_800_000_000, activeDays: 87, activity: mockActivity() },
    path: "/u/aklman",
    url: `${POSTER_SITE_ORIGIN}/u/aklman`,
  };
}

/* 海报动态文本(供 CJK 粗体子集抓取;静态标签在 poster-kit 的 POSTER_STATIC_TEXT)。 */
export function postShareText(s: PostShareSnapshot): string {
  return [
    s.title,
    s.excerpt,
    s.categoryLabel,
    s.author.name,
    s.author.initials,
    s.linkDomain ?? "",
    ...(s.poll?.options.map((o) => o.label) ?? []),
  ].join(" ");
}

export function workShareText(s: WorkShareSnapshot): string {
  return [s.name, s.tagline, s.author.name, s.author.initials, ...s.agents].join(" ");
}

export function profileShareText(s: ProfileShareSnapshot): string {
  return [s.name, s.initials, s.bio].join(" ");
}
