"use server";

/* 作品库写操作:提交 / 编辑 / 删除(作者自助,归属校验在查询层 WHERE)。
   模式同社区:useActionState 的表单返回 { error? } 后 redirect;
   删除返回 MutationResult 由客户端 toast + 跳回列表。 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { createWork, deleteWork, updateWork } from "@/src/lib/works";

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
  redirect("/works");
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
  redirect("/works");
}

export async function deleteWorkAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const workId = Number(formData.get("work_id"));
  if (!workId) return { ok: false };
  const ok = await deleteWork(user.id, workId);
  if (ok) revalidatePath("/works");
  return { ok };
}
