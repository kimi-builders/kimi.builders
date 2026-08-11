/* OAuth 绑定/自动并号集成测试。只在隔离库运行(DATABASE_URL 必须含 kbu-mysql)。
   覆盖:登录后绑定(新建/幂等/抢绑拒绝);已验证邮箱登录自动并号;
   未验证邮箱不并号(仍建小号);已绑 provider 再次登录落同一账号。 */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import {
  createEmailUser,
  findLinkedUserId,
  findOrCreateUser,
  linkProviderAccount,
} from "../src/lib/auth/users";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run auth link integration outside an isolated kbu-mysql database");
}

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const email = `link_${stamp}@example.com`;
  const ghId = `gh_${stamp}`;
  const gId = `g_${stamp}`;
  const createdUserIds: number[] = [];
  try {
    /* 邮箱注册的主账号 + 一个无关账号 */
    const ownerId = await createEmailUser(email, "Link Owner");
    createdUserIds.push(ownerId);
    const otherId = await createEmailUser(`other_${stamp}@example.com`, "Other");
    createdUserIds.push(otherId);

    const ghProfile = {
      providerAccountId: ghId,
      handle: "linker",
      name: "Linker",
      email,
      emailVerified: true,
      avatarUrl: "",
    };

    // 绑定:未绑 → ok;同人再绑幂等;绑给别人 → taken(不抢绑)
    assert.equal(await findLinkedUserId("github", ghId), null);
    assert.equal(await linkProviderAccount(ownerId, "github", ghProfile), "ok");
    assert.equal(await findLinkedUserId("github", ghId), ownerId);
    assert.equal(await linkProviderAccount(ownerId, "github", ghProfile), "ok");
    assert.equal(await linkProviderAccount(otherId, "github", ghProfile), "taken");

    // 已验证邮箱自动并号:Google 登录同邮箱 → 落回主账号并挂上 provider
    const gProfile = {
      providerAccountId: gId,
      handle: "linker",
      name: "Linker",
      email,
      emailVerified: true,
      avatarUrl: "",
    };
    assert.equal(await findOrCreateUser("google", gProfile), ownerId);
    assert.equal(await findLinkedUserId("google", gId), ownerId);

    // 已绑 provider 再次登录 → 同一账号
    assert.equal(await findOrCreateUser("github", ghProfile), ownerId);

    // 未验证邮箱不并号:同邮箱但 emailVerified=false → 新建用户
    const freshId = await findOrCreateUser("google", {
      providerAccountId: `g_new_${stamp}`,
      handle: "newbie",
      name: "Newbie",
      email,
      emailVerified: false,
      avatarUrl: "",
    });
    assert.notEqual(freshId, ownerId);
    createdUserIds.push(freshId);

    console.log("auth link integration: passed");
  } finally {
    for (const id of createdUserIds) await pool.query("DELETE FROM users WHERE id = ?", [id]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
