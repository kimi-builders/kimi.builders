/* POST /api/feedback — member content-feedback intake (B2). Signed-in only;
   body form or JSON {targetType, targetId, reason, note?}. A duplicate
   open flag on the same target by the same member returns
   {ok:false, code:"duplicate"} without stacking rows; 20/hour per member
   caps bulk flagging. */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/src/lib/auth/session";
import { consumeCommunityRateLimit } from "@/src/lib/rate-limit";
import {
  sendFeedback,
  isFeedbackReason,
  isFeedbackTargetType,
  FEEDBACK_NOTE_MAX,
} from "@/src/lib/feedback";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ ok: false, code: "auth" }, { status: 401 });

  let raw: Record<string, unknown>;
  if (req.headers.get("content-type")?.includes("application/json")) {
    raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    const form = await req.formData().catch(() => null);
    raw = Object.fromEntries(form ?? []) as Record<string, unknown>;
  }

  const targetType = String(raw.targetType ?? "");
  const reason = String(raw.reason ?? "");
  const targetId = Number(raw.targetId);
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null;

  if (!isFeedbackTargetType(targetType) || !isFeedbackReason(reason))
    return NextResponse.json({ ok: false, code: "invalid" }, { status: 400 });
  if (!Number.isSafeInteger(targetId) || targetId <= 0)
    return NextResponse.json({ ok: false, code: "invalid" }, { status: 400 });
  if (note && note.length > FEEDBACK_NOTE_MAX)
    return NextResponse.json({ ok: false, code: "invalid" }, { status: 400 });

  const rate = await consumeCommunityRateLimit(user.id, "feedback");
  if (!rate.allowed)
    return NextResponse.json({ ok: false, code: "rate" }, { status: 429 });

  const result = await sendFeedback({
    reporterId: user.id,
    targetType,
    targetId,
    reason,
    note,
  });
  return NextResponse.json(result, {
    status: result.ok ? 200 : 409,
    headers: { "Cache-Control": "no-store" },
  });
}
