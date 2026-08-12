import assert from "node:assert/strict";
import test from "node:test";
import {
  activeMute,
  adminUsersQuery,
  canChangeRole,
  canModerate,
  isAdmin,
  moderationContentQuery,
  MUTE_FOREVER,
  muteUntilFor,
} from "../src/lib/moderation";

/* 角色判定:全站唯一口径(canModerate 收编自 featured,isAdmin 扩展)。 */
test("role helpers: canModerate covers admin/mod, isAdmin only admin", () => {
  assert.equal(canModerate("admin"), true);
  assert.equal(canModerate("mod"), true);
  assert.equal(canModerate("member"), false);
  assert.equal(canModerate(null), false);
  assert.equal(canModerate(undefined), false);
  assert.equal(isAdmin("admin"), true);
  assert.equal(isAdmin("mod"), false);
  assert.equal(isAdmin("member"), false);
});

test("muteUntilFor: day durations shift from now, forever uses the sentinel", () => {
  const now = new Date("2026-08-30T00:00:00Z");
  const d7 = muteUntilFor(7, now);
  assert.ok(d7 instanceof Date);
  assert.equal((d7 as Date).toISOString(), "2026-09-06T00:00:00.000Z");
  assert.equal(muteUntilFor("forever", now), MUTE_FOREVER);
  assert.equal(muteUntilFor(0, now), null);
  assert.equal(muteUntilFor(-3, now), null);
  assert.equal(muteUntilFor(999, now), null);
  assert.equal(muteUntilFor(1.5, now), null);
});

test("activeMute: null/past are free, future is muted", () => {
  assert.equal(activeMute(null), null);
  assert.ok(activeMute(new Date(Date.now() + 3600_000)));
  assert.equal(activeMute(new Date("2020-01-01T00:00:00Z")), null);
  assert.ok(activeMute(MUTE_FOREVER));
});

test("canChangeRole: only admin, never on admins, member<->mod only, not self", () => {
  const base = { actorRole: "admin", actorId: 1, targetRole: "member", targetId: 2, nextRole: "mod" };
  assert.equal(canChangeRole(base), true);
  assert.equal(canChangeRole({ ...base, targetRole: "mod", nextRole: "member" }), true);
  assert.equal(canChangeRole({ ...base, actorRole: "mod" }), false);
  assert.equal(canChangeRole({ ...base, actorRole: "member" }), false);
  /* admin 不可被降/被改 */
  assert.equal(canChangeRole({ ...base, targetRole: "admin" }), false);
  assert.equal(canChangeRole({ ...base, actorId: 2, targetId: 2 }), false);
  assert.equal(canChangeRole({ ...base, nextRole: "admin" }), false);
  assert.equal(canChangeRole({ ...base, nextRole: "member" }), true);
});

test("adminUsersQuery: search matches handle or name, cursor paginates ascending", () => {
  const plain = adminUsersQuery({});
  assert.equal(plain.sql.includes("WHERE"), false);
  assert.match(plain.sql, /ORDER BY u\.id ASC/);
  const searched = adminUsersQuery({ q: "akl" });
  assert.match(searched.sql, /u\.handle LIKE \? OR u\.name LIKE \?/);
  assert.deepEqual(searched.args, ["%akl%", "%akl%"]);
  const paged = adminUsersQuery({ q: "akl", after: 40 });
  assert.match(paged.sql, /u\.id > \?/);
  assert.deepEqual(paged.args, ["%akl%", "%akl%", 40]);
});

test("moderationContentQuery: state filters per type; works have no deleted state", () => {
  const all = moderationContentQuery({ type: "post", state: "all" });
  assert.equal(all.sql.includes("hidden_at IS NOT NULL"), false);
  const hidden = moderationContentQuery({ type: "comment", state: "hidden" });
  assert.match(hidden.sql, /WHERE x\.hidden_at IS NOT NULL/);
  const deleted = moderationContentQuery({ type: "post", state: "deleted" });
  assert.match(deleted.sql, /x\.deleted_at IS NOT NULL/);
  const workDeleted = moderationContentQuery({ type: "work", state: "deleted" });
  assert.equal(workDeleted.sql.includes("deleted_at"), false);
  /* 管理面不过滤可见性(治理权高于可见性):私密内容在 /admin 可见可处置 */
  assert.equal(all.sql.includes("visibility ="), false);
  const paged = moderationContentQuery({ type: "work", state: "hidden", after: 12 });
  assert.match(paged.sql, /x\.hidden_at IS NOT NULL AND x\.id < \?/);
  assert.deepEqual(paged.args, [12]);
});
