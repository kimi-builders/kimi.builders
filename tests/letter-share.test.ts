import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleIssue,
  type MonthlyFeaturedEntry,
  type MonthlyStatsSnapshot,
} from "../src/lib/monthly";
import {
  LETTER_POSTER_DECISIONS_MAX,
  buildLetterShareSnapshot,
  decisionKindLabel,
  disclosureKeyOf,
  letterShareText,
  letterSnapshotFromMock,
  letterSnapshotFromResult,
  normalizeLetterSection,
} from "../src/lib/share-letter";
import { LETTER_POSTER_SIZE } from "../app/api/share/poster-sizes";
import { BLOG_ISSUES } from "./fixtures/monthly-mock";

/* ---- ?section= 参数归一化 ---- */

test("section 归一化:缺省 facts,大小写/空白容忍,非法回落 facts", () => {
  assert.equal(normalizeLetterSection(null), "facts");
  assert.equal(normalizeLetterSection(""), "facts");
  assert.equal(normalizeLetterSection("facts"), "facts");
  assert.equal(normalizeLetterSection(" Decisions "), "decisions");
  /* 20260921:letter 节随「给官方的信」层下线,回落 facts */
  assert.equal(normalizeLetterSection("LETTER"), "facts");
  assert.equal(normalizeLetterSection("digest"), "facts"); // 评鉴层无海报
  assert.equal(normalizeLetterSection("nope"), "facts");
});

test("disclosureKeyOf:分节键与锚一致(恒等映射)", () => {
  assert.equal(disclosureKeyOf("facts"), "facts");
  assert.equal(disclosureKeyOf("decisions"), "decisions");
});

/* ---- 生产快照组装(纯:assembleIssue 输出 → 分节快照)---- */

const STATS: MonthlyStatsSnapshot = {
  members: 203,
  posts: 560,
  works: 41,
  comments: 1320,
  tokensTotal: 3_800_000_000,
  cacheHitRate: 0.813,
  topModel: { name: "Kimi K3", share: 0.41 },
};

function featuredOf(i: number): MonthlyFeaturedEntry {
  return {
    kind: i % 2 === 0 ? "work" : "post",
    id: i + 1,
    href: `/community/${i + 1}`,
    title: `定夺 ${i + 1}`,
    authorHandle: `builder_${i + 1}`,
    authorHref: `/u/builder_${i + 1}`,
    reason: `理由 ${i + 1}`,
    editorHandle: "aklman",
    featuredAt: new Date(Date.UTC(2026, 7, i + 1)),
  };
}

function issueFixture(overrides: Partial<Parameters<typeof assembleIssue>[0]> = {}) {
  return assembleIssue({
    article: {
      slug: "letter-2026-08",
      title: "第三期:缓存的经济账,与本月值得读的七条链接",
      summary: "本月全站缓存命中率首次越过 80%。",
      authorHandle: "aklman",
      publishedAt: new Date(Date.UTC(2026, 7, 15)),
    },
    issueNumber: 3,
    stats: STATS,
    featured: [featuredOf(0), featuredOf(1)],
    payload: {
      aiDisclosure: { facts: "数据聚合脚本生成" },
      governance: [{ title: "两起 AI 冒充人类评论的裁定", note: "均裁定删除并公示" }],
    },
    locale: "zh",
    now: new Date(Date.UTC(2026, 8, 1)),
    ...overrides,
  });
}

test("facts 快照:七项全带、首项 hero 语义不变、URL 带 #facts、披露读 facts 键", () => {
  const s = buildLetterShareSnapshot(issueFixture(), "facts");
  assert.equal(s.section, "facts");
  assert.equal(s.slug, "letter-2026-08");
  assert.equal(s.issue, 3);
  assert.equal(s.month, "2026-08");
  assert.equal(s.editorHandle, "aklman");
  assert.equal(s.initials, "AK");
  assert.equal(s.facts.length, 7);
  assert.equal(s.facts[0].label, "全站同步 Token(累计)");
  assert.equal(s.facts[0].value, "38亿");
  assert.equal(s.url, "https://kimi.builders/blog/letter-2026-08#facts");
  assert.equal(s.aiNote, "数据聚合脚本生成");
});

test("facts 快照:超长值截取(TOP 模型原始 id 不溢出固定画幅)", () => {
  const issue = issueFixture({
    stats: { ...STATS, topModel: { name: "kimi-k3-very-long-preview-model-id", share: 0.41 } },
  });
  const s = buildLetterShareSnapshot(issue, "facts");
  const top = s.facts.find((f) => f.label === "TOP 模型 · 近 30 天")!;
  assert.ok(top.value.length <= 16);
  assert.ok(top.value.endsWith("…"));
});

test("decisions 快照:chip 文案与生产页同口径,超出上限进 decisionsMore", () => {
  assert.equal(decisionKindLabel("work"), "精选构建");
  assert.equal(decisionKindLabel("post"), "精选讨论");
  assert.equal(decisionKindLabel("governance"), "治理公示");
  const issue = issueFixture({
    featured: [featuredOf(0), featuredOf(1), featuredOf(2), featuredOf(3), featuredOf(4)],
  });
  const s = buildLetterShareSnapshot(issue, "decisions");
  /* 5 featured + 1 governance = 6 条定夺,海报上 3 张卡 + 余 3 */
  assert.equal(s.decisions.length, LETTER_POSTER_DECISIONS_MAX);
  assert.equal(s.decisionsMore, 3);
  assert.equal(s.decisions[0].kind, "work");
  assert.equal(s.decisions[0].kindLabel, "精选构建");
  assert.equal(s.decisions[0].editorHandle, "aklman");
  assert.equal(s.url, "https://kimi.builders/blog/letter-2026-08#decisions");
  assert.equal(s.aiNote, null); // 披露只给了 facts,decisions 键缺省 = 无
});

test("decisions 快照:governance 卡无作者无署名行", () => {
  const s = buildLetterShareSnapshot(issueFixture({ featured: [] }), "decisions");
  assert.equal(s.decisions.length, 1);
  assert.equal(s.decisions[0].kind, "governance");
  assert.equal(s.decisions[0].authorHandle, "");
  assert.equal(s.decisions[0].editorHandle, "");
});

test("letterSnapshotFromResult:无此已发布期 → null(路由 404),有期 → 快照", () => {
  assert.equal(letterSnapshotFromResult(null, "facts"), null);
  const s = letterSnapshotFromResult({ issue: issueFixture() }, "facts");
  assert.ok(s);
  assert.equal(s.section, "facts");
});

test("letterShareText:动态中文全进字体子集文本(事实值含「亿」)", () => {
  const text = letterShareText(buildLetterShareSnapshot(issueFixture(), "facts"));
  assert.ok(text.includes("全站同步 Token(累计)"));
  assert.ok(text.includes("38亿"));
  assert.ok(text.includes("均裁定删除并公示"));
  assert.ok(text.includes("数据聚合脚本生成"));
});

/* ---- fixture 映射(dev preview:tests/fixtures/monthly-mock 第一期)---- */

test("fixture 映射 facts:第一期四项大数字,zh 标签", () => {
  const s = letterSnapshotFromMock(BLOG_ISSUES[0], "facts");
  assert.equal(s.slug, "letter-2026-08");
  assert.equal(s.issue, 3);
  assert.equal(s.month, "2026-08");
  assert.equal(s.editorHandle, "aklman");
  assert.equal(s.facts.length, 4);
  assert.deepEqual(
    s.facts.map((f) => [f.label, f.value]),
    [
      ["本月同步 Token", "2.4B"],
      ["活跃 builder", "87"],
      ["新增作品", "23"],
      ["缓存命中率", "81.3%"],
    ],
  );
  assert.equal(s.aiNote, null);
  assert.equal(s.url, "https://kimi.builders/blog/letter-2026-08#facts");
});

test("fixture 映射 decisions:best/underrated 保留夹具语气,配色归生产 kinds", () => {
  const s = letterSnapshotFromMock(BLOG_ISSUES[0], "decisions");
  assert.deepEqual(
    s.decisions.map((d) => [d.kindLabel, d.kind]),
    [
      ["本月最佳", "work"],
      ["被低估", "post"],
      ["治理公示", "governance"],
    ],
  );
  assert.equal(s.decisions[0].authorHandle, "moonwalker");
  /* 夹具无定夺编辑字段,署名到期刊主编;governance 公示不落署名行(同生产口径) */
  assert.equal(s.decisions[0].editorHandle, "aklman");
  assert.equal(s.decisions[2].editorHandle, "");
  assert.equal(s.decisionsMore, 0);
});

test("海报尺寸:两节统一 1080×1440", () => {
  assert.deepEqual(LETTER_POSTER_SIZE, { width: 1080, height: 1440 });
});
