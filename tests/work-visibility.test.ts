import assert from "node:assert/strict";
import test from "node:test";
import { featuredWorksQuery } from "../src/lib/featured";
import { userWorksCountQuery } from "../src/lib/share-posters";
import {
  canViewWork,
  relatedWorksQuery,
  worksPageQuery,
} from "../src/lib/works";

/* works.visibility(20260828_work_visibility)的 SQL 口径:
   匿名/访客只见 public;登录浏览者额外放行自己的私密条目(同 posts feed)。
   公共上下文(相关作品/精选/统计/海报)恒 public-only。 */

test("worksPageQuery: anonymous sees public, non-hidden only (wall and awesome)", () => {
  const wall = worksPageQuery({ source: "site" });
  assert.match(wall.sql, /WHERE w\.visibility = 'public' AND w\.hidden_at IS NULL AND w\.source = 'site'/);
  assert.deepEqual(wall.args, []);
  /* Awesome 清单(20260906):推荐条目 ∪ 作者勾选「同时收录」的成员作品 */
  const awesome = worksPageQuery({ source: "awesome" });
  assert.match(awesome.sql, /WHERE w\.visibility = 'public' AND w\.hidden_at IS NULL AND \(w\.source = 'awesome' OR w\.also_awesome = 1\)/);
  assert.deepEqual(awesome.args, []);
});

test("worksPageQuery: viewer additionally sees their own private/hidden entries", () => {
  const { sql, args } = worksPageQuery({ source: "site", viewerId: 7 });
  assert.match(sql, /\(w\.visibility = 'public' OR w\.user_id = \?\)/);
  assert.match(sql, /\(w\.hidden_at IS NULL OR w\.user_id = \?\)/);
  assert.deepEqual(args, [7, 7]);
  /* 可见性谓词在最前,其余过滤/游标依次排后 */
  const both = worksPageQuery({ source: "awesome", viewerId: 7, kinds: ["app"], after: "9" });
  assert.deepEqual(both.args, [7, 7, "app", 9]);
});

test("relatedWorksQuery is a public context (never leaks private/hidden works)", () => {
  const q = relatedWorksQuery({ id: 9, userId: 3, agents: ["kimi"] });
  assert.ok(q);
  assert.match(q.sql, /w\.id <> \? AND w\.visibility = 'public' AND w\.hidden_at IS NULL AND \(/);
});

test("featuredWorksQuery excludes private works from featured slots", () => {
  const { sql } = featuredWorksQuery(3);
  assert.match(sql, /w\.featured_at IS NOT NULL AND w\.visibility = 'public'/);
});

test("userWorksCountQuery: visitor counts public only, self counts all", () => {
  const visitor = userWorksCountQuery(3);
  assert.match(visitor.sql, /AND visibility = 'public'/);
  assert.deepEqual(visitor.args, [3]);
  const self = userWorksCountQuery(3, true);
  assert.doesNotMatch(self.sql, /visibility/);
  assert.deepEqual(self.args, [3]);
});

test("canViewWork: public for anyone, private only for its author", () => {
  const pub = { visibility: "public", userId: 3, hiddenAt: null };
  assert.equal(canViewWork(pub, null), true);
  assert.equal(canViewWork(pub, { id: 99, role: "member" }), true);
  const priv = { visibility: "private", userId: 3, hiddenAt: null };
  assert.equal(canViewWork(priv, { id: 3, role: "member" }), true);
  assert.equal(canViewWork(priv, { id: 99, role: "member" }), false);
  assert.equal(canViewWork(priv, null), false);
  /* 编辑收录条目(user_id NULL)恒 public;即便误标 private 也不对任何人放行 */
  assert.equal(
    canViewWork({ visibility: "private", userId: null, hiddenAt: null }, { id: 3, role: "member" }),
    false,
  );
});

test("canViewWork: hidden only for its author or moderators", () => {
  const hidden = { visibility: "public", userId: 3, hiddenAt: new Date() };
  assert.equal(canViewWork(hidden, { id: 3, role: "member" }), true);
  assert.equal(canViewWork(hidden, { id: 9, role: "mod" }), true);
  assert.equal(canViewWork(hidden, { id: 9, role: "admin" }), true);
  assert.equal(canViewWork(hidden, { id: 9, role: "member" }), false);
  assert.equal(canViewWork(hidden, null), false);
});
