/* Settings "account" tab: change-password + OAuth unlink integration.
   Runs only against an isolated database (DATABASE_URL must contain
   kbu-mysql). Covers: getUserPasswordHash (no password -> null; set ->
   hash, new password verifies); unlinkProviderAccount (no password +
   single binding -> last_method, row kept; after setting a password ->
   ok; repeat unlink -> not_linked; no password + two bindings -> one
   unlink ok, the last one -> last_method). */
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
    /* Change-password chain: none -> set -> new password logs in. */
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

    /* Unlink guard: no password + single binding = the only login
       method. */
    const solo = await createEmailUser(`solo_${stamp}@example.com`, "Solo");
    createdUserIds.push(solo);
    assert.equal(
      await linkProviderAccount(solo, "github", profile(`gh_solo_${stamp}`)),
      "ok",
    );
    assert.equal(await unlinkProviderAccount(solo, "github"), "last_method");
    /* The row survives — not really deleted. */
    const [soloRows] = await pool.query(
      "SELECT COUNT(*) AS n FROM oauth_accounts WHERE user_id = ?",
      [solo],
    );
    assert.equal(Number((soloRows as { n: number }[])[0].n), 1);

    /* Password set -> unlinkable; unlink again -> not_linked. */
    await setUserPassword(solo, await hashPassword("solo-secret-1"));
    assert.equal(await unlinkProviderAccount(solo, "github"), "ok");
    assert.equal(await unlinkProviderAccount(solo, "github"), "not_linked");

    /* No password + two bindings: one unlink ok, the last one still
       refused. */
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
