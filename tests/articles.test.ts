import assert from "node:assert/strict";
import test from "node:test";
import {
  articleBySlugQuery,
  articleForEditQuery,
  insertArticleQuery,
  listArticlesQuery,
  normalizeArticleKind,
  normalizeArticleLocale,
  normalizeArticleSlug,
  normalizeSortOrder,
  pickArticleVersions,
  softDeleteArticleQuery,
  updateArticleQuery,
  type ArticleInput,
} from "../src/lib/articles";

test("slug: lowercase letters/digits/hyphens between segments, else null", () => {
  assert.equal(normalizeArticleSlug("hello-world"), "hello-world");
  assert.equal(normalizeArticleSlug("2026-08-letter"), "2026-08-letter");
  /* Normalization: trim + lowercase. */
  assert.equal(normalizeArticleSlug("  Hello-World  "), "hello-world");
  assert.equal(normalizeArticleSlug(""), null);
  assert.equal(normalizeArticleSlug("   "), null);
  assert.equal(normalizeArticleSlug("a b"), null);
  assert.equal(normalizeArticleSlug("-ab"), null);
  assert.equal(normalizeArticleSlug("ab-"), null);
  assert.equal(normalizeArticleSlug("a--b"), null);
  assert.equal(normalizeArticleSlug("a_b"), null);
  assert.equal(normalizeArticleSlug("中文slug"), null);
  assert.equal(normalizeArticleSlug("x".repeat(160))?.length, 160);
  assert.equal(normalizeArticleSlug("x".repeat(161)), null);
});

test("kind / locale / sort_order normalization", () => {
  assert.equal(normalizeArticleKind("letter"), "letter");
  assert.equal(normalizeArticleKind("guide"), "guide");
  assert.equal(normalizeArticleKind("post"), null);
  assert.equal(normalizeArticleLocale("zh"), "zh");
  assert.equal(normalizeArticleLocale("en"), "en");
  assert.equal(normalizeArticleLocale("fr"), null);
  assert.equal(normalizeSortOrder("3"), 3);
  assert.equal(normalizeSortOrder("0"), 0);
  assert.equal(normalizeSortOrder(""), 0);
  assert.equal(normalizeSortOrder("-2"), 0);
  assert.equal(normalizeSortOrder("1.5"), 0);
  assert.equal(normalizeSortOrder("abc"), 0);
  assert.equal(normalizeSortOrder("10000"), 9999);
});

test("letter list: published only, not soft-deleted, newest issue first, author join for byline", () => {
  const { sql, args } = listArticlesQuery("letter");
  assert.match(sql, /a\.kind = \?/);
  /* Drafts never surface + soft-deleted never surface. */
  assert.match(sql, /a\.published_at IS NOT NULL/);
  assert.match(sql, /a\.deleted_at IS NULL/);
  /* Ordered by publish time (newest first). */
  assert.match(sql, /ORDER BY a\.published_at DESC, a\.id DESC/);
  /* Credited-editor join. */
  assert.match(sql, /JOIN users u ON u\.id = a\.author_id/);
  assert.deepEqual(args, ["letter"]);
});

test("guide list: editor-defined order (sort_order ASC) for the numbered path", () => {
  const { sql, args } = listArticlesQuery("guide");
  assert.match(sql, /ORDER BY a\.sort_order ASC, a\.published_at ASC, a\.id ASC/);
  assert.match(sql, /a\.published_at IS NOT NULL/);
  assert.match(sql, /a\.deleted_at IS NULL/);
  assert.deepEqual(args, ["guide"]);
});

test("detail query: slug + locale fallback (UI locale first), drafts and soft-deleted hidden", () => {
  const { sql, args } = articleBySlugQuery("letter", "hello", "en");
  assert.match(sql, /a\.slug = \?/);
  /* Both languages fetched, UI locale first; LIMIT 1 gives the fallback. */
  assert.match(sql, /a\.locale IN \('zh', 'en'\)/);
  assert.match(sql, /ORDER BY \(a\.locale = \?\) DESC/);
  assert.match(sql, /LIMIT 1/);
  assert.match(sql, /a\.published_at IS NOT NULL/);
  assert.match(sql, /a\.deleted_at IS NULL/);
  assert.deepEqual(args, ["letter", "hello", "en"]);
});

test("edit query: drafts reachable (no published filter), soft-deleted still hidden", () => {
  const { sql, args } = articleForEditQuery("hello", "zh");
  assert.doesNotMatch(sql, /published_at IS NOT NULL/);
  assert.match(sql, /a\.deleted_at IS NULL/);
  assert.match(sql, /a\.slug = \? AND a\.locale = \?/);
  assert.deepEqual(args, ["hello", "zh"]);
});

test("locale fallback: UI locale preferred per slug, missing language falls back with flag", () => {
  const row = (
    slug: string,
    locale: "zh" | "en",
    title: string,
  ): Parameters<typeof pickArticleVersions>[0][number] => ({
    id: slug.length + (locale === "en" ? 100 : 0),
    slug,
    locale,
    title,
    summary: "",
    authorHandle: "ed",
    publishedAt: new Date(Date.UTC(2026, 7, 1)),
    sortOrder: 0,
    payloadRaw: null,
  });
  const rows = [
    row("a", "zh", "甲"), // both languages exist
    row("a", "en", "A"),
    row("b", "en", "B"), // English only
    row("c", "zh", "丙"), // Chinese only
  ];
  const zh = pickArticleVersions(rows, "zh");
  assert.deepEqual(
    zh.map((r) => [r.slug, r.locale, r.fallback]),
    [
      ["a", "zh", false],
      ["b", "en", true], // falls back to English, labeled
      ["c", "zh", false],
    ],
  );
  const en = pickArticleVersions(rows, "en");
  assert.deepEqual(
    en.map((r) => [r.slug, r.locale, r.fallback]),
    [
      ["a", "en", false],
      ["b", "en", false],
      ["c", "zh", true], // falls back to Chinese, labeled
    ],
  );
  /* Cold start: no articles -> empty list (empty-state copy takes over). */
  assert.deepEqual(pickArticleVersions([], "zh"), []);
});

const INPUT: ArticleInput = {
  slug: "first-letter",
  kind: "letter",
  locale: "zh",
  title: "创刊号",
  summary: "摘要",
  bodyMd: "# 正文",
  sortOrder: 0,
  payload: null,
};

test("insert: publish flag drives IF(?, NOW(), NULL) — NULL = draft", () => {
  const pub = insertArticleQuery(7, INPUT, true);
  assert.match(pub.sql, /IF\(\?, NOW\(\), NULL\)/);
  assert.equal(pub.args.at(-1), 1);
  const draft = insertArticleQuery(7, INPUT, false);
  assert.equal(draft.args.at(-1), 0);
  /* Author = the credited editor. */
  assert.equal(draft.args[7], 7);
});

test("insert/update: payload 走 CAST(? AS JSON),NULL = 纯自动组装", () => {
  const withPayload: ArticleInput = { ...INPUT, payload: '{"response":"received"}' };
  const ins = insertArticleQuery(7, withPayload, true);
  assert.match(ins.sql, /CAST\(\? AS JSON\)/);
  assert.equal(ins.args[6], '{"response":"received"}');
  const upd = updateArticleQuery(9, INPUT, true);
  assert.match(upd.sql, /payload = CAST\(\? AS JSON\)/);
  assert.equal(upd.args[6], null);
});

test("update: publish keeps first publish time, unpublish resets to NULL (draft)", () => {
  const { sql, args } = updateArticleQuery(9, INPUT, true);
  assert.match(sql, /published_at = IF\(\?, COALESCE\(published_at, NOW\(\)\), NULL\)/);
  /* Soft-deleted rows are immutable (pinned in WHERE). */
  assert.match(sql, /WHERE id = \? AND deleted_at IS NULL/);
  assert.equal(args.at(-2), 1);
  assert.equal(args.at(-1), 9);
  const unpub = updateArticleQuery(9, INPUT, false);
  assert.equal(unpub.args.at(-2), 0);
});

test("soft delete: sets deleted_at only on live rows (posts-style)", () => {
  const { sql, args } = softDeleteArticleQuery(4);
  assert.match(sql, /UPDATE articles SET deleted_at = NOW\(\)/);
  assert.match(sql, /WHERE id = \? AND deleted_at IS NULL/);
  assert.deepEqual(args, [4]);
});
