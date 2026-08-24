/* Forgot-password integration. Runs only against an isolated database
   (DATABASE_URL must contain kbu-mysql). Covers: the token lifecycle
   (issue -> consume -> replay rejected -> expiry rejected -> new issue
   voids old ones); only the HMAC lands in the DB, never plaintext; the
   forgot route answers registered and unregistered emails identically
   (no registration oracle), and a missing RESEND_API_KEY still fails
   soft with sent=1; after a reset the old password dies and the new
   one logs in. */
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import {
  consumePasswordResetToken,
  hashResetToken,
  isResetTokenFormat,
  issuePasswordResetToken,
} from "../src/lib/auth/password-reset";
import { createEmailUser, findEmailAccount, setUserPassword } from "../src/lib/auth/users";
import { POST as forgotPost } from "../app/api/auth/email/forgot/route";
import { POST as resetPost } from "../app/api/auth/email/reset/route";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run password reset integration outside an isolated kbu-mysql database");
}
process.env.AUTH_SECRET ||= "integration-only-auth-secret-at-least-32-chars";
process.env.USAGE_KEY_PEPPER ||= "integration-only-usage-pepper-at-least-32-characters";
/* The isolated environment never sends real mail; this also covers the
   mailer's not_configured soft-failure path. */
delete process.env.RESEND_API_KEY;

const FORGOT_URL = "https://kimi.builders/api/auth/email/forgot";
const FAKE_IP = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;

function forgotRequest(email: string, origin = "https://kimi.builders"): NextRequest {
  return new Request(FORGOT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
      "x-forwarded-for": FAKE_IP,
    },
    body: `email=${encodeURIComponent(email)}`,
  }) as unknown as NextRequest;
}

const RESET_URL = "https://kimi.builders/api/auth/email/reset";

function resetRequest(token: string, password: string, password2: string): NextRequest {
  return new Request(RESET_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://kimi.builders",
      "x-forwarded-for": FAKE_IP,
    },
    body:
      `token=${encodeURIComponent(token)}` +
      `&password=${encodeURIComponent(password)}` +
      `&password2=${encodeURIComponent(password2)}`,
  }) as unknown as NextRequest;
}

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const email = `reset_${stamp}@example.com`;
  let userId = 0;
  try {
    userId = await createEmailUser(email, "Reset Probe");
    await setUserPassword(userId, await hashPassword("old-password-1"));

    /* ---- Token issue: 64 hex; only the HMAC lands in the DB, never
       plaintext ---- */
    const t1 = await issuePasswordResetToken(userId);
    assert.match(t1, /^[0-9a-f]{64}$/);
    assert.equal(isResetTokenFormat(t1), true);
    assert.equal(isResetTokenFormat("A".repeat(64)), false);
    assert.equal(isResetTokenFormat(t1.slice(0, 63)), false);
    const [rows1] = await pool.query<RowDataPacket[]>(
      "SELECT token_hash, used_at FROM password_reset_tokens WHERE user_id = ?",
      [userId],
    );
    assert.equal(rows1.length, 1);
    assert.equal(rows1[0].token_hash, hashResetToken(t1));
    assert.notEqual(rows1[0].token_hash, t1);
    assert.equal(rows1[0].used_at, null);

    /* ---- Successful consumption -> single use, replay rejected ---- */
    assert.equal(await consumePasswordResetToken(t1), userId);
    assert.equal(await consumePasswordResetToken(t1), null);

    /* ---- A new request voids old tokens ---- */
    const t2 = await issuePasswordResetToken(userId);
    const t3 = await issuePasswordResetToken(userId);
    // Voided by t3's issue.
    assert.equal(await consumePasswordResetToken(t2), null);
    assert.equal(await consumePasswordResetToken(t3), userId);

    /* ---- Expiry rejected ---- */
    const t4 = await issuePasswordResetToken(userId);
    await pool.query(
      `UPDATE password_reset_tokens
       SET expires_at = TIMESTAMPADD(SECOND, -1, UTC_TIMESTAMP())
       WHERE token_hash = ?`,
      [hashResetToken(t4)],
    );
    assert.equal(await consumePasswordResetToken(t4), null);

    /* ---- Malformed / unknown tokens ---- */
    assert.equal(await consumePasswordResetToken("not-a-token"), null);
    assert.equal(await consumePasswordResetToken("f".repeat(64)), null);

    /* ---- Reset write path: old password dead after the hash swap, the
       new one verifies ---- */
    await setUserPassword(userId, await hashPassword("new-password-2"));
    const account = await findEmailAccount(email);
    assert.ok(account?.passwordHash);
    assert.equal(await verifyPassword("new-password-2", account.passwordHash), true);
    assert.equal(await verifyPassword("old-password-1", account.passwordHash), false);

    /* ---- Forgot route: registered / unregistered branches answer
       identically (no registration oracle) ---- */
    const registered = await forgotPost(forgotRequest(email));
    const unregistered = await forgotPost(forgotRequest(`nobody_${stamp}@example.com`));
    for (const res of [registered, unregistered]) {
      assert.equal(res.status, 303);
      assert.equal(
        res.headers.get("location"),
        "https://kimi.builders/login?mode=forgot&sent=1",
      );
    }
    /* The registered branch really completed the issue (missing
       RESEND_API_KEY -> soft mail failure, still sent=1). */
    const [rows2] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
      [userId],
    );
    assert.equal(Number(rows2[0].n), 1);

    /* ---- Cross-origin requests rejected ---- */
    const crossSite = await forgotPost(forgotRequest(email, "https://evil.example"));
    assert.equal(crossSite.status, 303);
    assert.ok(crossSite.headers.get("location")?.includes("error=invalid_origin"));

    /* ---- Reset route error branches (the success branch plants a
       cookie — covered by HTTP-level QA) ---- */
    const badToken = await resetPost(resetRequest("f".repeat(64), "valid-password-9", "valid-password-9"));
    assert.equal(badToken.status, 303);
    const badLoc = badToken.headers.get("location") ?? "";
    assert.ok(badLoc.includes("mode=reset"));
    assert.ok(badLoc.includes("error=invalid_token"));
    assert.ok(badLoc.includes(`token=${"f".repeat(64)}`));

    /* A password mismatch never consumes the token: mismatch first,
       then consume normally with the same token. */
    const live = await issuePasswordResetToken(userId);
    const mismatch = await resetPost(resetRequest(live, "valid-password-9", "different-1"));
    assert.equal(mismatch.status, 303);
    assert.ok(mismatch.headers.get("location")?.includes("error=password_mismatch"));
    assert.equal(await consumePasswordResetToken(live), userId);

    console.log("password reset integration: passed");
  } finally {
    if (userId) await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
