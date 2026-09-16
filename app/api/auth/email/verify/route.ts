/* GET /api/auth/email/verify?token= — one-time confirmation link from
   the verification / email-change mail. GET-with-bearer-token is the
   standard pattern here (the token IS the capability; nothing else in
   the request matters), same trust model as the reset link.
   purpose=verify: stamp email_verified_at (idempotent — already
   verified stays verified). purpose=change: atomically swap the login
   email, mark it verified, and sign out every other device. Outcomes
   land on /settings with a query flag the account tab renders. */
import { NextResponse, type NextRequest } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { consumeEmailToken } from "@/src/lib/auth/email-verify";
import { destroyOtherSessions } from "@/src/lib/auth/session";
import { getPool } from "@/src/lib/db";
import type { ResultSetHeader } from "mysql2";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const origin = canonicalOrigin(req);
  const to = (flag: string) => {
    const url = new URL("/settings", origin);
    url.searchParams.set(flag, "1");
    return NextResponse.redirect(url, 303);
  };

  const consumed = await consumeEmailToken(token);
  if (!consumed) return to("verifyFailed");

  const pool = getPool();
  if (consumed.purpose === "verify") {
    await pool.query(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ? AND deleted_at IS NULL",
      [consumed.userId],
    );
    return to("verified");
  }

  if (!consumed.newEmail) return to("verifyFailed");
  /* Change-confirm: the new address just proved its mailbox, so it
     lands verified. Other devices lose their sessions — the email is
     half of the account's recovery, treat the flip as a security
     event. */
  const [res] = await pool.query<ResultSetHeader>(
    "UPDATE users SET email = ?, email_verified_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL",
    [consumed.newEmail, consumed.userId],
  );
  if (res.affectedRows !== 1) return to("verifyFailed");
  await destroyOtherSessions(consumed.userId);
  return to("emailChanged");
}
