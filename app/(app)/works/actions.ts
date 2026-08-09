"use server";

/* 作品库写操作:提交 / 编辑 / 删除(作者自助,归属校验在查询层 WHERE)。
   模式同社区:useActionState 的表单返回 { error? } 后 redirect;
   删除返回 MutationResult 由客户端 toast + 跳回列表。
   末尾两个精选操作是编辑(admin/mod)定夺,不做归属校验(每周精选 v0)。 */
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { sanitizeAgentIds, AGENTS } from "@/src/lib/agents";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  canModerate,
  clearWorkFeatured,
  FEATURED_REASON_MAX,
  normalizeFeaturedReason,
  setWorkFeatured,
} from "@/src/lib/featured";
import { HOME_CACHE_TAG } from "@/src/lib/home";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { createWork, deleteWork, updateWork } from "@/src/lib/works";
import {
  loadWorksCards,
  type WorksPageData,
} from "./_components/works-page";

export interface WorkFormState {
  error?: string;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
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

function readFields(formData: FormData) {
  return {
    name: String(formData.get("name") || "").trim(),
    tagline: String(formData.get("tagline") || "").trim(),
    url: String(formData.get("url") || "").trim(),
    repoUrl: String(formData.get("repo_url") || "").trim(),
    screenshotUrl: String(formData.get("screenshot_url") || "").trim(),
    tags: parseTagsInput(String(formData.get("tags") || "")),
    agents: sanitizeAgentIds(formData.getAll("agents")),
    authorLabel: String(formData.get("author_label") || "").trim(),
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
  return null;
}

export async function createWorkAction(
  _prev: WorkFormState | null,
  formData: FormData,
): Promise<WorkFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  const f = readFields(formData);
  const err = validate(locale, f);
  if (err) return { error: err };
  await createWork(user.id, f);
  revalidatePath("/works");
  revalidatePath("/awesome");
  redirect(f.authorLabel ? "/awesome" : "/works");
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
  const ok = await updateWork(user.id, workId, f);
  if (!ok) return { error: t(locale, "err.notOwnerWork") };
  revalidatePath("/works");
  revalidatePath("/awesome");
  redirect(f.authorLabel ? "/awesome" : "/works");
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
  scope: { awesome: boolean; agent: string | null },
  after: number,
): Promise<({ ok: true } & WorksPageData) | { ok: false }> {
  if (!Number.isSafeInteger(after) || after <= 0) return { ok: false };
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const agent =
    scope.agent && AGENTS.some((a) => a.id === scope.agent)
      ? scope.agent
      : undefined;
  const data = await loadWorksCards(
    { awesome: scope.awesome, agent },
    user,
    locale,
    after,
  );
  return { ok: true, ...data };
}
