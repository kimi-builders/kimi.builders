/* provider 头像同步防覆盖集成测试。只在隔离库运行(DATABASE_URL 必须含 kbu-mysql)。
   覆盖:新建用户落 provider 头像;再次登录同步新 provider 头像(外部 URL 可覆盖);
   站内自传头像(CDN URL)不被登录冲掉;清空后(恢复默认)下次登录重新同步。 */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import { findOrCreateUser } from "../src/lib/auth/users";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run auth avatar integration outside an isolated kbu-mysql database");
}

const GH_AVATAR_1 = "https://avatars.githubusercontent.com/u/10001?v=4";
const GH_AVATAR_2 = "https://avatars.githubusercontent.com/u/10001?v=8";
const OWN_AVATAR = "https://cdn.kimi.builders/avatar/202608/0123456789abcdef.webp";

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const ghId = `gh_avatar_${stamp}`;
  let uid = -1;
  const readAvatar = async (): Promise<string> => {
    const [rows] = await pool.query(
      "SELECT avatar_url FROM users WHERE id = ? LIMIT 1",
      [uid],
    );
    return String((rows as { avatar_url?: string }[])[0]?.avatar_url ?? "");
  };
  try {
    const profile = (avatarUrl: string) => ({
      providerAccountId: ghId,
      handle: `avatar_${stamp}`,
      name: "Avatar Sync",
      email: "",
      emailVerified: false,
      avatarUrl,
    });

    /* 新建:provider 头像直接落库 */
    uid = await findOrCreateUser("github", profile(GH_AVATAR_1));
    assert.equal(await readAvatar(), GH_AVATAR_1);

    /* 再次登录:当前头像仍是外部 URL(未自定义)→ 同步新 provider 头像 */
    assert.equal(await findOrCreateUser("github", profile(GH_AVATAR_2)), uid);
    assert.equal(await readAvatar(), GH_AVATAR_2);

    /* 用户站内上传头像(CDN URL)→ 后续登录不冲掉 */
    await pool.query("UPDATE users SET avatar_url = ? WHERE id = ?", [OWN_AVATAR, uid]);
    assert.equal(await findOrCreateUser("github", profile(GH_AVATAR_1)), uid);
    assert.equal(await readAvatar(), OWN_AVATAR);

    /* 恢复默认(清空 avatar_url)→ 下次登录重新同步 provider 头像 */
    await pool.query("UPDATE users SET avatar_url = '' WHERE id = ?", [uid]);
    assert.equal(await findOrCreateUser("github", profile(GH_AVATAR_2)), uid);
    assert.equal(await readAvatar(), GH_AVATAR_2);

    /* provider 不再给头像(空串)→ 保持现状,不清空 */
    assert.equal(await findOrCreateUser("github", profile("")), uid);
    assert.equal(await readAvatar(), GH_AVATAR_2);

    console.log("auth avatar integration: passed");
  } finally {
    if (uid > 0) await pool.query("DELETE FROM users WHERE id = ?", [uid]);
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
