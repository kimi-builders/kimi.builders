/* Works: real projects members built with Kimi (the works table).
   source=site -> member works on the /works wall; source=awesome ->
   recommended external projects (author_label is the external author),
   listed on /awesome only. /awesome shows both sources. agents holds the
   Agent brand keys involved in building (registry in src/lib/agents.ts).
   Author self-service create/edit/delete; ownership is pinned in SQL
   WHERE clauses (same as posts). getWorkDetail / getAuthorClaimContext go
   through React cache so the detail page and the rail metadata card share
   one query per request (degrades to a plain call without a dispatcher). */
import { cache } from "react";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { AGENTS } from "./agents";
import { getPool } from "./db";
import { canModerate } from "./featured";
import { getVerifiableTokenTotals, type ClaimProjectTotal } from "./usage/verifiable";
import { WORK_KINDS } from "./work-kinds";

type Queryable = Pool | PoolConnection;

export interface WorkRow {
  id: number;
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  /* Known trade-off: screenshot_url allows arbitrary http(s) external links
     so authors can host their own screenshots; this accepts tracking-pixel
     risk — tighten with a restricted image proxy if ever needed. */
  screenshotUrl: string;
  tags: string[];
  agents: string[];
  source: string;
  /* public/private; private means author-only (same semantics as
     posts.visibility). */
  visibility: string;
  /* Moderation hiding: non-null = hidden by a moderator; filtered on
     public surfaces, only the author/admin view receives it. */
  hiddenAt: Date | null;
  hiddenReason: string | null;
  createdAt: Date;
  /* On-site author (user_id null = awesome external entry, use
     authorLabel). */
  userId: number | null;
  handle: string | null;
  avatarUrl: string | null;
  authorLabel: string;
  /* Weekly featured v0: non-null featured_at = featured (reason/editor
     resolved in featured.ts). */
  featuredAt: Date | null;
  featuredReason: string | null;
  /* Redundant counters, maintained by the work_votes / work_comments
     write paths. */
  voteCount: number;
  commentCount: number;
  /* Builder-reported tokens, capped by synced aggregate usage; null =
     no claim. This is not precise per-project usage. */
  claimedTokens: number | null;
  /* Work metadata: status/models/platform/long description/awesome
     scope. */
  status: string;
  models: string[];
  /* Work kind
     (app/miniapp/website/extension/cli/skill/prompt/slides/demo/content/other). */
  kind: string;
  descriptionMd: string;
  /* Stored Awesome scope: base/eco/part for external entries. Member
     work opted into Awesome derives the participation scope. */
  scope: string;
  /* Member works checked "also list on Awesome"; always-on for awesome
     entries, meaningless there. */
  alsoAwesome: boolean;
  /* Logo storage key (empty = none) + image key array (<=9, first =
     cover). DB stores keys only; public URLs are assembled by storage.ts
     mediaUrl at render time. */
  logoKey: string;
  imageKeys: string[];
  /* Standalone list cover (image/ prefixed key; empty = name brick on a
     color card); the first gallery image is no longer reused as the
     cover. */
  coverKey: string;
  /* Name-brick tone (theme = follow the theme; others are fixed colors
     from the cover-tones registry) + cover fit (cover = crop-fill /
     contain = pad-to-fit). */
  coverTone: string;
  coverFit: string;
  /* Allow AI in this work's comments (@kimi summons; default on). */
  aiReply: boolean;
  /* Graduation attribution: the learn-series slug this work came from
     (written at publish, never edited); null = not path-sourced. */
  sourcePath: string | null;
}

/* Member work explicitly listed on Awesome qualifies through Kimi-agent
   participation; external recommendations retain their stored scope.
   Legacy external rows without a scope also fall back to participation:
   their required agent list is the surviving evidence for inclusion. */
export function awesomeScopeOf(
  work: Pick<WorkRow, "source" | "scope" | "alsoAwesome">,
): "base" | "eco" | "part" | null {
  if (work.scope === "base" || work.scope === "eco" || work.scope === "part") {
    return work.scope;
  }
  if (work.source === "awesome") return "part";
  return work.alsoAwesome ? "part" : null;
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
    alsoAwesome: !!r.also_awesome,
    logoKey: r.logo_key ?? "",
    imageKeys: parseStrArray(r.image_keys),
    coverKey: r.cover_key ?? "",
    coverTone: r.cover_tone ?? "theme",
    coverFit: r.cover_fit === "contain" ? "contain" : "cover",
    aiReply: !!r.ai_reply,
    sourcePath: r.source_path ?? null,
  };
}

const WORK_COLUMNS = `w.id, w.user_id, w.name, w.tagline, w.url, w.repo_url,
       w.screenshot_url, w.tags, w.agents, w.source, w.visibility, w.hidden_at, w.hidden_reason,
       w.author_label, w.created_at,
       w.featured_at, w.featured_reason, w.vote_count, w.comment_count, w.claimed_tokens,
       w.status, w.models, w.kind, w.description_md, w.scope, w.also_awesome, w.logo_key, w.image_keys,
       w.cover_key, w.cover_tone, w.cover_fit, w.ai_reply, w.source_path`;

/* Visibility predicates: private = visible to the author only. Public
   contexts (rail/featured/posters/stats) always use PUBLIC_ONLY; lists and
   detail views pass viewerId to admit the author. Editor-curated entries
   with NULL user_id are always public (they bypass the form; the column
   default is public). */
const VISIBILITY_PUBLIC = "w.visibility = 'public'";
/* Moderation-hidden predicate: always filtered in public contexts; the
   author's own view admits it separately. */
const HIDDEN_PUBLIC = "w.hidden_at IS NULL";

/* Awesome listing predicate: recommended entries (source=awesome) plus
   member works whose author checked "also list" (also_awesome=1). Shared
   by list queries and rail stats so both counts agree. */
const AWESOME_LISTED = "(w.source = 'awesome' OR w.also_awesome = 1)";

/* Per-item visibility (shared by detail page/poster/interaction actions):
   hidden -> author or admin/mod only (moderation review needs it);
   otherwise public or owner. */
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

/* Detail page: one extra join for the featuring editor (featured_by ->
   handle, badge tooltip attribution). */
const SELECT_WORK_DETAIL = `SELECT ${WORK_COLUMNS},
       u.handle, u.avatar_url, e.handle AS editor_handle
     FROM works w LEFT JOIN users u ON u.id = w.user_id
     LEFT JOIN users e ON e.id = w.featured_by`;

/* List pagination: keyset cursors — new = bare id (auto-increment tracks
   created_at monotonically); hot = "votes|id" composite (vote_count DESC
   + id DESC keyset; UNSIGNED columns have no negative trap). Each page
   fetches one extra row to detect the next page. Invalid cursors fall
   back to page one (never a silent 500). */
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
  source: "site" | "awesome";
  sort?: WorksSort;
  agents?: string[];
  kinds?: string[];
  scope?: string;
  after?: string;
  /* Logged-in viewer: private entries are author-only (same as the posts
     feed); absent = anonymous, public only. */
  viewerId?: number;
}): { sql: string; args: (string | number)[] } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.viewerId) {
    where.push(`(${VISIBILITY_PUBLIC} OR w.user_id = ?)`);
    args.push(opts.viewerId);
    /* Moderation-hidden: filtered on the public side; the author still
       sees their own card (labeled "hidden by moderators"). */
    where.push(`(${HIDDEN_PUBLIC} OR w.user_id = ?)`);
    args.push(opts.viewerId);
  } else {
    where.push(VISIBILITY_PUBLIC);
    where.push(HIDDEN_PUBLIC);
  }
  if (opts.source === "site") where.push("w.source = 'site'");
  /* Awesome listing: see AWESOME_LISTED — ordinary works no longer
     appear on /awesome automatically. */
  if (opts.source === "awesome") where.push(AWESOME_LISTED);
  /* Agent multi-select: any hit matches (JSON array members, OR chain).
     The cap equals the registry size: placeholders and bound args must be
     built from the same array — generating them from different lengths
     once 500'd whole pages on crafted URLs, and the registry-size cap
     keeps "select all" unclipped and self-maintaining as the registry
     grows. */
  if (opts.agents && opts.agents.length > 0) {
    const agents = [...new Set(opts.agents)].slice(0, AGENTS.length);
    where.push(`(${agents.map(() => "JSON_CONTAINS(w.agents, JSON_QUOTE(?))").join(" OR ")})`);
    args.push(...agents);
  }
  /* Kind multi-select: IN list (same-source convergence, same reason). */
  if (opts.kinds && opts.kinds.length > 0) {
    const kinds = [...new Set(opts.kinds)].slice(0, WORK_KINDS.length);
    where.push(`w.kind IN (${kinds.map(() => "?").join(",")})`);
    args.push(...kinds);
  }
  /* Awesome scope filter (base/eco/part). */
  if (opts.scope) {
    where.push(
      opts.scope === "part"
        ? "(w.scope = ? OR (w.source = 'site' AND w.also_awesome = 1) OR (w.source = 'awesome' AND (w.scope IS NULL OR w.scope NOT IN ('base','eco','part'))))"
        : "w.scope = ?",
    );
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

/* /works wall: member works only; agent/kind multi-select filters +
   sort. viewerId = logged-in viewer: their private works appear (labeled
   "private"); others' private works never do. */
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

/* /awesome: recommended entries + opted-in member works (no longer a
   full mix); agent/kind/scope filters + sort. Same visibility rules. */
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
      source: "awesome",
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

/* Profile "works" tab: a member's own works (source=site). self=true
   includes private and hidden entries (labeled); visitors see public and
   unhidden only (same as getUserPosts). */
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

/* ---- Graduation attribution ---- A work can carry its source
   learn-series slug at publish time (/works/new?path=slug); the series
   page's achievement area shows real graduated works, powering north-star
   #5 "works graduated per series". */

/* Series achievement area: public graduated works for a series (public
   context: public, unhidden, site entries only — private/hidden works
   never leak through the series page, same as the rail), newest first. */
export function pathGraduatesQuery(
  slug: string,
  limit = 6,
): { sql: string; args: string[] } {
  const n = Math.max(1, Math.min(24, Math.floor(limit)));
  return {
    sql: `${SELECT_WORKS} WHERE w.source = 'site' AND w.source_path = ? AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC} ORDER BY w.id DESC LIMIT ${n}`,
    args: [slug],
  };
}

export async function getPathGraduates(
  slug: string,
  limit = 6,
): Promise<WorkRow[]> {
  const q = pathGraduatesQuery(slug, limit);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map(mapWork);
}

/* North-star #5: graduated-work counts per series (public context, same
   rules; feeds the monthly letter and analytics). */
export function pathGraduationCountsQuery(): { sql: string; args: string[] } {
  return {
    sql: `SELECT w.source_path, COUNT(*) AS n FROM works w
     WHERE w.source = 'site' AND w.source_path IS NOT NULL AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}
     GROUP BY w.source_path`,
    args: [],
  };
}

export async function pathGraduationCounts(
  db: Queryable = getPool(),
): Promise<Map<string, number>> {
  const q = pathGraduationCountsQuery();
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  const map = new Map<string, number>();
  for (const r of rows) map.set(String(r.source_path), Number(r.n) || 0);
  return map;
}

/* ---- Work usage claims ---- Badge semantics (replacing the old
   "author total" badge): an author declares a build-effort token count
   per work (claimed_tokens); across one author's undeleted works, the sum
   of claims must stay within their verifiable total (an all-time SUM over
   usage_buckets with the same definition as usage/social, but via the
   internal query in usage/verifiable.ts without the show_on_leaderboard
   gate — declaring is itself a public act, and the raw total is never
   displayed). Display fallback: if the total shrinks (deletion/retention)
   below the sum of claims, none of that author's badges render (no
   negative signaling) and the author sees a redistribution hint in
   lists/edit. Physically deleting a work releases its claim
   automatically. */

/* Compact-number parsing: "612M" "1.5M" "2k" "1.2B" "10,000" ->
   integer tokens. Empty = no claim (none); non-empty but unparseable /
   non-positive / beyond safe integers = invalid. */
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

/* Write-time validation (pure): a claim passes only if <= remaining
   allowance (equal passes, one over rejects); null (retracting) always
   passes. remaining = verifiable total - claims on other works. */
export type ClaimCheck = { ok: true } | { ok: false; remaining: number };

export function checkClaimAllowance(
  claim: number | null,
  remaining: number,
): ClaimCheck {
  if (claim === null) return { ok: true };
  return claim <= remaining ? { ok: true } : { ok: false, remaining };
}

/* Display invariant (pure): this work's badge value; null = render
   nothing (no negative signaling). Hidden when: awesome external entry /
   no on-site author / unclaimed / claim <= 0 / author has no verifiable
   data (total <= 0) / sum of claims > verifiable total (a shrunk total
   pauses all badges). */
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

/* Author-view hint (pure): whether the author's total claims exceed their
   verifiable total (badges paused, redistribution needed). */
export function claimsPaused(total: number, claimSum: number): boolean {
  return claimSum > 0 && claimSum > total;
}

/* Suggestion prefill matching (pure): case-insensitive exact match of
   work name to project label first, then mutual substring; otherwise
   null. projects arrive sorted by tokens desc upstream. */
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

/* A set of authors -> the sum of claimed_tokens across their works (no
   soft-delete filter). One batched IN query, paired with the badge-total
   query (the two sides of the display invariant). */
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
  /* Author's verifiable total (internal definition, never rendered
     publicly). */
  total: number;
  /* Sum of claims on other works (excluding this one while editing);
     deleting a work falls back naturally = releases its allowance. */
  claimed: number;
  /* Remaining claimable = max(0, total - claimed). */
  remaining: number;
}

/* Allowance definition for writes/forms: total (internal verification) +
   sum of claims (optionally excluding this work). */
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
  authorLabel: string; // non-empty -> source=awesome (recommended
                        // external project)
  /* public/private; the action layer pins the enum (anything but
     'private' is public). */
  visibility: "public" | "private";
  /* Build-effort claim; null = unclaimed. Allowance is validated in the
     action layer (checkClaimAllowance). */
  claimedTokens: number | null;
  /* Work metadata; allowlisted in the action layer. */
  status: string;
  models: string[];
  kind: string;
  descriptionMd: string;
  /* Awesome scope (base/eco/part); wall entries are always null. */
  scope: string | null;
  /* "Also list on Awesome" for site works; awesome entries are always
     listed — the server forces 0 for them. */
  alsoAwesome?: boolean;
  /* Media; shape + prefix validated in the action layer
     (isWorkLogoKey/areWorkImageKeys). */
  logoKey: string;
  imageKeys: string[];
  /* Standalone list cover (image/ prefixed; empty = color card).
     Shape-validated in the action layer. Awesome entries have no media;
     the server forces empty. */
  coverKey: string;
  /* Allowlisted in the action layer (isCoverTone / cover|contain). Fit
     is meaningless for awesome entries; the server forces the default. */
  coverTone: string;
  coverFit: string;
  /* Allow AI in comments (summon support): the checkbox submits "on",
     absent = off. */
  aiReply: boolean;
  /* Graduation source slug: validated against registered series in the
     action layer (normalizePathSlug, invalid -> null); written by
     createWork only — attribution is fixed at publish, updateWork never
     touches it. */
  sourcePath: string | null;
}

/* ---- Work media key validation ---- Implemented in
   src/lib/work-media.ts (pure, client-importable); re-exported here so
   actions/tests keep the existing import-from-works habit. */
export {
  areWorkImageKeys,
  isWorkLogoKey,
  isWorkMediaKey,
  parseWorkImageKeysInput,
  WORK_IMAGE_MAX,
} from "./work-media";
import { WORK_IMAGE_MAX } from "./work-media";

/* INSERT query building (pure, unit-testable): source_path is written at
   creation only (graduation attribution; awesome entries have no
   source-path semantics, forced null). Edits go through updateWork, which
   never touches attribution. */
export function workInsertQuery(
  userId: number,
  f: WorkFields,
): { sql: string; args: (string | number | null)[] } {
  const source = f.authorLabel ? "awesome" : "site";
  return {
    sql: `INSERT INTO works (user_id, name, tagline, url, repo_url, screenshot_url, tags, agents, source, visibility, author_label, claimed_tokens, status, models, kind, description_md, scope, also_awesome, logo_key, image_keys, cover_key, cover_tone, cover_fit, ai_reply, source_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
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
      /* Awesome entries are forced claimless (claims are the wall's
         author-declared semantics). */
      source === "awesome" ? null : f.claimedTokens,
      f.status,
      JSON.stringify(f.models.slice(0, 10)),
      f.kind,
      f.descriptionMd || null,
      source === "awesome" ? f.scope : null,
      /* Also-on-Awesome: meaningful for site works only; awesome entries
         are always listed. */
      source === "site" && f.alsoAwesome ? 1 : 0,
      /* Media follows claims: wall entries only, awesome forced empty. */
      source === "awesome" ? "" : f.logoKey.slice(0, 255),
      source === "awesome" || f.imageKeys.length === 0
        ? null
        : JSON.stringify(f.imageKeys.slice(0, WORK_IMAGE_MAX)),
      /* Standalone cover follows media: awesome forced empty; tone is
         selectable for awesome too (the renderer picks by kind family
         when unset); fit is wall-only. */
      source === "awesome" ? "" : f.coverKey.slice(0, 255),
      f.coverTone.slice(0, 16),
      source === "awesome" ? "cover" : f.coverFit === "contain" ? "contain" : "cover",
      f.aiReply ? 1 : 0,
      source === "awesome" ? null : f.sourcePath ? f.sourcePath.slice(0, 64) : null,
    ],
  };
}

export async function createWork(
  userId: number,
  f: WorkFields,
): Promise<number> {
  const q = workInsertQuery(userId, f);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
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
       status = ?, models = ?, kind = ?, description_md = ?, scope = ?, also_awesome = ?,
       logo_key = ?, image_keys = ?, cover_key = ?, cover_tone = ?, cover_fit = ?, ai_reply = ?
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
      /* Also-on-Awesome: meaningful for site works only; awesome entries
         are always listed. */
      source === "site" && f.alsoAwesome ? 1 : 0,
      source === "awesome" ? "" : f.logoKey.slice(0, 255),
      source === "awesome" || f.imageKeys.length === 0
        ? null
        : JSON.stringify(f.imageKeys.slice(0, WORK_IMAGE_MAX)),
      source === "awesome" ? "" : f.coverKey.slice(0, 255),
      f.coverTone.slice(0, 16),
      source === "awesome" ? "cover" : f.coverFit === "contain" ? "contain" : "cover",
      f.aiReply ? 1 : 0,
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


/* ---- Work detail + interactions ---- Votes: up only (no down),
   clicking again cancels; the composite PK (work_id, user_id) is
   naturally idempotent. Comments: single-level (no threading),
   soft-deleted; deletable by the comment author or the work author,
   permission pinned in SQL WHERE. Redundant vote_count / comment_count
   follow the write paths, with GREATEST flooring on the minus side
   (concurrency never breaks through 0). AI comments (summons): is_ai=1 +
   user_id NULL, written by ai_reply_jobs consumers, never through
   createWorkComment; filtered query-side when the viewer disables
   show_ai_replies. */

export interface WorkDetail extends WorkRow {
  /* Featuring editor's (featured_by) handle; unfeatured or deleted
     account -> null. */
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

/* Claim-badge context (author verifiable total + sum of claims): shared
   by the detail page and the rail metadata card; React cache dedupes per
   request (getVerifiableTokenTotals/getWorkClaimSums take arrays and
   can't dedupe directly, so this funnels to scalar-userId entry points). */
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

/* Rail "related works": same author or shared agent (either overlap),
   same author first, then newest. The rail is a public context, public
   rows only — someone else's private work must never leak through the
   rail (same as relatedPostsQuery). With neither an on-site author nor
   agents, no condition can form -> null and the caller skips the query. */
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
    /* Same-author rows first; the ? in the ORDER BY follows the WHERE
       (positional args bind in order). */
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

/* /awesome rail source stats: on-site member works vs recommended
   external entries (public context, public rows only). */
/* /works rail: hot on-site works by supports (featuring plays no part in
   ordering — the badge is editorial will). */
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

/* ---- List rail stats ---- */

/* /works rail: listed works / authors / declared effort sum / new this
   week (all source='site'; public context, public rows only — private
   works are not counted either, same as the posts community stats). */
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

/* Active agent distribution (by works involved; JSON members unfold in
   JS — no JSON_TABLE needed at this scale). Public context, public rows
   only. */
export async function getWorksAgentStats(
  source: "site" | "awesome",
  limit = 6,
): Promise<{ agent: string; count: number }[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    source === "site"
      ? `SELECT w.agents FROM works w WHERE w.source = 'site' AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`
      : `SELECT w.agents FROM works w WHERE ${AWESOME_LISTED} AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`,
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

/* /awesome rail: listed projects / involved agents / new this week /
   recommending members (public context, public rows only). */
export async function getAwesomeStats(): Promise<{
  items: number;
  agents: number;
  weeklyNew: number;
  recommenders: number;
}> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT w.agents, w.user_id, w.created_at FROM works w WHERE ${AWESOME_LISTED} AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}`,
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

/* /awesome scope counts (base/eco/part; public context, public rows
   only). Opted-in member work contributes to the participation scope. */
export async function getAwesomeScopeStats(): Promise<{
  base: number;
  eco: number;
  part: number;
}> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT CASE
       WHEN w.source = 'site' AND w.also_awesome = 1 THEN 'part'
       WHEN w.source = 'awesome' AND (w.scope IS NULL OR w.scope NOT IN ('base','eco','part')) THEN 'part'
       ELSE w.scope
     END AS effective_scope, COUNT(*) AS n
     FROM works w
     WHERE ${AWESOME_LISTED} AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC}
     GROUP BY effective_scope`,
  );
  const out = { base: 0, eco: 0, part: 0 };
  for (const r of rows) {
    if (
      r.effective_scope === "base" ||
      r.effective_scope === "eco" ||
      r.effective_scope === "part"
    ) {
      out[r.effective_scope as "base" | "eco" | "part"] = Number(r.n);
    }
  }
  return out;
}

/* Kind distribution (by work count; card chips / filter dropdown / rail
   share the preset table in work-kinds.ts). Public context, public rows
   only. */
export async function getWorksKindStats(
  source: "site" | "awesome",
): Promise<{ kind: string; count: number }[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT w.kind, COUNT(*) AS n FROM works w WHERE w.source = ? AND ${VISIBILITY_PUBLIC} AND ${HIDDEN_PUBLIC} GROUP BY w.kind ORDER BY n DESC`,
    [source],
  );
  return rows.map((r) => ({ kind: String(r.kind), count: Number(r.n) }));
}

/* Whether the viewer already supports (initial state of the detail-page
   support button). */
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

/* INSERT IGNORE: concurrent duplicates/double-clicks are absorbed by the
   composite PK — an idempotent insert that never errors. */
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

/* CAST to SIGNED before GREATEST on the minus side: subtracting 1 from
   an UNSIGNED column wraps to a huge value (same trap as posts.ts
   hotExpr); the floor keeps concurrency from breaking through 0. */
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

/* insert affectedRows: 1 = new support this time (count +1); 0 = already
   supported (this call = cancel). */
export function workVoteBranch(insertAffectedRows: number): "support" | "cancel" {
  return insertAffectedRows > 0 ? "support" : "cancel";
}

/* Support toggle: a successful insert is a support, an existing row is
   deleted to cancel; returns the resulting state (optimistic clients only
   need ok; the value aligns callers and tests). */
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

/* ---- Comments ---- */

export interface WorkCommentRow {
  id: number;
  workId: number;
  /* Comment author; NULL = AI (summon). */
  userId: number | null;
  isAi: boolean;
  body: string;
  createdAt: Date;
  handle: string | null;
  avatarUrl: string | null;
}

/* Single-level comment paging: id cursor, time ascending (oldest first,
   threads grow bottom-up), one extra row per page to detect the next;
   comments added while paging only append at the end and never reshuffle
   pages already seen (same trade-off as community). */
export const WORK_COMMENT_PAGE_SIZE = 50;

export function workCommentPageQuery(
  workId: number,
  after: number,
  /* showAi=false (viewer disabled show_ai_replies) filters out AI
     comments; same definition as the count query. */
  opts: { showAi?: boolean } = {},
): { sql: string; args: number[] } {
  const showAi = opts.showAi ?? true;
  return {
    sql: `SELECT c.id, c.work_id, c.user_id, c.is_ai, c.body, c.created_at,
            u.handle, u.avatar_url
     FROM work_comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.work_id = ? AND c.deleted_at IS NULL AND c.id > ?
           ${showAi ? "" : "AND c.is_ai = 0"}
     ORDER BY c.id ASC LIMIT ${WORK_COMMENT_PAGE_SIZE + 1}`,
    args: [workId, after],
  };
}

/* Visible comment total: same rules as workCommentPageQuery (soft-delete
   + AI filter) — the two must change together. */
export function workCommentCountQuery(
  workId: number,
  opts: { showAi?: boolean } = {},
): {
  sql: string;
  args: number[];
} {
  const showAi = opts.showAi ?? true;
  return {
    sql: `SELECT COUNT(*) AS n FROM work_comments
          WHERE work_id = ? AND deleted_at IS NULL ${showAi ? "" : "AND is_ai = 0"}`,
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
  opts: { showAi?: boolean } = {},
): Promise<WorkCommentPage> {
  const count = workCommentCountQuery(workId, opts);
  const page = workCommentPageQuery(workId, after, opts);
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
      userId: r.user_id === null ? null : Number(r.user_id),
      isAi: !!r.is_ai,
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

/* Server-side idempotency (aligned with createCommentForVisiblePost): the
   same user submitting the same comment text on the same work within 60
   seconds counts as submitted — network retries and refresh re-submits
   beyond the client's posting debounce produce no duplicate and trigger
   no summon. */
export function workCommentDuplicateQuery(
  workId: number,
  userId: number,
  body: string,
): { sql: string; args: (string | number)[] } {
  return {
    sql: `SELECT id FROM work_comments
     WHERE work_id = ? AND user_id = ? AND body = ? AND deleted_at IS NULL
       AND created_at > TIMESTAMPADD(SECOND, -60, UTC_TIMESTAMP(3))
     LIMIT 1`,
    args: [workId, userId, body.slice(0, 10000)],
  };
}

/* Post comment: 60s dedup -> insert + counter +1 inside the
   withVisibleWorkLock transaction, one commit (aligned with
   createCommentForVisiblePost); visibility check and write share one
   lock, removing the action layer's check-then-write TOCTOU. No
   notifications for human comments (kept simple). AI comments are written
   directly by ai-reply.ts (is_ai=1, user_id NULL). */
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

export interface WorkCommentCreated {
  id: number;
  /* Set when the 60s dedup hits (idempotent success, no new row); the
     action layer skips summon triggering on it. */
  duplicate: boolean;
  /* The work's ai_reply switch (summon territory check read under the
     lock, replacing check-then-write). */
  aiReply: boolean;
}

/* Single-work visibility access (the works-side gate): reuses the
   canViewWork rules; lock=true takes SELECT ... FOR UPDATE so "check +
   write" share one lock. */
export async function getVisibleWorkAccess(
  workId: number,
  viewer: { id: number; role: string },
  db: Queryable = getPool(),
  lock = false,
): Promise<{ id: number; aiReply: boolean } | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT w.id, w.visibility, w.hidden_at, w.user_id, w.ai_reply
     FROM works w WHERE w.id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [workId],
  );
  const r = rows[0];
  if (!r) return null;
  const visible = canViewWork(
    {
      visibility: String(r.visibility),
      userId: r.user_id === null ? null : Number(r.user_id),
      hiddenAt: r.hidden_at ?? null,
    },
    viewer,
  );
  if (!visible) return null;
  return { id: Number(r.id), aiReply: !!r.ai_reply };
}

/* Transactional write path on a visible work (aligned with posts'
   withVisiblePostLock): not visible -> null (caller treats as a generic
   failure); reads and writes inside the callback share one transaction. */
export async function withVisibleWorkLock<T>(
  workId: number,
  viewer: { id: number; role: string },
  work: (conn: PoolConnection, access: { id: number; aiReply: boolean }) => Promise<T>,
): Promise<T | null> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const access = await getVisibleWorkAccess(workId, viewer, conn, true);
    if (!access) {
      await conn.rollback();
      return null;
    }
    const result = await work(conn, access);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function createWorkComment(
  viewer: { id: number; role: string },
  workId: number,
  body: string,
): Promise<WorkCommentCreated | null> {
  return withVisibleWorkLock(workId, viewer, async (conn, access) => {
    const dupQ = workCommentDuplicateQuery(workId, viewer.id, body);
    const [dup] = await conn.query<RowDataPacket[]>(dupQ.sql, dupQ.args);
    if (dup[0]) return { id: Number(dup[0].id), duplicate: true, aiReply: access.aiReply };
    const ins = workCommentInsertQuery(workId, viewer.id, body);
    const [res] = await conn.query<ResultSetHeader>(ins.sql, ins.args);
    await conn.query(
      "UPDATE works SET comment_count = comment_count + 1 WHERE id = ?",
      [workId],
    );
    return { id: Number(res.insertId), duplicate: false, aiReply: access.aiReply };
  });
}

/* Notification after an AI reply to a work comment: the summoning user +
   the work author (Set-deduped when they coincide; awesome external
   entries have no author, only the triggerer). actor NULL = AI;
   type='reply' with work target columns; the renderer anchors to
   /works/<id>#work-comment-<cid>. */
export async function notifyOnWorkComment(input: {
  workId: number;
  workCommentId: number;
  actorId: number | null;
  /* The comment that triggered the summon; the AI reply's "parent"
     semantics hang off it. */
  triggerCommentId: number | null;
}): Promise<void> {
  const pool = getPool();
  const recipients = new Set<number>();
  if (input.triggerCommentId !== null) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT user_id FROM work_comments WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [input.triggerCommentId],
    );
    const uid = rows[0]?.user_id;
    if (uid !== null && uid !== undefined && Number(uid) !== input.actorId)
      recipients.add(Number(uid));
  }
  const [wrows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id FROM works WHERE id = ? LIMIT 1",
    [input.workId],
  );
  const authorId = wrows[0]?.user_id;
  if (
    authorId !== null &&
    authorId !== undefined &&
    Number(authorId) !== input.actorId
  )
    recipients.add(Number(authorId));
  if (recipients.size === 0) return;
  const rows = [...recipients].map((uid) => [
    uid,
    input.actorId,
    "reply",
    input.workId,
    input.workCommentId,
  ]);
  await pool.query(
    "INSERT INTO notifications (user_id, actor_id, type, work_id, work_comment_id) VALUES ?",
    [rows],
  );
}

/* Delete comment (soft): the comment author or the work author may
   delete, permission pinned in WHERE (c.user_id or w.user_id); one
   multi-table UPDATE also decrements works.comment_count.
   moderator=true (governance cleanup of AI comments) bypasses ownership.
   affectedRows = 0 -> missing/deleted/unauthorized; callers treat it as
   failure. */
export function workCommentDeleteQuery(
  commentId: number,
  userId: number,
  opts: { moderator?: boolean } = {},
): { sql: string; args: number[] } {
  const perm = opts.moderator ? "" : " AND (c.user_id = ? OR w.user_id = ?)";
  return {
    sql: `UPDATE work_comments c JOIN works w ON w.id = c.work_id
     SET c.deleted_at = NOW(),
         w.comment_count = GREATEST(0, CAST(w.comment_count AS SIGNED) - 1)
     WHERE c.id = ? AND c.deleted_at IS NULL${perm}`,
    args: opts.moderator ? [commentId] : [commentId, userId, userId],
  };
}

export async function deleteWorkComment(
  userId: number,
  commentId: number,
  opts: { moderator?: boolean } = {},
): Promise<boolean> {
  const q = workCommentDeleteQuery(commentId, userId, opts);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return res.affectedRows > 0;
}
