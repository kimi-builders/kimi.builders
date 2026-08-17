import assert from "node:assert/strict";
import test from "node:test";
import {
  MISSING,
  assembleIssue,
  buildDecisions,
  buildFacts,
  communityWorksCountQuery,
  letterIssueMetas,
  letterPayloadFromDb,
  monthFeaturedPostsQuery,
  monthFeaturedWorksQuery,
  monthOf,
  monthWindow,
  parseLetterPayload,
  topUsageModels,
  type MonthlyFeaturedEntry,
  type MonthlyStatsSnapshot,
} from "../src/lib/monthly";
import { BLOG_ISSUES, findBlogIssue } from "./fixtures/monthly-mock";

/* ---- 夹具(mock 期次 = 类型即需求规格,plan-monthly-learn-launch.md §一.1)---- */

test("fixture: mock 期次仍是合法样本(3 期、slug 可查、事实与定夺非空)", () => {
  assert.equal(BLOG_ISSUES.length, 3);
  assert.equal(findBlogIssue("letter-2026-08")?.issue, 3);
  assert.equal(findBlogIssue("nope"), undefined);
  for (const i of BLOG_ISSUES) {
    assert.ok(i.facts.length > 0 && i.decisions.length > 0);
  }
});

/* ---- payload 解析校验 ---- */

test("payload: 空串 = 纯自动组装;合法全字段解析", () => {
  assert.deepEqual(parseLetterPayload(""), { ok: true, payload: {} });
  assert.deepEqual(parseLetterPayload("   "), { ok: true, payload: {} });
  const r = parseLetterPayload(
    JSON.stringify({
      aiDisclosure: { facts: "数据聚合脚本生成", digest: "选读由编辑执笔,AI 仅做资料检索" },
      governance: [
        { title: "两起 AI 冒充人类评论的裁定", note: "均裁定删除并公示", rulingUrl: "/community/123" },
      ],
    }),
  );
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.payload.aiDisclosure?.facts, "数据聚合脚本生成");
    assert.equal(r.payload.aiDisclosure?.digest, "选读由编辑执笔,AI 仅做资料检索");
    assert.equal(r.payload.governance?.[0]?.rulingUrl, "/community/123");
  }
});

test("payload: mock 治理公示条目可转成合法 governance (payload 规格即 mock 类型)", () => {
  const mock = findBlogIssue("letter-2026-08")!;
  const governance = mock.decisions
    .filter((d) => d.kind === "governance")
    .map((d) => ({ title: d.title.zh, note: d.note.zh, rulingUrl: "/community/1" }));
  const r = parseLetterPayload(JSON.stringify({ governance }));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.payload.governance?.length, 1);
});

test("payload: 非法 JSON / 非对象 / 未知字段被拒(letter 层字段已退役)", () => {
  assert.equal(parseLetterPayload("{").ok, false);
  assert.equal(parseLetterPayload("[1]").ok, false);
  assert.equal(parseLetterPayload('"x"').ok, false);
  const r = parseLetterPayload('{"responce":"none"}');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /未知字段:responce/);
  /* 20260921 转向:response / agenda 不再是合法 payload 字段 */
  assert.equal(parseLetterPayload('{"response":"received"}').ok, false);
  assert.equal(parseLetterPayload('{"agenda":{"postIds":[1]}}').ok, false);
});

test("payload: 字段级校验(governance 必填 / rulingUrl 形态)", () => {
  const g1 = parseLetterPayload('{"governance":[{"title":"t"}]}');
  assert.equal(g1.ok, false);
  if (!g1.ok) assert.match(g1.error, /title\/note 必填/);
  const g2 = parseLetterPayload('{"governance":[{"title":"t","note":"n","rulingUrl":"ftp://x"}]}');
  assert.equal(g2.ok, false);
  if (!g2.ok) assert.match(g2.error, /rulingUrl/);
  /* 站内路径与 https 链接可过 */
  assert.equal(
    parseLetterPayload('{"governance":[{"title":"t","note":"n","rulingUrl":"https://example.com/x"}]}').ok,
    true,
  );
});

test("payload: aiDisclosure 只认三节(digest/facts/decisions),值为 1-280 字", () => {
  assert.equal(parseLetterPayload('{"aiDisclosure":{"letter":"x"}}').ok, false);
  assert.equal(parseLetterPayload('{"aiDisclosure":{"agenda":"x"}}').ok, false);
  assert.equal(parseLetterPayload('{"aiDisclosure":{"facts":""}}').ok, false);
  assert.equal(parseLetterPayload('{"aiDisclosure":{"facts":"脚本聚合"}}').ok, true);
  assert.equal(parseLetterPayload('{"aiDisclosure":{"digest":"编辑执笔"}}').ok, true);
});

test("letterPayloadFromDb: 渲染路径容错——坏数据回落空 payload,不打掉整页", () => {
  assert.deepEqual(letterPayloadFromDb(null), {});
  assert.deepEqual(letterPayloadFromDb(undefined), {});
  assert.deepEqual(letterPayloadFromDb("{bad json"), {});
  assert.deepEqual(letterPayloadFromDb('{"unknown":1}'), {});
  /* 退役字段的存量 payload 容错回落(渲染路径不炸) */
  assert.deepEqual(letterPayloadFromDb({ response: "received" }), {});
  /* 驱动已解析 JSON 对象的情形 */
  assert.deepEqual(letterPayloadFromDb({ governance: [] }), { governance: [] });
});

/* ---- 月份窗口 ---- */

test("monthOf / monthWindow: UTC 月窗半开区间,12 月跨年,非法输入 null", () => {
  assert.equal(monthOf(new Date(Date.UTC(2026, 7, 15, 23, 59))), "2026-08");
  assert.deepEqual(monthWindow("2026-08"), {
    start: "2026-08-01 00:00:00",
    end: "2026-09-01 00:00:00",
  });
  assert.deepEqual(monthWindow("2026-12"), {
    start: "2026-12-01 00:00:00",
    end: "2027-01-01 00:00:00",
  });
  assert.equal(monthWindow("2026-13"), null);
  assert.equal(monthWindow("2026-8"), null);
  assert.equal(monthWindow(""), null);
});

/* ---- 事实盘点 ---- */

const STATS: MonthlyStatsSnapshot = {
  members: 203,
  posts: 560,
  works: 41,
  comments: 1320,
  tokensTotal: 3_800_000_000,
  cacheHitRate: 0.813,
  topModel: { name: "Kimi K3", share: 0.41 },
};

test("facts: 七项口径(累计 token/成员/帖/作品/评论 + 30 天命中率/TOP 模型)", () => {
  const facts = buildFacts(STATS, "zh");
  assert.equal(facts.length, 7);
  const byLabel = new Map(facts.map((f) => [f.label, f.value]));
  assert.equal(byLabel.get("全站同步 Token(累计)"), "38亿");
  assert.equal(byLabel.get("社区成员"), "203");
  assert.equal(byLabel.get("社区帖子"), "560");
  assert.equal(byLabel.get("社区作品"), "41");
  assert.equal(byLabel.get("社区评论"), "1320");
  assert.equal(byLabel.get("缓存命中率 · 近 30 天"), "81.3%");
  assert.equal(byLabel.get("TOP 模型 · 近 30 天"), "Kimi K3 · 41.0%");
  /* en 版 */
  const en = new Map(buildFacts(STATS, "en").map((f) => [f.label, f.value]));
  assert.equal(en.get("Tokens synced (all-time)"), "3.8B");
});

test("facts: 缺项诚实显示「—」,不编数", () => {
  const facts = buildFacts({ ...STATS, cacheHitRate: null, topModel: null }, "zh");
  const byLabel = new Map(facts.map((f) => [f.label, f.value]));
  assert.equal(byLabel.get("缓存命中率 · 近 30 天"), MISSING);
  assert.equal(byLabel.get("TOP 模型 · 近 30 天"), MISSING);
  /* 数据少照发:1 个成员、0 评论也是诚实起点 */
  const cold = buildFacts(
    { members: 1, posts: 3, works: 0, comments: 0, tokensTotal: 460_000_000, cacheHitRate: null, topModel: null },
    "en",
  );
  const coldMap = new Map(cold.map((f) => [f.label, f.value]));
  assert.equal(coldMap.get("Members"), "1");
  assert.equal(coldMap.get("Comments"), "0");
});

test("facts 模型分布:canonical 合并 + 份额 + 前三", () => {
  const rows = [
    { source: "kimi-code", model: "kimi-k3", modelCanonical: "kimi-k3", modelProvider: "moonshot", tokens: 60 },
    /* 别名归并:k3 → kimi-k3 */
    { source: "kimi-code", model: "K3", modelCanonical: "", modelProvider: "moonshot", tokens: 40 },
    { source: "claude-code", model: "claude-opus-4", modelCanonical: "", modelProvider: "anthropic", tokens: 50 },
  ];
  const top = topUsageModels(rows, 3);
  assert.equal(top.length, 2);
  assert.equal(top[0].name, "Kimi K3");
  assert.equal(top[0].tokens, 100);
  assert.ok(Math.abs(top[0].share - 100 / 150) < 1e-9);
  assert.equal(top[1].name, "claude-opus-4");
  /* 空窗口 → 空分布(调用方回落「—」) */
  assert.deepEqual(topUsageModels([], 3), []);
});

/* ---- 编辑定夺 ---- */

const FEATURED: MonthlyFeaturedEntry[] = [
  {
    kind: "work",
    id: 7,
    href: "https://example.com/lunar",
    title: "Lunar Orbit:月轨可视化周历",
    authorHandle: "moonwalker",
    authorHref: "/u/moonwalker",
    reason: "4.2M token 已验证,失败三次写进发布说明。",
    editorHandle: "aklman",
    featuredAt: new Date(Date.UTC(2026, 7, 3)),
  },
  {
    kind: "post",
    id: 42,
    href: "/community/42",
    title: "缓存读计价口径与社区实测存在 3% 偏差",
    authorHandle: "cost_watcher",
    authorHref: "/u/cost_watcher",
    reason: "把计价问题问到了可验证的颗粒度。",
    editorHandle: "moonwalker",
    featuredAt: new Date(Date.UTC(2026, 7, 10)),
  },
];

test("decisions: featured 帖子/作品带理由与定夺编辑,governance 排后", () => {
  const decisions = buildDecisions(FEATURED, [
    { title: "治理公示:两起裁定", note: "均裁定删除并公示", rulingUrl: "/community/99" },
  ]);
  assert.equal(decisions.length, 3);
  assert.deepEqual(
    decisions.map((d) => d.kind),
    ["work", "post", "governance"],
  );
  assert.equal(decisions[0].editorHandle, "aklman");
  assert.equal(decisions[0].note, FEATURED[0].reason);
  assert.equal(decisions[1].href, "/community/42");
  const gov = decisions[2];
  assert.equal(gov.rulingUrl, "/community/99");
  assert.equal(gov.editorHandle, "");
  /* 无 governance 时只有 featured */
  assert.equal(buildDecisions(FEATURED, []).length, 2);
});

/* ---- 期次组装与期号 ---- */

function articleFixture(i: number) {
  const mock = BLOG_ISSUES[i];
  return {
    slug: mock.slug,
    title: mock.title.zh,
    summary: mock.summary.zh,
    authorHandle: mock.editorHandle,
    publishedAt: new Date(Date.UTC(2026, Number(mock.month.slice(5)) - 1, 15)),
  };
}

test("assembleIssue: 月份取 published_at;评鉴/AI 披露读 payload 与正文", () => {
  const issue = assembleIssue({
    article: { ...articleFixture(2), bodyMd: "本月评鉴正文" }, // 创刊号 letter-2026-06
    issueNumber: 1,
    stats: STATS,
    featured: FEATURED,
    payload: {
      aiDisclosure: { facts: "数据聚合脚本生成" },
      governance: [{ title: "创刊章程", note: "三条底线", rulingUrl: "/community/1" }],
    },
    locale: "zh",
    now: new Date(Date.UTC(2026, 8, 1)),
  });
  assert.equal(issue.slug, "letter-2026-06");
  assert.equal(issue.issue, 1);
  assert.equal(issue.month, "2026-06");
  assert.equal(issue.bodyMd, "本月评鉴正文");
  assert.equal(issue.aiDisclosure?.facts, "数据聚合脚本生成");
  assert.equal(issue.decisions.at(-1)?.kind, "governance");
  /* 无 payload:aiDisclosure=null;总览不取 bodyMd → 空串 */
  const bare = assembleIssue({
    article: articleFixture(0),
    issueNumber: 3,
    stats: STATS,
    featured: [],
    payload: {},
    locale: "zh",
    now: new Date(),
  });
  assert.equal(bare.aiDisclosure, null);
  assert.equal(bare.bodyMd, "");
  assert.deepEqual(bare.decisions, []);
});

test("letterIssueMetas: 期号 = 发布正序 1 起(列表新→旧)", () => {
  const metas = letterIssueMetas([
    {
      slug: "b",
      title: "第二期",
      summary: "",
      authorHandle: "moonwalker",
      publishedAt: new Date(Date.UTC(2026, 6, 1)),
      locale: "zh" as const,
      fallback: false,
    },
    {
      slug: "a",
      title: "创刊号",
      summary: "",
      authorHandle: "aklman",
      publishedAt: new Date(Date.UTC(2026, 5, 1)),
      locale: "zh" as const,
      fallback: false,
    },
  ]);
  assert.deepEqual(
    metas.map((m) => [m.slug, m.issue]),
    [
      ["b", 2],
      ["a", 1],
    ],
  );
  assert.equal(metas[1].month, "2026-06");
  /* 空态谓词:一封未发 → 空列表(页面渲染「首期筹备中」) */
  assert.deepEqual(letterIssueMetas([]), []);
});

/* ---- 查询构建(SQL 钉;风格对齐 articles.test.ts)---- */

test("works 计数:公开且未被屏蔽", () => {
  const { sql, args } = communityWorksCountQuery();
  assert.match(sql, /FROM works/);
  assert.match(sql, /visibility = 'public'/);
  assert.match(sql, /hidden_at IS NULL/);
  assert.deepEqual(args, []);
});

test("decisions 查询:featured 落在文章月份窗口,公共口径,定夺编辑 join", () => {
  const window = { start: "2026-08-01 00:00:00", end: "2026-09-01 00:00:00" };
  const p = monthFeaturedPostsQuery(window);
  assert.match(p.sql, /p\.featured_at >= \? AND p\.featured_at < \?/);
  assert.match(p.sql, /p\.visibility = 'public'/);
  assert.match(p.sql, /p\.deleted_at IS NULL/);
  assert.match(p.sql, /p\.hidden_at IS NULL/);
  assert.match(p.sql, /LEFT JOIN users e ON e\.id = p\.featured_by/);
  assert.match(p.sql, /ORDER BY p\.featured_at ASC, p\.id ASC/);
  assert.deepEqual(p.args, [window.start, window.end]);
  const w = monthFeaturedWorksQuery(window);
  assert.match(w.sql, /w\.featured_at >= \? AND w\.featured_at < \?/);
  assert.match(w.sql, /w\.visibility = 'public'/);
  assert.match(w.sql, /w\.hidden_at IS NULL/);
  assert.match(w.sql, /ORDER BY w\.featured_at ASC, w\.id ASC/);
  assert.deepEqual(w.args, [window.start, window.end]);
});
