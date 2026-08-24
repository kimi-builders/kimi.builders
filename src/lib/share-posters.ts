/* Share-poster snapshot assembly: three 1080x1440 PNG posters (post /
   work / profile). Pure functions (clipping / truncation / gates) are
   separated from DB queries; routes only fetch a snapshot and render —
   the pure functions unit-test directly (tests/share-posters.test.ts).
   Privacy rules:
   - private/deleted posts -> null snapshot, the route 404s (deleted is
     filtered by getPost);
   - private works likewise (canViewWork gates after getWork — posters
     are an anonymous public context);
   - profile stats use the visitor view (getProfileStats self=false;
     private counts never leak);
   - the profile usage row carries numbers only when the author opted in
     (usage_settings.show_on_leaderboard=1), reusing getPublicTokenTotals
     from usage/social.ts (the gate is pinned inside the SQL JOIN); not
     opted in = null = the row never renders (no negative signaling);
   - work token display is claim-based: the number is this work's
     claimed_tokens — declaring is itself a public act, no opt-in gate;
     when the display invariant (per-author sum of claims <= verifiable
     total, internal definition in usage/verifiable.ts) fails = null =
     the hero never renders. */
import type { RowDataPacket } from "mysql2";
import { agentName } from "./agents";
import { categoryLabel } from "./categories";
import { getPool } from "./db";
import { plainExcerpt } from "./format";
import type { Locale } from "./i18n";
import { getPoll, getPost, type PollData, type PostDetail } from "./posts";
import { getPublicTokenTotals, getSocialDailyActivity } from "./usage/social";
import { getVerifiableTokenTotals } from "./usage/verifiable";
import {
  getProfileByHandle,
  getProfileStats,
  profileDisplay,
  type ProfileStats,
  type UserProfile,
} from "./users";
import {
  canViewWork,
  claimBadgeOf,
  getWork,
  getWorkClaimSums,
  type WorkRow,
} from "./works";

/* Poster destinations always use the site's absolute origin (shared by
   the QR and the footer URL row). */
export const POSTER_SITE_ORIGIN = "https://kimi.builders";

export const POSTER_EXCERPT_MAX = 140;
export const POSTER_POLL_OPTIONS_MAX = 4;
export const POSTER_AGENTS_MAX = 5;

/* ---- Pure helpers ---- */

/* Trim whitespace + truncate with an ellipsis (length in UTF-16 code
   units, aligned with plainExcerpt). */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/* Avatar initial circle: two words take both initials, otherwise the
   first two characters (same as the usage poster initials). */
export function posterInitials(name: string, handle: string): string {
  const source = name.trim() || handle.trim() || "KB";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  return [...source].slice(0, 2).join("").toUpperCase();
}

/* Link-post domain row: strips www.; invalid URLs render no row. */
export function linkDomainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host ? host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/* Timestamps land as UTC (db.ts); poster date rows are uniformly
   YYYY-MM-DD. */
export function posterYmd(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/* ---- Post poster ---- */

export interface PosterAuthor {
  handle: string;
  name: string;
  initials: string;
}

export interface PostSharePoll {
  options: { label: string; votes: number }[];
  totalVotes: number;
  /* Options left beyond the cap (0 = everything shown). */
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

/* Poll clipping: at most max options in position order (sorted
   upstream), labels truncated when long; no options -> null (rendered
   as a non-poll post). */
export function pollForPoster(poll: PollData | null, max = POSTER_POLL_OPTIONS_MAX): PostSharePoll | null {
  if (!poll || poll.options.length === 0) return null;
  const options = poll.options
    .slice(0, Math.max(1, max))
    .map((o) => ({ label: clip(o.label, 28), votes: o.voteCount }));
  return { options, totalVotes: poll.total, more: poll.options.length - options.length };
}

/* Private/hidden posts -> null (route 404s). Titles are optional: an
   untitled post's body excerpt takes the headline slot (same fallback
   as detail/feed); when excerpt and headline would be identical (short
   posts) it is not repeated. */
export function buildPostShareSnapshot(
  post: PostDetail,
  poll: PollData | null,
  locale: Locale = "zh",
): PostShareSnapshot | null {
  if (post.visibility !== "public" || post.hiddenAt) return null;
  const hasTitle = post.title.trim().length > 0;
  const title = hasTitle ? clip(post.title, 66) : plainExcerpt(post.bodyMd, 66);
  const rawExcerpt = hasTitle ? plainExcerpt(post.bodyMd, POSTER_EXCERPT_MAX) : "";
  return {
    id: post.id,
    type: post.type,
    categoryLabel: categoryLabel(locale, post.category),
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

export async function getPostShareSnapshot(
  id: number,
  locale: Locale = "zh",
): Promise<PostShareSnapshot | null> {
  const post = await getPost(id);
  if (!post) return null;
  const poll = post.type === "poll" ? await getPoll(id, null) : null;
  return buildPostShareSnapshot(post, poll, locale);
}

/* ---- Work poster ---- */

export interface WorkShareSnapshot {
  id: number;
  name: string;
  tagline: string;
  author: PosterAuthor;
  agents: string[];
  /* Agents left beyond the cap. */
  agentsMore: number;
  voteCount: number;
  commentCount: number;
  publishedAt: string;
  /* Builder-reported tokens (this work's claimed_tokens, non-empty only
     when the invariant holds); null = the hero never renders. */
  claimedTokens: number | null;
  path: string;
  url: string;
}

export function buildWorkShareSnapshot(
  work: WorkRow,
  verifiableTotals: Map<number, number>,
  claimSums: Map<number, number>,
): WorkShareSnapshot {
  /* awesome external entries have no on-site author: the author row
     uses authorLabel, handle stays empty. */
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
  /* Private works -> null (route 404s, same as private posts); posters
     are an anonymous public context, viewer is always null. */
  if (!work || !canViewWork(work, null)) return null;
  const [totals, claimSums] = await Promise.all([
    getVerifiableTokenTotals([work.userId]),
    getWorkClaimSums([work.userId]),
  ]);
  return buildWorkShareSnapshot(work, totals, claimSums);
}

/* ---- Profile poster ---- */

export interface ProfileShareSnapshot {
  handle: string;
  name: string;
  initials: string;
  /* The current poster draws no remote avatar, but the snapshot still
     carries the visitor view so a future template cannot leak. */
  avatarUrl: string;
  bio: string;
  joinedAt: string;
  stats: { posts: number; comments: number; likes: number; works: number };
  /* Lifetime tokens + active days + a daily activity map (non-empty
     only when usage is opted in); null = never rendered. */
  usage: {
    totalTokens: number;
    activeDays: number;
    /* Last 371 days, day (YYYY-MM-DD, UTC) -> tokens; idle days are
       absent. */
    activity: Record<string, number>;
  } | null;
  path: string;
  url: string;
}

/* Work counts: a member's own works (source='site'), same as the
   profile "works" tab. self=false (visitors/posters — public contexts)
   counts public works only; private counts never leak. */
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
  const display = profileDisplay(profile, false);
  return {
    handle: profile.handle,
    name: clip(display.displayName, 28),
    /* Generated from the public handle when the display name is hidden —
       name initials must not form a bypass. */
    initials: posterInitials(profile.showName ? display.displayName : "", profile.handle),
    avatarUrl: display.avatarUrl,
    bio: clip(display.bio, 100),
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

/* Profile-privacy changes must surface on the very next request; the
   5-minute public browser/CDN cache cannot be reliably purged by a
   Server Action's revalidatePath, so the profile poster opts for
   no-store. */
export const PROFILE_SHARE_CACHE_CONTROL = "private, no-store, max-age=0";

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
  /* Active days: days with token output in the last 371 days (the
     getSocialDailyActivity daily map); fetched only when the opt-in
     total exists — no extra query for private users. tz is fixed at 0
     (UTC) — a poster is a publicly cached snapshot and must not drift
     with the viewer's timezone. */
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

/* ---- Dev preview mocks (?preview=1, no DB) ---- */

export function mockPostShareSnapshot(locale: Locale = "zh"): PostShareSnapshot {
  return {
    id: 128,
    type: "poll",
    categoryLabel: categoryLabel(locale, "showcase"),
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

/* Mock heatmap: deterministic pseudo-random activity for the last 180
   days. */
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
    avatarUrl: "",
    bio: "独立开发者,白天写代码晚上写提示词。正在用 Kimi 构建一人公司全家桶,记录每一次人机协作的实验。",
    joinedAt: "2025-12",
    stats: { posts: 47, comments: 231, likes: 1_280, works: 6 },
    usage: { totalTokens: 10_800_000_000, activeDays: 87, activity: mockActivity() },
    path: "/u/aklman",
    url: `${POSTER_SITE_ORIGIN}/u/aklman`,
  };
}

/* Poster dynamic text (for CJK bold-subset fetching; static labels live
   in poster-kit's POSTER_STATIC_TEXT). */
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
