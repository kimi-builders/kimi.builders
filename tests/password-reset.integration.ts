/* 忘记密码集成测试。只在隔离库运行(DATABASE_URL 必须含 kbu-mysql)。
   覆盖:token 生命周期(生成→消费→重放拒绝→过期拒绝→新签发作废旧);
   库中只存 HMAC 不落明文;forgot 路由对注册/未注册邮箱响应一致(不泄露注册状态),
   且 RESEND_API_KEY 缺失时发信软失败仍回 sent=1;换密后旧密码失效、新密码可登录。 */
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
/* 隔离环境绝不发真邮件;顺带覆盖 mailer not_configured 软失败路径 */
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

    /* ---- token 生成:64 hex;库中只存 HMAC,不落明文 ---- */
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

    /* ---- 消费成功 → 单次使用,重放拒绝 ---- */
    assert.equal(await consumePasswordResetToken(t1), userId);
    assert.equal(await consumePasswordResetToken(t1), null);

    /* ---- 新请求作废旧 token ---- */
    const t2 = await issuePasswordResetToken(userId);
    const t3 = await issuePasswordResetToken(userId);
    assert.equal(await consumePasswordResetToken(t2), null); // 已被 t3 签发作废
    assert.equal(await consumePasswordResetToken(t3), userId);

    /* ---- 过期拒绝 ---- */
    const t4 = await issuePasswordResetToken(userId);
    await pool.query(
      `UPDATE password_reset_tokens
       SET expires_at = TIMESTAMPADD(SECOND, -1, UTC_TIMESTAMP())
       WHERE token_hash = ?`,
      [hashResetToken(t4)],
    );
    assert.equal(await consumePasswordResetToken(t4), null);

    /* ---- 畸形 / 未知 token ---- */
    assert.equal(await consumePasswordResetToken("not-a-token"), null);
    assert.equal(await consumePasswordResetToken("f".repeat(64)), null);

    /* ---- reset 写路径:换散列后旧密码失效、新密码可验 ---- */
    await setUserPassword(userId, await hashPassword("new-password-2"));
    const account = await findEmailAccount(email);
    assert.ok(account?.passwordHash);
    assert.equal(await verifyPassword("new-password-2", account.passwordHash), true);
    assert.equal(await verifyPassword("old-password-1", account.passwordHash), false);

    /* ---- forgot 路由:注册 / 未注册两个分支响应一致(不泄露注册状态)---- */
    const registered = await forgotPost(forgotRequest(email));
    const unregistered = await forgotPost(forgotRequest(`nobody_${stamp}@example.com`));
    for (const res of [registered, unregistered]) {
      assert.equal(res.status, 303);
      assert.equal(
        res.headers.get("location"),
        "https://kimi.builders/login?mode=forgot&sent=1",
      );
    }
    /* 注册分支确实走完了签发(RESEND_API_KEY 缺失 → 发信软失败,仍 sent=1) */
    const [rows2] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
      [userId],
    );
    assert.equal(Number(rows2[0].n), 1);

    /* ---- 跨源请求拒绝 ---- */
    const crossSite = await forgotPost(forgotRequest(email, "https://evil.example"));
    assert.equal(crossSite.status, 303);
    assert.ok(crossSite.headers.get("location")?.includes("error=invalid_origin"));

    /* ---- reset 路由错误分支(成功分支要种 cookie,由 HTTP 级 QA 覆盖)---- */
    const badToken = await resetPost(resetRequest("f".repeat(64), "valid-password-9", "valid-password-9"));
    assert.equal(badToken.status, 303);
    const badLoc = badToken.headers.get("location") ?? "";
    assert.ok(badLoc.includes("mode=reset"));
    assert.ok(badLoc.includes("error=invalid_token"));
    assert.ok(badLoc.includes(`token=${"f".repeat(64)}`));

    /* 密码不一致不消费 token:先 mismatch,再凭同一 token 正常消费 */
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
