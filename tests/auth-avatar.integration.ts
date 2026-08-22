/* Provider avatar sync overwrite-guard integration. Runs only against
   an isolated database (DATABASE_URL must contain kbu-mysql). Covers:
   new users store the provider avatar; the next login syncs a new one
   (external URLs are overridable); on-site uploaded avatars (CDN URL)
   survive logins; after a reset-to-default, the next login re-syncs. */
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

    /* New user: the provider avatar lands directly. */
    uid = await findOrCreateUser("github", profile(GH_AVATAR_1));
    assert.equal(await readAvatar(), GH_AVATAR_1);

    /* Next login: the current avatar is still an external URL (not
       customized) -> the new provider avatar syncs. */
    assert.equal(await findOrCreateUser("github", profile(GH_AVATAR_2)), uid);
    assert.equal(await readAvatar(), GH_AVATAR_2);

    /* User uploaded an avatar on site (CDN URL) -> later logins never
       clobber it. */
    await pool.query("UPDATE users SET avatar_url = ? WHERE id = ?", [OWN_AVATAR, uid]);
    assert.equal(await findOrCreateUser("github", profile(GH_AVATAR_1)), uid);
    assert.equal(await readAvatar(), OWN_AVATAR);

    /* Reset to default (avatar_url cleared) -> the next login re-syncs
       the provider avatar. */
    await pool.query("UPDATE users SET avatar_url = '' WHERE id = ?", [uid]);
    assert.equal(await findOrCreateUser("github", profile(GH_AVATAR_2)), uid);
    assert.equal(await readAvatar(), GH_AVATAR_2);

    /* Provider stops offering an avatar (empty) -> keep the current one,
       never clear it. */
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
