/* 邮箱注册/登录集成测试。只在隔离库运行(DATABASE_URL 必须含 kbu-mysql)。
   覆盖:注册建号→设密→登录校验→会话签发;重复邮箱拒绝;错误密码拒绝;
   OAuth-only 账号(无密码散列)不能走邮箱登录。 */
import assert from "node:assert/strict";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { createSessionToken, verifySessionToken } from "../src/lib/auth/session";
import {
  createEmailUser,
  findEmailAccount,
  setUserPassword,
} from "../src/lib/auth/users";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run auth integration outside an isolated kbu-mysql database");
}
process.env.AUTH_SECRET ||= "integration-only-auth-secret-at-least-32-chars";

async function main() {
  const pool = getPool();
  const email = `auth_${Date.now()}@example.com`;
  let userId = 0;
  try {
    // 注册
    userId = await createEmailUser(email, "Auth Probe");
    await setUserPassword(userId, await hashPassword("hunter2-hunter2"));

    const account = await findEmailAccount(email);
    assert.ok(account);
    assert.equal(account.id, userId);
    assert.ok(account.passwordHash);
    assert.equal(await verifyPassword("hunter2-hunter2", account.passwordHash!), true);
    assert.equal(await verifyPassword("nope-nope", account.passwordHash!), false);

    // handle 从昵称派生
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT handle, name, email FROM users WHERE id = ?",
      [userId],
    );
    assert.equal(rows[0].handle, "auth_probe");
    assert.equal(rows[0].email, email);

    // 会话签发/校验
    const token = createSessionToken(userId);
    assert.equal(verifySessionToken(token), userId);
    assert.equal(verifySessionToken(`${token}x`), null);

    // 重复邮箱唯一约束
    await assert.rejects(createEmailUser(email), /Duplicate entry/);

    // OAuth-only 账号(无密码散列)走不了邮箱登录
    const oauthEmail = `oauth_${Date.now()}@example.com`;
    await pool.query<ResultSetHeader>(
      "INSERT INTO users (handle, name, email) VALUES (?, 'OAuth Only', ?)",
      [`oauth_only_${Date.now()}`, oauthEmail],
    );
    const oauthAccount = await findEmailAccount(oauthEmail);
    assert.ok(oauthAccount);
    assert.equal(oauthAccount.passwordHash, null); // 路由层会因此返回 bad_credentials

    console.log("auth email integration: passed");
  } finally {
    if (userId) await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    await pool.query("DELETE FROM users WHERE name = 'OAuth Only'");
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
