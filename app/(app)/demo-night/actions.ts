"use server";

/* Demo Night 报名 / 取消。UI 只对登录用户渲染入口,这里再兜底一次(session 为空即拒)。
   幂等性在 lib 的 SQL 侧(INSERT IGNORE + 复合主键),重复调用结果一致;
   成功后 revalidatePath 作废 /demo-night 预取缓存,客户端再 router.refresh() 换名单。 */
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import { cancelRsvp, rsvp } from "@/src/lib/demo-night";

export interface RsvpResult {
  ok: boolean;
  rsvped: boolean;
}

export async function rsvpDemoNightAction(
  formData: FormData,
): Promise<RsvpResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, rsvped: false };
  const eventId = Number(formData.get("event_id"));
  if (!eventId) return { ok: false, rsvped: false };
  await rsvp(eventId, user.id); // 重复报名幂等:不报错、不重复署名
  revalidatePath("/demo-night");
  return { ok: true, rsvped: true };
}

export async function cancelDemoNightRsvpAction(
  formData: FormData,
): Promise<RsvpResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, rsvped: false };
  const eventId = Number(formData.get("event_id"));
  if (!eventId) return { ok: false, rsvped: false };
  await cancelRsvp(eventId, user.id);
  revalidatePath("/demo-night");
  return { ok: true, rsvped: false };
}
