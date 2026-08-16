"use server";

/* 作品库写操作:提交 / 编辑 / 删除(作者自助,归属校验在查询层 WHERE)。
   模式同社区:useActionState 的表单返回 { error? / ok+workId }——保存成功由
   客户端 router.push 落详情页(action 里 redirect 转不走弹窗插槽);
   删除返回 MutationResult 由客户端 toast + 跳回列表。
   末尾两个精选操作是编辑(admin/mod)定夺,不做归属校验(每周精选 v0)。 */
import { revalidatePath, updateTag } from "next/cache";
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
  /* 保存成功由客户端 router.push 落详情页——action 里 redirect() 只会转背景页,
     拦截路由的 @modal 插槽不随之卸载(2026-08-14 实测) */
  ok?: boolean;
  workId?: number;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
  /* 限流(P1-5):超限时带上的等待秒数,客户端可直接展示 error 文案 */
  retryAfterSeconds?: number;
  /* AI 召唤结果(20260816 PR2,与社区同形):评论里 @kimi 时给客户端 toast 用;
     评论本身照常发布,该字段只说明召唤是否成立 */
  aiNote?: "summoned" | "aiDisabled" | "rate";
}

/* 标签:逗号/空格分隔,≤5 个,每个 ≤24 字。 */
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

/* 模型:家族预设键或自填型号文本,≤10 个,每个 ≤40 字。 */
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
    /* 私密开关:checkbox 提交 "on";非 "on" 一律 public(枚举在这里钉死) */
    visibility: (formData.get("private") === "on" ? "private" : "public") as
      | "public"
      | "private",
    /* 同时收录 Awesome(20260906):仅「我的作品」有意;推荐条目恒在 Awesome */
    alsoAwesome: formData.get("also_awesome") === "on",
    /* 允许 AI 参与评论区(20260816 召唤):checkbox 提交 "on";不勾 = 关 */
    aiReply: formData.get("ai_reply") === "on",
    /* 表单意图(我的作品/推荐站外项目):authorLabel 非空才是 awesome 条目,
       intent 只用于校验提示(推荐但没填原作者 → 明确报错而不是静默当成作品) */
    intent: String(formData.get("kind") || "site") === "awesome" ? "awesome" : "site",
    status: (WORK_STATUSES as readonly string[]).includes(status) ? status : "released",
    models: sanitizeModelsInput(formData.getAll("models")),
    /* 作品类型(单选);表单的 kind 字段是「我的作品/推荐」意图,不冲突 */
    kind: isWorkKind(String(formData.get("work_kind") || ""))
      ? String(formData.get("work_kind"))
      : "app",
    descriptionMd: String(formData.get("description_md") || "").trim().slice(0, 10000),
    scope: (AWESOME_SCOPES as readonly string[]).includes(scope) ? scope : null,
    /* 媒体隐藏字段(20260826_work_media):logoKey 单 key;imageKeys 为 JSON 字符串,
       解析失败 = null,交给 validate 报错(不静默吞掉手搓值) */
    logoKey: String(formData.get("logoKey") || "").trim(),
    imageKeys: parseWorkImageKeysInput(String(formData.get("imageKeys") || "")),
    /* 独立列表封面(20260916):空=走色卡;非空必须是 image/ 前缀的合法媒体 key */
    coverKey: String(formData.get("coverKey") || "").trim(),
    /* 名称砖色调 + 封面适配(20260908):白名单收敛,非法值回落默认 */
    coverTone: isCoverTone(String(formData.get("coverTone") || ""))
      ? String(formData.get("coverTone"))
      : "theme",
    coverFit: String(formData.get("coverFit")) === "contain" ? "contain" : "cover",
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
  /* 表单选了「推荐站外项目」但没填原作者 → 明确报错(而不是静默当成作品墙条目) */
  if (f.intent === "awesome" && !f.authorLabel) return t(locale, "err.workAuthorRequired");
  /* awesome 条目必须有收录口径(推荐规则:公开展示推荐人,口径必填) */
  if (f.authorLabel && !f.scope) return t(locale, "err.workNoScope");
  /* 媒体 key:形状 + 前缀白名单(logo 仅 logo/,配图 ≤9 且仅 image/,封面同理) */
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

/* 构建投入声明(声明制):解析紧凑输入 → 额度校验(Σ声明 ≤ 可验证总量,
   编辑时 excludeWorkId 排除本作品)。awesome 推荐条目不适用声明,强制 null。
   写时校验是 UX 兜底(并发越过校验时,展示侧不变式仍会隐藏超额徽章)。 */
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
  /* 禁言(20260830):到期自动解除 */
  const mutedWork = await getActiveMute(user.id);
  if (mutedWork) return { error: muteMessage(locale, mutedWork) };
  const f = readFields(formData);
  const err = validate(locale, f);
  if (err) return { error: err };
  const claim = await resolveClaim(user.id, locale, formData, {
    awesome: !!f.authorLabel,
  });
  if ("error" in claim) return { error: claim.error };
  const newWorkId = await createWork(user.id, {
    ...f,
    imageKeys: f.imageKeys ?? [],
    claimedTokens: claim.claimed,
  });
  updateTag(PUBLIC_WORKS_CACHE_TAG);
  revalidatePath("/works");
  revalidatePath("/awesome");
  /* 落详情页:不在 action 里 redirect(弹窗插槽不随转);由客户端 router.push */
  return { ok: true, workId: newWorkId };
}

export async function updateWorkAction(
  _prev: WorkFormState | null,
  formData: FormData,
): Promise<WorkFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
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
  /* 同新建:客户端 router.push 落详情页,弹窗随之关闭 */
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

/* ---- 编辑精选(admin/mod 定夺,署名到编辑本人;每周精选 v0)---- */

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
  /* 首页数据走 tag 缓存(updateTag 即时作废),列表/首页路径缓存一并清 */
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

/* 作品列表「加载更多」(P1-4):只读,不落库不作废缓存。返回服务端渲染好的一页
   卡片(ReactNode 随 RSC 序列化),客户端直接追加;徽章/精选行与首屏同口径
   (都在 loadWorksCards 里)。游标 = 上一页最后一个作品的 id。 */
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
  const agents = scope.agents
    .filter((id) => AGENTS.some((a) => a.id === id))
    .slice(0, AGENTS.length);
  const kinds = scope.kinds.filter(isWorkKind).slice(0, 12);
  const scopeFilter =
    scope.scope_ && ["base", "eco", "part"].includes(scope.scope_)
      ? scope.scope_
      : undefined;
  /* 视图随 cookie(与首屏同源):「加载更多」追加的卡片与首屏同版式 */
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


/* ---- 详情互动(P1-2):支持 toggle + 单层评论 ----
   支持走纯乐观更新(只落库、不作废路径,同社区顶踩);评论 mutation 后由客户端
   router.refresh() 换当前页数据,这里 revalidatePath 作废详情页预取缓存。
   人类评论不发通知(从简);@kimi 召唤(20260816 PR2)排 AI 任务,
   AI 回复落库时通知 召唤者+作品作者;删除权限(评论作者/作品作者/治理)钉在 SQL。 */

export async function toggleWorkVoteAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const workId = Number(formData.get("work_id"));
  if (!Number.isSafeInteger(workId) || workId <= 0) return { ok: false };
  /* 作品已删/不存在 → FK 会拒,提前挡掉按失败处理(客户端回滚乐观态);
     私密作品对非作者同样拒绝(手搓请求也不能隔空支持) */
  const work = await getWork(workId);
  if (!work || !canViewWork(work, user)) return { ok: false };
  /* 限流(P1-5):投票类动作用 vote 配额;超限返回结构化错误,客户端回滚 + toast */
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
  /* 禁言(20260830):到期自动解除 */
  const mutedNow = await getActiveMute(user.id);
  if (mutedNow) return { ok: false, error: muteMessage(locale, mutedNow) };
  const workId = Number(formData.get("work_id"));
  const body = String(formData.get("body") || "").trim();
  if (!Number.isSafeInteger(workId) || workId <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  if (!body) return { ok: false, error: t(locale, "err.commentEmpty") };
  /* 私密作品对非作者拒绝评论(页面本不可达,这里挡手搓请求) */
  const work = await getWork(workId);
  if (!work || !canViewWork(work, user)) return { ok: false, error: t(locale, "err.generic") };
  /* 限流(P1-5):作品评论共用社区 comment 配额,写库前消耗额度 */
  const rate = await consumeCommunityRateLimit(user.id, "comment");
  if (!rate.allowed)
    return {
      ok: false,
      error: t(locale, "err.rateComment", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  const created = await createWorkComment(workId, user.id, body);
  /* @kimi 召唤(20260816 PR2,语义同社区评论召唤):duplicate 不触发(网络重试
     不刷双倍 AI 回复);地盘 = 作品 ai_reply 开关(作者全局开关在执行侧复查,
     awesome 站外条目无作者、仅作品开关);召唤另计独立限流(ai_summon 20/小时),
     超限不召唤但评论照常发布。enqueue 内部用 after(),必须在 return 之前调用。 */
  let aiNote: MutationResult["aiNote"];
  if (!created.duplicate && hasKimiMention(body) && user.aiRepliesEnabled) {
    if (!work.aiReply) {
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
  return aiNote ? { ok: true, aiNote } : { ok: true };
}

export async function deleteWorkCommentAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const commentId = Number(formData.get("comment_id"));
  const workId = Number(formData.get("work_id"));
  if (!Number.isSafeInteger(commentId) || commentId <= 0) return { ok: false };
  /* 权限(评论作者本人或作品作者;治理免归属,20260816 召唤起用于清 AI 评论)
     钉在 SQL WHERE;affectedRows=0 即越权/已删 */
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

/* 评论「加载更多」:只读,不落库不作废缓存。返回服务端渲染好的一页
   (ReactNode 随 RSC 序列化),客户端直接追加;游标 = 上一页最后一条评论 id。 */
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
  /* 私密/被屏蔽作品的评论分页对非作者关闭(与详情页门禁同口径) */
  if (!canViewWork(work, user)) return { ok: false };
  const locale = await getLocale(user);
  const data = await loadWorkComments(workId, work.userId, user, locale, after);
  return { ok: true, ...data };
}
