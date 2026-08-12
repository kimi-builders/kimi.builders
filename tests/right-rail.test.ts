import assert from "node:assert/strict";
import test from "node:test";
import { railFor } from "../app/(app)/_components/right-rail";
import { relatedPostsQuery } from "../src/lib/posts";
import { awesomeSourceStatsQuery, relatedWorksQuery } from "../src/lib/works";

/* ---- 右栏注册表 railFor:路由段 → 右栏上下文 + 主列宽度 ---- */

test("railFor: community feed and unlisted routes fall back to community rail", () => {
  assert.deepEqual(railFor("/community"), { kind: "community", id: null, wide: false });
  /* 未列出路由(/settings、/demo-night、/community 子页)同改版前;/works 有专属 rail */
  assert.deepEqual(railFor("/settings"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/demo-night"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/works"), { kind: "works", id: null, wide: false });
  assert.deepEqual(railFor("/community/new"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/community/notifications"), { kind: "community", id: null, wide: false });
  /* 头缺失时 layout 传 "/" */
  assert.deepEqual(railFor("/"), { kind: "community", id: null, wide: false });
});

test("railFor: post/work detail get contextual rails with route id", () => {
  assert.deepEqual(railFor("/community/123"), { kind: "post", id: 123, wide: false });
  assert.deepEqual(railFor("/works/7"), { kind: "work", id: 7, wide: false });
  /* 尾斜杠归一 */
  assert.deepEqual(railFor("/community/123/"), { kind: "post", id: 123, wide: false });
  /* /edit 子页不是详情 */
  assert.deepEqual(railFor("/community/123/edit"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/works/7/edit"), { kind: "community", id: null, wide: false });
  /* 非数字 id 不构成详情 */
  assert.deepEqual(railFor("/community/abc"), { kind: "community", id: null, wide: false });
});

test("railFor: awesome / blog / learn sections", () => {
  assert.deepEqual(railFor("/awesome"), { kind: "awesome", id: null, wide: false });
  assert.deepEqual(railFor("/blog"), { kind: "blog", id: null, wide: false });
  /* 文章详情同 rail */
  assert.deepEqual(railFor("/blog/2026-08-letter"), { kind: "blog", id: null, wide: false });
  /* admin 编辑页回落默认 */
  assert.deepEqual(railFor("/blog/admin/new"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/blog/admin/x/edit"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/learn"), { kind: "learn", id: null, wide: false });
  assert.deepEqual(railFor("/learn/getting-started"), { kind: "learn", id: null, wide: false });
});

test("railFor: usage and profiles have no rail and a wide canvas", () => {
  assert.deepEqual(railFor("/usage"), { kind: "none", id: null, wide: true });
  assert.deepEqual(railFor("/usage/device"), { kind: "none", id: null, wide: true });
  assert.deepEqual(railFor("/usage/leaderboard"), { kind: "none", id: null, wide: true });
  assert.deepEqual(railFor("/u/aklman"), { kind: "none", id: null, wide: true });
});

/* ---- 相关帖子:同板块近期公开帖,排除本帖 ---- */

test("relatedPostsQuery: same category, public only, excludes self, newest first", () => {
  const { sql, args } = relatedPostsQuery(42, "showcase");
  assert.match(sql, /p\.deleted_at IS NULL/);
  /* 右栏是公共上下文:私密帖不借右栏漏出 */
  assert.match(sql, /p\.visibility = 'public'/);
  assert.match(sql, /p\.category = \?/);
  assert.match(sql, /p\.id <> \?/);
  assert.match(sql, /ORDER BY p\.created_at DESC, p\.id DESC LIMIT 5/);
  assert.deepEqual(args, ["showcase", 42]);
});

test("relatedPostsQuery: limit is clamped and inlined as integer", () => {
  assert.match(relatedPostsQuery(1, "general", 0).sql, /LIMIT 1/);
  assert.match(relatedPostsQuery(1, "general", 99).sql, /LIMIT 20/);
  assert.match(relatedPostsQuery(1, "general", 3.9).sql, /LIMIT 3/);
});

/* ---- 相关作品:同作者或同 Agent,同作者优先 ---- */

test("relatedWorksQuery: author OR agent overlap, author first, excludes self", () => {
  const q = relatedWorksQuery({ id: 9, userId: 3, agents: ["kimi", "claude"] });
  assert.ok(q);
  const { sql, args } = q;
  assert.match(sql, /w\.id <> \?/);
  assert.match(sql, /w\.user_id = \?/);
  assert.match(sql, /JSON_OVERLAPS\(w\.agents, \?\)/);
  /* 同作者优先,其余按新到旧;order 的 ? 跟在 where 之后按序绑定 */
  assert.match(sql, /ORDER BY \(w\.user_id = \?\) DESC, w\.id DESC LIMIT 5/);
  assert.deepEqual(args, [9, 3, '["kimi","claude"]', 3]);
});

test("relatedWorksQuery: external entry (no author) matches by agent only", () => {
  const q = relatedWorksQuery({ id: 9, userId: null, agents: ["kimi"] });
  assert.ok(q);
  assert.match(q.sql, /JSON_OVERLAPS\(w\.agents, \?\)/);
  assert.doesNotMatch(q.sql, /w\.user_id = \?/);
  assert.deepEqual(q.args, [9, '["kimi"]']);
});

test("relatedWorksQuery: no author and no agents → null (caller skips the query)", () => {
  assert.equal(relatedWorksQuery({ id: 9, userId: null, agents: [] }), null);
});

/* ---- /awesome 来源统计 ---- */

test("awesomeSourceStatsQuery: group by source for site/external counts (public only)", () => {
  const { sql, args } = awesomeSourceStatsQuery();
  assert.match(sql, /SELECT w\.source, COUNT\(\*\) AS n FROM works w WHERE w\.visibility = 'public' GROUP BY w\.source/);
  assert.deepEqual(args, []);
});
