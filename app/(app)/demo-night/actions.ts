"use server";

/* Demo Night RSVP / cancel. The UI renders entries for signed-in
   users only; this re-checks (empty session = reject). Idempotency
   lives in the lib's SQL (INSERT IGNORE + composite PK) — repeat calls
   agree; success revalidatePaths /demo-night prefetched caches and the
   client router.refresh()es for the new list. */
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
  await rsvp(eventId, user.id); // repeat RSVPs are idempotent: no
                                // error, no double credit
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
