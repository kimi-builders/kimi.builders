import assert from "node:assert/strict";
import test from "node:test";
import {
  canModerate,
  FEATURED_REASON_MAX,
  featuredPostsQuery,
  featuredWorksQuery,
  mergeFeatured,
  normalizeFeaturedReason,
  type FeaturedItem,
} from "../src/lib/featured";

test("only admin and mod can feature", () => {
  assert.equal(canModerate("admin"), true);
  assert.equal(canModerate("mod"), true);
  assert.equal(canModerate("member"), false);
  assert.equal(canModerate(""), false);
  assert.equal(canModerate(null), false);
  assert.equal(canModerate(undefined), false);
});

test("reason is required, trimmed and capped at 280 chars", () => {
  assert.equal(FEATURED_REASON_MAX, 280);
  assert.equal(normalizeFeaturedReason(""), null);
  assert.equal(normalizeFeaturedReason("   \n  "), null);
  assert.equal(normalizeFeaturedReason("x".repeat(281)), null);
  assert.equal(normalizeFeaturedReason("x".repeat(280))?.length, 280);
  assert.equal(
    normalizeFeaturedReason("  本周最完整的部署实战  "),
    "本周最完整的部署实战",
  );
});

test("posts query lists only public featured posts, newest featured first, with author and editor joins", () => {
  const { sql, args } = featuredPostsQuery(5);
  assert.match(sql, /p\.featured_at IS NOT NULL/);
  assert.match(sql, /p\.deleted_at IS NULL/);
  assert.match(sql, /p\.visibility = 'public'/);
  assert.match(sql, /ORDER BY p\.featured_at DESC/);
  /* 作者 join + 定夺编辑 join(署名用),缺一处就取不到署名 */
  assert.match(sql, /JOIN users u ON u\.id = p\.user_id/);
  assert.match(sql, /LEFT JOIN users e ON e\.id = p\.featured_by/);
  assert.deepEqual(args, [5]);
});

test("works query lists featured works newest featured first, author optional (awesome entries)", () => {
  const { sql, args } = featuredWorksQuery(3);
  assert.match(sql, /w\.featured_at IS NOT NULL/);
  assert.match(sql, /ORDER BY w\.featured_at DESC/);
  /* 站内作者可空(awesome 外部条目)→ LEFT JOIN;编辑署名同样 LEFT JOIN */
  assert.match(sql, /LEFT JOIN users u ON u\.id = w\.user_id/);
  assert.match(sql, /LEFT JOIN users e ON e\.id = w\.featured_by/);
  assert.deepEqual(args, [3]);
});

test("merge interleaves posts and works by featured time desc and caps the limit", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 7, 17, h));
  const item = (kind: "post" | "work", id: number, h: number): FeaturedItem => ({
    kind,
    id,
    href: "#",
    external: false,
    title: `${kind} ${id}`,
    excerpt: "",
    author: "@a",
    authorHref: null,
    reason: "",
    editorHandle: "ed",
    featuredAt: at(h),
  });
  const merged = mergeFeatured(
    [item("post", 1, 10), item("post", 2, 8)],
    [item("work", 9, 12), item("work", 8, 9)],
    3,
  );
  assert.deepEqual(
    merged.map((m) => [m.kind, m.id]),
    [
      ["work", 9],
      ["post", 1],
      ["work", 8],
    ],
  );
});

test("merge with both sides empty stays empty (cold start: section not rendered)", () => {
  assert.deepEqual(mergeFeatured([], [], 4), []);
});
