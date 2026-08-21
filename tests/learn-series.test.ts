import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import {
  CURRENT_KIMI_MODEL,
  LEARN_SERIES,
  STALE_AFTER_DAYS,
  isPathStale,
  normalizePathSlug,
} from "../src/lib/learn-series";
import {
  compareTutorials,
  episodeNeighbors,
  guidePayloadFromDb,
  parseGuidePayload,
  type Tutorial,
} from "../src/lib/tutorials";
import {
  pathGraduatesQuery,
  pathGraduationCounts,
  pathGraduationCountsQuery,
  workInsertQuery,
  type WorkFields,
} from "../src/lib/works";

const NOW = new Date("2026-08-17T00:00:00Z");

/* ---- isPathStale 三态(计算型 stale;自旧 _data.ts 平移)---- */

test("isPathStale: 新鲜验证戳(同期模型 + 45 天内)→ 非 stale", () => {
  assert.equal(
    isPathStale(
      { verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: "2026-08" },
      CURRENT_KIMI_MODEL,
      NOW,
    ),
    false,
  );
  /* 边界:恰好 45 天仍算新鲜(超过才过期) */
  assert.equal(
    isPathStale(
      { verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: "2026-07-03" },
      CURRENT_KIMI_MODEL,
      NOW,
    ),
    false,
  );
});

test("isPathStale: 验证戳超 45 天 → stale(过期即标,不手填)", () => {
  assert.equal(
    isPathStale(
      { verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: "2026-06-15" },
      CURRENT_KIMI_MODEL,
      NOW,
    ),
    true,
  );
});

test("isPathStale: 模型代际不符 → stale(换代瞬间全部系列自动待重验)", () => {
  assert.equal(
    isPathStale(
      { verifiedModel: "kimi-k2.5", verifiedAt: "2026-08-16" },
      CURRENT_KIMI_MODEL,
      NOW,
    ),
    true,
  );
});

test("isPathStale: 无法解析的验证戳不担保 → stale(失败闭合)", () => {
  for (const bad of ["", "2026-8", "2026/08", "next-week", "2026-13-01", "2026-02-99"]) {
    assert.equal(
      isPathStale({ verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: bad }, CURRENT_KIMI_MODEL, NOW),
      true,
      `verifiedAt=${bad}`,
    );
  }
});

test("STALE_AFTER_DAYS = 45", () => {
  assert.equal(STALE_AFTER_DAYS, 45);
});

/* ---- 系列注册表卫生(策展数据改坏时的拦截网)---- */

test("注册表:slug/code 唯一,L10n 成对非空,discussionPostId 为正整数", () => {
  const slugs = LEARN_SERIES.map((s) => s.slug);
  const codes = LEARN_SERIES.map((s) => s.code);
  assert.equal(new Set(slugs).size, slugs.length, `slug 重复:${slugs}`);
  assert.equal(new Set(codes).size, codes.length, `code 重复:${codes}`);
  const bad: string[] = [];
  const check = (where: string, v: { zh: string; en: string }) => {
    if (!v.zh?.trim() || !v.en?.trim()) bad.push(where);
  };
  for (const s of LEARN_SERIES) {
    check(`${s.slug}.title`, s.title);
    check(`${s.slug}.tagline`, s.tagline);
    check(`${s.slug}.summary`, s.summary);
    if (s.discussionPostId !== undefined) {
      assert.ok(
        Number.isInteger(s.discussionPostId) && s.discussionPostId > 0,
        `${s.slug}.discussionPostId 必须为正整数`,
      );
    }
  }
  assert.deepEqual(bad, []);
});

test("normalizePathSlug: 只接受在册系列 slug,其余置 null", () => {
  assert.equal(normalizePathSlug(""), null);
  assert.equal(normalizePathSlug("not-a-series"), null);
  assert.equal(normalizePathSlug(" ".repeat(3)), null);
  const first = LEARN_SERIES[0];
  if (first) {
    assert.equal(normalizePathSlug(first.slug), first.slug);
    assert.equal(normalizePathSlug(` ${first.slug} `), first.slug);
  }
});

/* ---- guide payload 校验(编辑后台严格)---- */

test("guide payload: 空串 = 空;合法全字段解析", () => {
  assert.deepEqual(parseGuidePayload(""), { ok: true, payload: {} });
  const s = LEARN_SERIES[0]?.slug;
  const r = parseGuidePayload(
    JSON.stringify({
      ...(s ? { series: s } : {}),
      video: { provider: "bilibili", id: "BV1xx411c7mD" },
      deck: "https://speakerdeck.com/x/y",
      durationMin: 12,
      scenario: "工作流自动化",
      aiNote: "文稿由编辑执笔,AI 做资料检索",
    }),
  );
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.payload.video?.provider, "bilibili");
    assert.equal(r.payload.durationMin, 12);
    if (s) assert.equal(r.payload.series, s);
  }
});

test("guide payload: 未知字段/非法值被拒", () => {
  assert.equal(parseGuidePayload("{").ok, false);
  assert.equal(parseGuidePayload("[1]").ok, false);
  const stray = parseGuidePayload('{"vibe":"x"}');
  assert.equal(stray.ok, false);
  if (!stray.ok) assert.match(stray.error, /未知字段:vibe/);
  assert.equal(parseGuidePayload('{"video":{"provider":"tiktok","id":"x"}}').ok, false);
  assert.equal(parseGuidePayload('{"video":{"provider":"bilibili"}}').ok, false);
  assert.equal(parseGuidePayload('{"durationMin":0}').ok, false);
  assert.equal(parseGuidePayload('{"durationMin":12.5}').ok, false);
  assert.equal(parseGuidePayload('{"deck":"ftp://x"}').ok, false);
  assert.equal(parseGuidePayload('{"series":"not-registered"}').ok, false);
});

test("guidePayloadFromDb: 渲染路径容错——坏数据回落空 payload,不打掉整页", () => {
  assert.deepEqual(guidePayloadFromDb(null), {});
  assert.deepEqual(guidePayloadFromDb(undefined), {});
  assert.deepEqual(guidePayloadFromDb("{bad json"), {});
  assert.deepEqual(guidePayloadFromDb({ video: { provider: "tiktok", id: "x" } }), {});
  assert.deepEqual(guidePayloadFromDb({ durationMin: -3 }), {});
  /* 驱动已解析对象 + 渲染路径不做 series 在册校验(系列注销了集仍可读) */
  assert.deepEqual(
    guidePayloadFromDb({ series: "retired-series", video: { provider: "youtube", id: "abc" } }),
    { series: "retired-series", video: { provider: "youtube", id: "abc" } },
  );
});

/* ---- 教程排序与导航 ---- */

function tut(slug: string, episode: number, publishedAt: string): Tutorial {
  return {
    slug,
    title: slug,
    summary: "",
    locale: "zh",
    fallback: false,
    publishedAt: new Date(publishedAt),
    episode,
    payload: {},
    series: "s",
  };
}

test("compareTutorials: 集序升序,未编号(0)排尾,同序按发布时间", () => {
  const list = [
    tut("c", 3, "2026-08-03"),
    tut("a", 1, "2026-08-01"),
    tut("no-no", 0, "2026-08-02"),
    tut("b", 2, "2026-08-02"),
  ].sort(compareTutorials);
  assert.deepEqual(
    list.map((t) => t.slug),
    ["a", "b", "c", "no-no"],
  );
});

test("episodeNeighbors: 首末集的缺省侧为 undefined", () => {
  const list = [tut("a", 1, "2026-08-01"), tut("b", 2, "2026-08-02")];
  assert.deepEqual(episodeNeighbors(list, "a"), { prev: undefined, next: list[1] });
  assert.deepEqual(episodeNeighbors(list, "b"), { prev: list[0], next: undefined });
  assert.deepEqual(episodeNeighbors(list, "nope"), { prev: undefined, next: undefined });
});

/* ---- 毕业归因(自旧 learn-paths.test.ts 平移,机制不变)---- */

const WORK_FIELDS: WorkFields = {
  name: "测试作品",
  tagline: "",
  url: "https://example.com",
  repoUrl: "",
  screenshotUrl: "",
  tags: [],
  agents: ["kimi"],
  visibility: "public",
  authorLabel: "",
  claimedTokens: null,
  status: "released",
  models: [],
  kind: "app",
  descriptionMd: "",
  scope: "",
  alsoAwesome: false,
  logoKey: "",
  imageKeys: [],
  coverKey: "",
  coverTone: "theme",
  coverFit: "cover",
  aiReply: true,
  sourcePath: "first-series",
};

test("workInsertQuery: site 作品落 source_path;awesome 条目强制 null", () => {
  const q = workInsertQuery(7, WORK_FIELDS);
  assert.ok(q.sql.includes("source_path"));
  assert.equal(q.args.at(-1), "first-series");
  const awesome = workInsertQuery(7, { ...WORK_FIELDS, authorLabel: "外部作者" });
  assert.equal(awesome.args.at(-1), null, "awesome 推荐条目无来源系列语义");
});

test("pathGraduatesQuery: 系列毕业作品只取公开未屏蔽的 site 条目", () => {
  const { sql, args } = pathGraduatesQuery("first-series");
  assert.match(sql, /w\.source_path = \?/);
  assert.match(sql, /w\.source = 'site'/);
  assert.match(sql, /visibility = 'public'/);
  assert.match(sql, /hidden_at IS NULL/);
  assert.deepEqual(args, ["first-series"]);
});

test("pathGraduationCounts: 各系列毕业数(北极星 #5)", async () => {
  const q = pathGraduationCountsQuery();
  assert.match(q.sql, /GROUP BY w\.source_path/);
  assert.match(q.sql, /w\.source = 'site'/);
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return [[
        { source_path: "first-series", n: 3 },
        { source_path: "second-series", n: "2" },
      ]];
    },
  } as unknown as Pool;
  const counts = await pathGraduationCounts(db);
  assert.equal(counts.get("first-series"), 3);
  assert.equal(counts.get("second-series"), 2, "字符串计数转 number");
  assert.equal(counts.size, 2);
  assert.equal(calls.length, 1);
});
