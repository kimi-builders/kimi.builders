/* 设置页「账号」:改密码 + OAuth 解绑集成测试。只在隔离库运行
   (DATABASE_URL 必须含 kbu-mysql)。覆盖:
   - getUserPasswordHash:无密码 → null;设置后 → 哈希,新密码可验证
   - unlinkProviderAccount:无密码 + 单绑定 → last_method(行保留);
     设密码后 → ok;重复解绑 → not_linked;
     无密码 + 双绑定 → 解一个 ok,剩下一个再解 → last_method */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import {
  createEmailUser,
  getUserPasswordHash,
  linkProviderAccount,
  setUserPassword,
  unlinkProviderAccount,
} from "../src/lib/auth/users";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error(
    "Refusing to run settings account integration outside an isolated kbu-mysql database",
  );
}

const profile = (id: string) => ({
  providerAccountId: id,
  handle: "acct",
  name: "Acct",
  email: null,
  emailVerified: false,
  avatarUrl: "",
});

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const createdUserIds: number[] = [];
  try {
    /* —— 改密码链路:无 → 有 → 新密码可登录 —— */
    const pwUser = await createEmailUser(`pw_${stamp}@example.com`, "Pw User");
    createdUserIds.push(pwUser);
    assert.equal(await getUserPasswordHash(pwUser), null);

    await setUserPassword(pwUser, await hashPassword("old-secret-1"));
    const firstHash = await getUserPasswordHash(pwUser);
    assert.ok(firstHash !== null);
    assert.equal(await verifyPassword("old-secret-1", firstHash), true);
    assert.equal(await verifyPassword("wrong", firstHash), false);

    await setUserPassword(pwUser, await hashPassword("new-secret-2"));
    const secondHash = await getUserPasswordHash(pwUser);
    assert.ok(secondHash !== null && secondHash !== firstHash);
    assert.equal(await verifyPassword("new-secret-2", secondHash), true);
    assert.equal(await verifyPassword("old-secret-1", secondHash), false);

    /* —— 解绑守卫:无密码 + 单绑定 = 唯一登录方式 —— */
    const solo = await createEmailUser(`solo_${stamp}@example.com`, "Solo");
    createdUserIds.push(solo);
    assert.equal(
      await linkProviderAccount(solo, "github", profile(`gh_solo_${stamp}`)),
      "ok",
    );
    assert.equal(await unlinkProviderAccount(solo, "github"), "last_method");
    /* 行还在,没真删 */
    const [soloRows] = await pool.query(
      "SELECT COUNT(*) AS n FROM oauth_accounts WHERE user_id = ?",
      [solo],
    );
    assert.equal(Number((soloRows as { n: number }[])[0].n), 1);

    /* 设了密码 → 可解;再解 → not_linked */
    await setUserPassword(solo, await hashPassword("solo-secret-1"));
    assert.equal(await unlinkProviderAccount(solo, "github"), "ok");
    assert.equal(await unlinkProviderAccount(solo, "github"), "not_linked");

    /* —— 无密码 + 双绑定:解一个 ok,最后一个仍拒 —— */
    const dual = await createEmailUser(`dual_${stamp}@example.com`, "Dual");
    createdUserIds.push(dual);
    assert.equal(
      await linkProviderAccount(dual, "github", profile(`gh_dual_${stamp}`)),
      "ok",
    );
    assert.equal(
      await linkProviderAccount(dual, "google", profile(`g_dual_${stamp}`)),
      "ok",
    );
    assert.equal(await unlinkProviderAccount(dual, "github"), "ok");
    assert.equal(await unlinkProviderAccount(dual, "google"), "last_method");
    const [dualRows] = await pool.query(
      "SELECT provider FROM oauth_accounts WHERE user_id = ?",
      [dual],
    );
    assert.deepEqual(
      (dualRows as { provider: string }[]).map((r) => r.provider),
      ["google"],
    );

    console.log("settings account integration: passed");
  } finally {
    for (const id of createdUserIds)
      await pool.query("DELETE FROM users WHERE id = ?", [id]);
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
