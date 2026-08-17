import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import {
  CURRENT_KIMI_MODEL,
  LEARN_PATHS,
  STALE_AFTER_DAYS,
  findLearnPath,
  isPathStale,
  normalizePathSlug,
} from "../app/(app)/learn/_data";
import {
  postRefResolution,
  workRefResolution,
} from "../app/(app)/learn/_resolve";
import type { PostDetail } from "../src/lib/posts";
import {
  pathGraduatesQuery,
  pathGraduationCounts,
  pathGraduationCountsQuery,
  workInsertQuery,
  type WorkFields,
  type WorkRow,
} from "../src/lib/works";

const DAY = 86_400_000;
const NOW = new Date("2026-08-17T00:00:00Z");

/* ---- isPathStale 三态(计算型 stale)---- */

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
      { verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: "2026-07-02" },
      CURRENT_KIMI_MODEL,
      NOW,
    ),
    true,
  );
  assert.equal(
    isPathStale(
      { verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: "2026-06" },
      CURRENT_KIMI_MODEL,
      NOW,
    ),
    true,
  );
});

test("isPathStale: 模型代际不符 → stale(换代瞬间全部路径自动待重验)", () => {
  assert.equal(
    isPathStale(
      { verifiedModel: "kimi-latest", verifiedAt: "2026-08-16" },
      "kimi-k3.1",
      NOW,
    ),
    true,
  );
});

test("isPathStale: 无法解析的验证戳不担保 → stale(失败闭合)", () => {
  for (const bad of ["", "2026", "2026/08", "2026-13", "2026-08-32", "abc"]) {
    assert.equal(
      isPathStale({ verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: bad }, CURRENT_KIMI_MODEL, NOW),
      true,
      `verifiedAt=${bad}`,
    );
  }
});

/* ---- mock 数据与类型约定 ---- */

test("mock: stale 不再手填;PATH-04 用旧 verifiedAt 自然算出 stale", () => {
  for (const p of LEARN_PATHS) {
    assert.ok(!("stale" in p), `${p.code} 不应再带手写 stale 字段`);
  }
  const byCode = (code: string) => LEARN_PATHS.find((p) => p.code === code)!;
  assert.equal(isPathStale(byCode("PATH-04"), CURRENT_KIMI_MODEL, NOW), true);
  for (const code of ["PATH-01", "PATH-02", "PATH-03"]) {
    assert.equal(
      isPathStale(byCode(code), CURRENT_KIMI_MODEL, NOW),
      false,
      `${code} 应保持新鲜`,
    );
  }
  /* 模型换代:所有路径全部转待重验(K-3.1 作战日历的机械触发) */
  for (const p of LEARN_PATHS) {
    assert.equal(isPathStale(p, "kimi-k3.1", NOW), true, `${p.code} 换代后应待重验`);
  }
});

test("mock: evidence 类资源全部走 ref;ref 与 href 互斥", () => {
  for (const p of LEARN_PATHS) {
    for (const level of p.levels) {
      for (const r of level.resources) {
        if (r.kind === "evidence") {
          assert.equal(r.external, false, `${p.code} evidence 必须站内 ref`);
          assert.ok("ref" in r && r.ref, `${p.code} evidence 必须有 ref`);
          assert.ok(!("href" in r) || r.href === undefined, `${p.code} evidence 不得带 href`);
        }
        if (r.external) {
          assert.ok(typeof r.href === "string" && r.href.length > 0, `${p.code} 外部资源必须有 href`);
          assert.ok(!("ref" in r) || r.ref === undefined, `${p.code} 外部资源不得带 ref`);
        } else {
          assert.ok(r.ref.id >= 0 && Number.isInteger(r.ref.id), `${p.code} ref.id 必须是整数`);
          assert.ok(["work", "post", "awesome"].includes(r.ref.kind), `${p.code} ref.kind 合法`);
        }
      }
    }
  }
});

/* ---- ref 解析与降级(_resolve 纯判定)---- */

function fakeWork(partial: Partial<WorkRow>): WorkRow {
  return {
    id: 7,
    name: "Lunar Orbit",
    handle: "aklman",
    authorLabel: "",
    visibility: "public",
    hiddenAt: null,
    userId: 3,
    ...partial,
  } as WorkRow;
}

test("workRefResolution: 对象不存在 → null(卡片降级隐藏)", () => {
  assert.equal(workRefResolution(null, null, null), null);
});

test("workRefResolution: 浏览者不可见(私密/被屏蔽)→ null,不指向空页", () => {
  const privateWork = fakeWork({ visibility: "private" });
  assert.equal(workRefResolution(privateWork, null, null), null);
  const hidden = fakeWork({ hiddenAt: new Date() });
  assert.equal(workRefResolution(hidden, null, null), null);
  /* 作者本人仍可见 */
  const mine = workRefResolution(privateWork, { id: 3, role: "member" }, 1000);
  assert.ok(mine);
});

test("workRefResolution: 可见作品 → 真实标题/链接/署名/声明徽章", () => {
  const r = workRefResolution(fakeWork({}), null, 612_000_000);
  assert.deepEqual(r, {
    title: "Lunar Orbit",
    href: "/works/7",
    author: "@aklman",
    claimBadge: 612_000_000,
  });
  /* awesome 外部条目无 handle → 用 authorLabel */
  const awesome = workRefResolution(
    fakeWork({ handle: null, authorLabel: "acme-inc" }),
    null,
    null,
  );
  assert.equal(awesome?.author, "acme-inc");
});

function fakePost(partial: Partial<PostDetail>): PostDetail {
  return {
    id: 42,
    title: "PATH-01 讨论帖",
    bodyMd: "",
    handle: "lin_builds",
    visibility: "public",
    hiddenAt: null,
    userId: 9,
    ...partial,
  } as PostDetail;
}

test("postRefResolution: 不存在/不可见 → null;无标题帖回退正文摘要", () => {
  assert.equal(postRefResolution(null, null), null);
  assert.equal(postRefResolution(fakePost({ hiddenAt: new Date() }), null), null);
  const r = postRefResolution(fakePost({}), null);
  assert.deepEqual(r, {
    title: "PATH-01 讨论帖",
    href: "/community/42",
    author: "@lin_builds",
    claimBadge: null,
  });
  const noTitle = postRefResolution(
    fakePost({ title: "", bodyMd: "这条路径第一层卡住了,求指点" }),
    null,
  );
  assert.equal(noTitle?.title, "这条路径第一层卡住了,求指点");
});

/* ---- 毕业归因:slug 校验 ---- */

test("normalizePathSlug: 只接受在册路径 slug,其余置 null", () => {
  const slug = LEARN_PATHS[0].slug;
  assert.equal(normalizePathSlug(slug), slug);
  assert.equal(normalizePathSlug(`  ${slug}  `), slug, "首尾空白容忍");
  assert.equal(normalizePathSlug("no-such-path"), null);
  assert.equal(normalizePathSlug(""), null);
  assert.equal(normalizePathSlug("   "), null);
  assert.equal(normalizePathSlug("x".repeat(65)), null, "超 64 字符拒绝");
  assert.ok(findLearnPath(slug), "夹具 slug 必须在册");
});

/* ---- 毕业归因:落库与统计 ---- */

function fakeFields(partial: Partial<WorkFields>): WorkFields {
  return {
    name: "n",
    tagline: "",
    url: "",
    repoUrl: "https://github.com/x/y",
    screenshotUrl: "",
    tags: [],
    agents: ["kimi"],
    authorLabel: "",
    visibility: "public",
    claimedTokens: null,
    status: "released",
    models: [],
    kind: "app",
    descriptionMd: "",
    scope: null,
    alsoAwesome: false,
    logoKey: "",
    imageKeys: [],
    coverKey: "",
    coverTone: "theme",
    coverFit: "cover",
    aiReply: true,
    sourcePath: null,
    ...partial,
  };
}

test("workInsertQuery: site 作品落 source_path;awesome 条目强制 null", () => {
  const slug = LEARN_PATHS[0].slug;
  const site = workInsertQuery(5, fakeFields({ sourcePath: slug }));
  assert.match(site.sql, /source_path/);
  assert.equal(site.args[0], 5);
  assert.equal(site.args.at(-1), slug);

  const awesome = workInsertQuery(
    5,
    fakeFields({ authorLabel: "ext-author", sourcePath: slug }),
  );
  assert.equal(awesome.args.at(-1), null, "awesome 推荐条目无来源路径语义");

  const none = workInsertQuery(5, fakeFields({ sourcePath: null }));
  assert.equal(none.args.at(-1), null);
});

test("pathGraduatesQuery: 路径毕业作品只取公开未屏蔽的 site 条目", () => {
  const q = pathGraduatesQuery("first-build-with-kimi", 6);
  assert.match(q.sql, /w\.source = 'site'/);
  assert.match(q.sql, /w\.source_path = \?/);
  assert.match(q.sql, /w\.visibility = 'public'/);
  assert.match(q.sql, /w\.hidden_at IS NULL/);
  assert.deepEqual(q.args, ["first-build-with-kimi"]);
});

test("pathGraduationCounts: 各路径毕业数(北极星 #5)", async () => {
  const q = pathGraduationCountsQuery();
  assert.match(q.sql, /GROUP BY w\.source_path/);
  assert.match(q.sql, /w\.source_path IS NOT NULL/);
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return [[
        { source_path: "first-build-with-kimi", n: 3 },
        { source_path: "api-and-usage", n: "2" },
      ]];
    },
  } as unknown as Pool;
  const counts = await pathGraduationCounts(db);
  assert.equal(counts.get("first-build-with-kimi"), 3);
  assert.equal(counts.get("api-and-usage"), 2, "字符串计数转 number");
  assert.equal(counts.size, 2);
  assert.equal(calls.length, 1);
});

/* ---- 保质期常量锚定(plan §二.1 建议 45 天)---- */

test("STALE_AFTER_DAYS = 45", () => {
  assert.equal(STALE_AFTER_DAYS, 45);
  /* 2026-07-03 验证 → 第 45 天(2026-08-17)仍新鲜,第 46 天过期 */
  const stamp = { verifiedModel: CURRENT_KIMI_MODEL, verifiedAt: "2026-07-03" };
  assert.equal(
    isPathStale(stamp, CURRENT_KIMI_MODEL, new Date(Date.UTC(2026, 6, 3) + 45 * DAY)),
    false,
  );
  assert.equal(
    isPathStale(stamp, CURRENT_KIMI_MODEL, new Date(Date.UTC(2026, 6, 3) + 45 * DAY + 1)),
    true,
  );
});

/* ---- 数据卫生(20260921 评审补钉):运营替换 _data.ts 时最容易改坏的四处 ----
   1) 所有 L10n 文案 zh/en 成对非空;2) slug/code 唯一(findLearnPath 按 slug
   取第一个,重复会静默串页);3) 路径 hours = 各层 hours 之和;4) 每条路径至少
   一个 external 资源(ref 依赖真实对象,全 ref 的路径在占位期会整页空)。 */

test("数据卫生:L10n 全部 zh/en 成对非空", () => {
  const bad: string[] = [];
  const check = (where: string, v: { zh: string; en: string }) => {
    if (!v.zh?.trim() || !v.en?.trim()) bad.push(where);
  };
  for (const p of LEARN_PATHS) {
    check(`${p.slug}.title`, p.title);
    check(`${p.slug}.tagline`, p.tagline);
    check(`${p.slug}.summary`, p.summary);
    check(`${p.slug}.achievement.title`, p.achievement.title);
    check(`${p.slug}.achievement.note`, p.achievement.note);
    p.levels.forEach((l, i) => {
      check(`${p.slug}.levels[${i}].name`, l.name);
      check(`${p.slug}.levels[${i}].desc`, l.desc);
      l.learn.forEach((item, j) => check(`${p.slug}.levels[${i}].learn[${j}]`, item));
      l.resources.forEach((r, j) => {
        check(`${p.slug}.levels[${i}].resources[${j}].title`, r.title);
        check(`${p.slug}.levels[${i}].resources[${j}].author`, r.author);
        check(`${p.slug}.levels[${i}].resources[${j}].duration`, r.duration);
        check(`${p.slug}.levels[${i}].resources[${j}].why`, r.why);
      });
      l.branches.forEach((b, j) => {
        check(`${p.slug}.levels[${i}].branches[${j}].title`, b.title);
        check(`${p.slug}.levels[${i}].branches[${j}].meta`, b.meta);
      });
    });
  }
  assert.deepEqual(bad, []);
});

test("数据卫生:slug / code 全局唯一", () => {
  const slugs = LEARN_PATHS.map((p) => p.slug);
  const codes = LEARN_PATHS.map((p) => p.code);
  assert.equal(new Set(slugs).size, slugs.length, `slug 重复:${slugs}`);
  assert.equal(new Set(codes).size, codes.length, `code 重复:${codes}`);
});

test("数据卫生:路径 hours = 各层 hours 之和", () => {
  for (const p of LEARN_PATHS) {
    const sum = p.levels.reduce((n, l) => n + l.hours, 0);
    assert.equal(p.hours, sum, `${p.slug}: hours=${p.hours} ≠ Σlevel=${sum}`);
  }
});

test("数据卫生:每条路径至少一个 external 资源(占位期不全空)", () => {
  for (const p of LEARN_PATHS) {
    const hasExternal = p.levels.some((l) => l.resources.some((r) => r.external));
    assert.ok(hasExternal, `${p.slug} 没有任何 external 资源`);
  }
});
