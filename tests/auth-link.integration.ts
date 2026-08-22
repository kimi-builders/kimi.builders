/* OAuth linking / auto-merge integration. Runs only against an isolated
   database (DATABASE_URL must contain kbu-mysql). Covers: post-login
   linking (new / idempotent / taken rejected); verified-email login
   auto-merges; unverified emails never merge (a separate account is
   still created); logging in again with a bound provider lands on the
   same account. */
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
    /* The email-registered primary account + one unrelated account. */
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

    // Linking: unbound -> ok; the same person relinking is idempotent;
    // bound to someone else -> taken (never stolen).
    assert.equal(await findLinkedUserId("github", ghId), null);
    assert.equal(await linkProviderAccount(ownerId, "github", ghProfile), "ok");
    assert.equal(await findLinkedUserId("github", ghId), ownerId);
    assert.equal(await linkProviderAccount(ownerId, "github", ghProfile), "ok");
    assert.equal(await linkProviderAccount(otherId, "github", ghProfile), "taken");

    // Verified-email auto-merge: Google login with the same email lands
    // on the primary account with the provider attached.
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

    // Logging in again with a bound provider -> the same account.
    assert.equal(await findOrCreateUser("github", ghProfile), ownerId);

    // Unverified emails never merge: same email with
    // emailVerified=false -> a new user.
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
