"use server";

/* Work write operations: submit / edit / delete (author self-service;
   ownership is pinned in query-layer WHERE clauses). Same pattern as
   community: useActionState forms return { error? / ok+workId } — a
   successful save lands on the detail page via client router.push
   (redirect() inside the action only moves the background page; the
   intercepted @modal slot doesn't unmount); deletes return a
   MutationResult for client toast + list redirect. The two featuring
   operations at the bottom are editorial (admin/mod) rulings without
   ownership checks (weekly featured v0). */
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { sanitizeAgentIds, AGENTS } from "@/src/lib/agents";
import { isCoverTone } from "@/src/lib/cover-tones";
import { isWorkKind } from "@/src/lib/work-kinds";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  canModerate,
  clearWorkFeatured,
  FEATURED_REASON_MAX,
  normalizeFeaturedReason,
  setWorkFeatured,
} from "@/src/lib/featured";
import { compactNumber } from "@/src/lib/format";
import {
  PUBLIC_FEATURED_CACHE_TAG,
  PUBLIC_WORKS_CACHE_TAG,
} from "@/src/lib/cache-tags";
import { HOME_CACHE_TAG } from "@/src/lib/home";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { enqueueAiWorkMention } from "@/src/lib/ai-reply";
import { hasKimiMention } from "@/src/lib/mention-kimi";
import { getActiveMute, muteMessage } from "@/src/lib/moderation";
import { consumeCommunityRateLimit } from "@/src/lib/rate-limit";
import { getWorksView } from "@/src/lib/works-view-server";
import { normalizePathSlug } from "@/src/lib/learn-series";
import {
  areWorkImageKeys,
  canViewWork,
  checkClaimAllowance,
  createWork,
  createWorkComment,
  deleteWork,
  deleteWorkComment,
  getClaimAllowance,
  getWork,
  isWorkLogoKey,
  isWorkMediaKey,
  notifyOnWorkHumanComment,
  parseClaimInput,
  parseWorkImageKeysInput,
  toggleWorkVote,
  updateWork,
} from "@/src/lib/works";
import {
  loadWorkComments,
  type WorkCommentPageData,
} from "./_components/work-comment-page";
import {
  loadWorksCards,
  type WorksPageData,
} from "./_components/works-page";

export interface WorkFormState {
  error?: string;
  /* Success lands on the detail page via client router.push — redirect()
     inside the action only moves the background page; the intercepted
     @modal slot doesn't unmount (verified 2026-08-14). */
  ok?: boolean;
  workId?: number;
  /* Wait seconds when over the work-creation rate limit; clients can
     show the error copy directly. */
  retryAfterSeconds?: number;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
  /* Rate limit: wait seconds carried on rejection; clients can show the
     error copy directly. */
  retryAfterSeconds?: number;
  /* AI summon outcome (same shape as community): client toast material
     when a comment @-s kimi; the comment publishes either way and this
     field only says whether the summon took. */
  aiNote?: "summoned" | "aiDisabled" | "rate";
  /* New comment id: after a successful summon the client polls for the
     reply against it. */
  commentId?: number;
}

/* Tags: comma/space separated, <=5, <=24 chars each. */
function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,,\s]+/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 5)
    .map((s) => s.slice(0, 24));
}

const WORK_STATUSES = ["planning", "building", "released", "archived"] as const;
const AWESOME_SCOPES = ["base", "eco", "part"] as const;

/* Models: family preset keys or free-form model text, <=10, <=40 chars
   each. */
function sanitizeModelsInput(raw: unknown[]): string[] {
  return raw
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => s.slice(0, 40));
}

function readFields(formData: FormData) {
  const status = String(formData.get("status") || "released");
  const scope = String(formData.get("scope") || "");
  return {
    name: String(formData.get("name") || "").trim(),
    tagline: String(formData.get("tagline") || "").trim(),
    url: String(formData.get("url") || "").trim(),
    repoUrl: String(formData.get("repo_url") || "").trim(),
    screenshotUrl: String(formData.get("screenshot_url") || "").trim(),
    tags: parseTagsInput(String(formData.get("tags") || "")),
    agents: sanitizeAgentIds(formData.getAll("agents")),
    authorLabel: String(formData.get("author_label") || "").trim(),
    /* Privacy: the checkbox submits "on"; anything else is public (the
       enum is pinned here). */
    visibility: (formData.get("private") === "on" ? "private" : "public") as
      | "public"
      | "private",
    /* Also-list-on-Awesome: meaningful for "my work" only; recommended
       entries are always on Awesome. */
    alsoAwesome: formData.get("also_awesome") === "on",
    /* Allow AI in comments (summons): the checkbox submits "on";
       unchecked = off. */
    aiReply: formData.get("ai_reply") === "on",
    /* Form intent (my work / recommend external): authorLabel non-empty
       marks an awesome entry; intent only drives validation hints
       (recommending without the original author -> an explicit error,
       never silently treated as a member work). */
    intent: String(formData.get("kind") || "site") === "awesome" ? "awesome" : "site",
    status: (WORK_STATUSES as readonly string[]).includes(status) ? status : "released",
    models: sanitizeModelsInput(formData.getAll("models")),
    /* Work kind (single choice); the form's kind field carries the
       my-work/recommend intent — no clash. */
    kind: isWorkKind(String(formData.get("work_kind") || ""))
      ? String(formData.get("work_kind"))
      : "app",
    descriptionMd: String(formData.get("description_md") || "").trim().slice(0, 10000),
    scope: (AWESOME_SCOPES as readonly string[]).includes(scope) ? scope : null,
    /* Media hidden fields: logoKey is a single key; imageKeys is a JSON
       string — parse failure = null and validate reports it (hand-crafted
       values are never silently swallowed). */
    logoKey: String(formData.get("logoKey") || "").trim(),
    imageKeys: parseWorkImageKeysInput(String(formData.get("imageKeys") || "")),
    /* Standalone list cover: empty = color card; non-empty must be a
       valid image/-prefixed media key. */
    coverKey: String(formData.get("coverKey") || "").trim(),
    /* Name-brick tone + cover fit: allowlist-converged, invalid values
       fall back to defaults. */
    coverTone: isCoverTone(String(formData.get("coverTone") || ""))
      ? String(formData.get("coverTone"))
      : "theme",
    coverFit: String(formData.get("coverFit")) === "contain" ? "contain" : "cover",
    /* Graduation attribution: the hidden source_path trusts registered
       series slugs only; invalid becomes null. */
    sourcePath: normalizePathSlug(String(formData.get("source_path") || "")),
  };
}

const isHttp = (s: string) => /^https?:\/\/.+/.test(s);

function validate(
  locale: "zh" | "en",
  f: ReturnType<typeof readFields>,
): string | null {
  if (!f.name) return t(locale, "err.workName");
  if (f.name.length > 120) return t(locale, "err.workNameLong");
  if (f.tagline.length > 300) return t(locale, "err.workTaglineLong");
  for (const u of [f.url, f.repoUrl, f.screenshotUrl]) {
    if (u && !isHttp(u)) return t(locale, "err.linkInvalid");
  }
  if (!f.url && !f.repoUrl) return t(locale, "err.workNoLink");
  if (f.authorLabel.length > 120) return t(locale, "err.workAuthorLong");
  if (f.agents.length === 0) return t(locale, "err.workNoAgent");
  /* "Recommend external" without the original author -> an explicit
     error (never silently treated as a wall entry). */
  if (f.intent === "awesome" && !f.authorLabel) return t(locale, "err.workAuthorRequired");
  /* Awesome entries require a scope (recommendation rules: the
     recommender is shown publicly, so the scope is mandatory). */
  if (f.authorLabel && !f.scope) return t(locale, "err.workNoScope");
  /* Media keys: shape + prefix allowlist (logo only logo/, images <=9
     and only image/, cover likewise). */
  if (!isWorkLogoKey(f.logoKey)) return t(locale, "err.workLogoKey");
  if (f.imageKeys === null || !areWorkImageKeys(f.imageKeys))
    return t(locale, "err.workImageKeys");
  if (
    f.coverKey !== "" &&
    !(isWorkMediaKey(f.coverKey) && f.coverKey.startsWith("image/"))
  )
    return t(locale, "err.workImageKeys");
  return null;
}

/* Build-effort claims: parse compact input -> allowance validation
   (sum of claims <= verifiable total, excluding this work while
   editing). Awesome entries never claim — forced null. Write-time
   validation is a UX backstop (if concurrency slips past it, the
   display invariant still hides over-cap badges). */
async function resolveClaim(
  userId: number,
  locale: "zh" | "en",
  formData: FormData,
  opts: { awesome: boolean; excludeWorkId?: number },
): Promise<{ claimed: number | null } | { error: string }> {
  if (opts.awesome) return { claimed: null };
  const parsed = parseClaimInput(String(formData.get("claimed_tokens") || ""));
  if (parsed.kind === "invalid") return { error: t(locale, "err.workClaimInvalid") };
  if (parsed.kind === "none") return { claimed: null };
  const allowance = await getClaimAllowance(userId, opts.excludeWorkId);
  const check = checkClaimAllowance(parsed.value, allowance.remaining);
  if (!check.ok)
    return {
      error: t(locale, "err.workClaimExceeds", {
        n: compactNumber(check.remaining, locale),
      }),
    };
  return { claimed: parsed.value };
}

export async function createWorkAction(
  _prev: WorkFormState | null,
  formData: FormData,
): Promise<WorkFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  /* Mutes lift automatically at expiry. */
  const mutedWork = await getActiveMute(user.id);
  if (mutedWork) return { error: muteMessage(locale, mutedWork) };
  const f = readFields(formData);
  const err = validate(locale, f);
  if (err) return { error: err };
  const claim = await resolveClaim(user.id, locale, formData, {
    awesome: !!f.authorLabel,
  });
  if ("error" in claim) return { error: claim.error };
  /* Rate limit: consumed after validation and claim resolution but
     before the write — 10/hour like community posts, against bulk work
     spam. */
  const rate = await consumeCommunityRateLimit(user.id, "work");
  if (!rate.allowed)
    return {
      error: t(locale, "err.rateWork", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  const newWorkId = await createWork(user.id, {
    ...f,
    imageKeys: f.imageKeys ?? [],
    claimedTokens: claim.claimed,
  });
  updateTag(PUBLIC_WORKS_CACHE_TAG);
  revalidatePath("/works");
  revalidatePath("/awesome");
  /* List context follows what was just published, not the list the
     visitor arrived from: entering from /awesome then switching to
     "My work" must not strand the fresh detail page on "Back to
     Awesome". Same session-cookie shape the proxy writes for list
     visits. */
  (await cookies()).set("kb-works-src", f.authorLabel ? "awesome" : "works", {
    path: "/",
    sameSite: "lax",
  });
  /* Land on the detail page: no redirect() in the action (the modal
     slot doesn't follow); the client router.pushes. */
  return { ok: true, workId: newWorkId };
}

export async function updateWorkAction(
  _prev: WorkFormState | null,
  formData: FormData,
): Promise<WorkFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  /* Mute check on edit too — the same bar as creating, so muted users
     can't speak via edits. */
  const mutedWork = await getActiveMute(user.id);
  if (mutedWork) return { error: muteMessage(locale, mutedWork) };
  const workId = Number(formData.get("work_id"));
  if (!workId) return { error: t(locale, "err.generic") };
  const f = readFields(formData);
  const err = validate(locale, f);
  if (err) return { error: err };
  const claim = await resolveClaim(user.id, locale, formData, {
    awesome: !!f.authorLabel,
    excludeWorkId: workId,
  });
  if ("error" in claim) return { error: claim.error };
  const ok = await updateWork(user.id, workId, {
    ...f,
    imageKeys: f.imageKeys ?? [],
    claimedTokens: claim.claimed,
  });
  if (!ok) return { error: t(locale, "err.notOwnerWork") };
  updateTag(PUBLIC_WORKS_CACHE_TAG);
  updateTag(PUBLIC_FEATURED_CACHE_TAG);
  revalidatePath("/works");
  revalidatePath("/awesome");
  /* Like create: the client router.pushes to the detail page and the
     modal closes with it. */
  return { ok: true, workId };
}

export async function deleteWorkAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const workId = Number(formData.get("work_id"));
  if (!workId) return { ok: false };
  const ok = await deleteWork(user.id, workId);
  if (ok) {
    updateTag(PUBLIC_WORKS_CACHE_TAG);
    updateTag(PUBLIC_FEATURED_CACHE_TAG);
    revalidatePath("/works");
    revalidatePath("/awesome");
  }
  return { ok };
}

/* ---- Editorial featuring (admin/mod ruling, attributed to the
   editor; weekly featured v0) ---- */

export async function featureWorkAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  if (!canModerate(user.role))
    return { ok: false, error: t(locale, "err.forbidden") };
  const workId = Number(formData.get("work_id"));
  if (!workId) return { ok: false, error: t(locale, "err.generic") };
  const raw = String(formData.get("reason") || "");
  if (raw.trim().length > FEATURED_REASON_MAX)
    return { ok: false, error: t(locale, "err.reasonLong") };
  const reason = normalizeFeaturedReason(raw);
  if (!reason) return { ok: false, error: t(locale, "err.reasonRequired") };
  const ok = await setWorkFeatured(user.id, workId, reason);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  /* Home data goes through tag caches (updateTag invalidates now);
     list/home path caches are cleared alongside. */
  updateTag(HOME_CACHE_TAG);
  updateTag(PUBLIC_WORKS_CACHE_TAG);
  updateTag(PUBLIC_FEATURED_CACHE_TAG);
  revalidatePath("/works");
  revalidatePath("/awesome");
  revalidatePath("/");
  return { ok: true };
}

export async function unfeatureWorkAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  if (!canModerate(user.role))
    return { ok: false, error: t(locale, "err.forbidden") };
  const workId = Number(formData.get("work_id"));
  if (!workId) return { ok: false, error: t(locale, "err.generic") };
  const ok = await clearWorkFeatured(workId);
  if (ok) {
    updateTag(HOME_CACHE_TAG);
    updateTag(PUBLIC_WORKS_CACHE_TAG);
    updateTag(PUBLIC_FEATURED_CACHE_TAG);
    revalidatePath("/works");
    revalidatePath("/awesome");
    revalidatePath("/");
  }
  return { ok };
}

/* Works "load more": read-only — no writes, no cache invalidation.
   Returns a server-rendered page of cards (ReactNode serialized over
   RSC) for the client to append; badges/featuring rows match the first
   page (both live in loadWorksCards). Cursor = the last work's id. */
export async function loadMoreWorksAction(
  scope: {
    awesome: boolean;
    sort: "hot" | "new";
    agents: string[];
    kinds: string[];
    scope_: string | null;
  },
  after: string,
): Promise<({ ok: true } & WorksPageData) | { ok: false }> {
  if (typeof after !== "string" || after.length === 0 || after.length > 40) return { ok: false };
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* Filter convergence: registry-member filtering + dedup; caps are the
     query layer's same-source convergence. */
  const agents = [...new Set(scope.agents)].filter((id) => AGENTS.some((a) => a.id === id));
  const kinds = [...new Set(scope.kinds)].filter(isWorkKind);
  const scopeFilter =
    scope.scope_ && ["base", "eco", "part"].includes(scope.scope_)
      ? scope.scope_
      : undefined;
  /* View follows the cookie (same source as the first page): appended
     cards match the first page's layout. */
  const view = await getWorksView();
  const data = await loadWorksCards(
    {
      awesome: scope.awesome,
      sort: scope.sort === "hot" ? "hot" : "new",
      agents,
      kinds,
      scope_: scopeFilter,
      view,
    },
    user,
    locale,
    after,
  );
  return { ok: true, ...data };
}


/* ---- Detail interactions: support toggle + single-level comments
   ---- Supports are purely optimistic (write only, no path
   invalidation — same as community votes); after a comment mutation the
   client router.refresh()es for fresh page data while revalidatePath
   here drops the detail page's prefetched cache. Human comments notify
   the work author (notifyOnWorkHumanComment; duplicates never do); an
   @kimi summon queues an AI job whose reply notifies the summoner +
   the work author when it lands; delete permissions (comment author /
   work author / moderation) are pinned in SQL. */

export async function toggleWorkVoteAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const workId = Number(formData.get("work_id"));
  if (!Number.isSafeInteger(workId) || workId <= 0) return { ok: false };
  /* Deleted/missing works would fail the FK anyway — reject up front so
     the client rolls back its optimistic state; private works reject
     non-authors too (crafted requests can't support across the void). */
  const work = await getWork(workId);
  if (!work || !canViewWork(work, user)) return { ok: false };
  /* Rate limit: vote-class actions use the vote quota; over the limit
     returns a structured error for client rollback + toast. */
  const rate = await consumeCommunityRateLimit(user.id, "vote");
  if (!rate.allowed) {
    const locale = await getLocale(user);
    return {
      ok: false,
      error: t(locale, "err.rateVote", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }
  await toggleWorkVote(user.id, workId);
  updateTag(PUBLIC_WORKS_CACHE_TAG);
  return { ok: true };
}

export async function createWorkCommentAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  /* Mutes lift automatically at expiry. */
  const mutedNow = await getActiveMute(user.id);
  if (mutedNow) return { ok: false, error: muteMessage(locale, mutedNow) };
  const workId = Number(formData.get("work_id"));
  const body = String(formData.get("body") || "").trim();
  if (!Number.isSafeInteger(workId) || workId <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  if (!body) return { ok: false, error: t(locale, "err.commentEmpty") };
  /* Rate limit: work comments share the community comment quota,
     consumed before the write. */
  const rate = await consumeCommunityRateLimit(user.id, "comment");
  if (!rate.allowed)
    return {
      ok: false,
      error: t(locale, "err.rateComment", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  /* Private works reject comments from non-authors: the visibility
     check lives inside createWorkComment's withVisibleWorkLock
     transaction — no more check-then-write. */
  const created = await createWorkComment(user, workId, body);
  if (!created) return { ok: false, error: t(locale, "err.generic") };
  /* Human comments notify the work author (duplicates never do — a
     network retry must not stack notifications either). */
  if (!created.duplicate) {
    await notifyOnWorkHumanComment({
      workId,
      workCommentId: created.id,
      actorId: user.id,
    });
  }
  /* @kimi summon (same semantics as community): duplicates never
     trigger (a network retry must not double the AI replies); territory
     = the work's ai_reply switch (read under the lock and carried back;
     the author's global switch is re-checked at execution — awesome
     external entries have no author, the work switch alone decides);
     summons carry their own limit (ai_summon 20/hour) — over it, no
     summon but the comment still publishes. enqueue uses after()
     internally and must run before the return. */
  let aiNote: MutationResult["aiNote"];
  if (!created.duplicate && hasKimiMention(body) && user.aiRepliesEnabled) {
    if (!created.aiReply) {
      aiNote = "aiDisabled";
    } else {
      const summonRate = await consumeCommunityRateLimit(user.id, "ai_summon");
      if (!summonRate.allowed) {
        aiNote = "rate";
      } else {
        await enqueueAiWorkMention(workId, created.id);
        aiNote = "summoned";
      }
    }
  }
  updateTag(PUBLIC_WORKS_CACHE_TAG);
  revalidatePath(`/works/${workId}`);
  return { ok: true, commentId: created.id, ...(aiNote ? { aiNote } : {}) };
}

export async function deleteWorkCommentAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const commentId = Number(formData.get("comment_id"));
  const workId = Number(formData.get("work_id"));
  if (!Number.isSafeInteger(commentId) || commentId <= 0) return { ok: false };
  /* Permissions (comment author or work author; moderation bypasses
     ownership for AI-comment cleanup) are pinned in SQL WHERE;
     affectedRows=0 = unauthorized/deleted. */
  const ok = await deleteWorkComment(user.id, commentId, {
    moderator: canModerate(user.role),
  });
  if (ok) {
    updateTag(PUBLIC_WORKS_CACHE_TAG);
    if (Number.isSafeInteger(workId) && workId > 0)
      revalidatePath(`/works/${workId}`);
  }
  return { ok };
}

/* Comment "load more": read-only — no writes, no invalidation. Returns
   a server-rendered page (ReactNode over RSC) for the client to append;
   cursor = the last comment's id. */
export async function loadMoreWorkCommentsAction(
  workId: number,
  after: number,
): Promise<({ ok: true } & WorkCommentPageData) | { ok: false }> {
  if (
    !Number.isSafeInteger(workId) ||
    workId <= 0 ||
    !Number.isSafeInteger(after) ||
    after < 0
  )
    return { ok: false };
  const work = await getWork(workId);
  if (!work) return { ok: false };
  const user = await getSessionUser();
  /* Comment paging on private/hidden works closes to non-authors (same
     gate as the detail page). */
  if (!canViewWork(work, user)) return { ok: false };
  const locale = await getLocale(user);
  const data = await loadWorkComments(workId, work.userId, user, locale, after);
  return { ok: true, ...data };
}
