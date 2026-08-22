import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NAV_HIDDEN, UPCOMING } from "../src/lib/upcoming";

/* ---- 未就绪板块开关(src/lib/upcoming.ts)的源码钉:
   探索区 / Demo Night 关闸期间,页面、导航、搜索、右栏四处必须一致;
   Demo Night 近期不上线,入口连 SOON 标都不挂,直接屏蔽(NAV_HIDDEN)。
   20260821:blog/learn 合并为 explore(月刊 × 教程同一文章架),
   旧 /blog、/learn 页面层 301,不再挂闸门分支。 ---- */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("upcoming flags: explore open; demoNight stays gated", () => {
  /* explore 于 20260821 开闸(四维内容架,空内容是诚实空态);
     demoNight 仍关闸。UPCOMING 分支保留在页面里,随时可重新关闸。 */
  assert.deepEqual(UPCOMING, { explore: false, demoNight: true });
});

test("nav-hidden flags: demoNight entries are removed, not just badged", () => {
  assert.deepEqual(NAV_HIDDEN, { demoNight: true });
});

test("gated pages short-circuit to SoonPanel before any data fetch", () => {
  const gated: Array<[string, string]> = [
    ["app/(app)/explore/page.tsx", "UPCOMING.explore"],
    ["app/(app)/explore/[slug]/page.tsx", "UPCOMING.explore"],
    ["app/(app)/explore/series/[slug]/page.tsx", "UPCOMING.explore"],
    ["app/(app)/blog/admin/new/page.tsx", "UPCOMING.explore"],
    ["app/(app)/blog/admin/[slug]/edit/page.tsx", "UPCOMING.explore"],
    ["app/(app)/demo-night/page.tsx", "UPCOMING.demoNight"],
  ];
  for (const [path, flag] of gated) {
    const source = read(path);
    assert.match(source, /SoonPanel/, `${path} renders SoonPanel`);
    assert.ok(
      source.includes(`if (${flag})`),
      `${path} gates on ${flag} before data fetching`,
    );
  }
});

test("nav surfaces: SOON badge for gated, hidden for nav-hidden", () => {
  const left = read("app/(app)/_components/LeftNav.tsx");
  assert.ok(left.includes("soon: UPCOMING.explore"), "LeftNav explore soon");
  assert.ok(
    left.includes("hidden: NAV_HIDDEN.demoNight"),
    "LeftNav demoNight hidden",
  );
  /* 20260815 评审:LeftNav 把分区拆成 live/soon 两组渲染,过滤谓词是
     复合表达式(!s.hidden && !s.soon),只钉「hidden 必须被过滤」的语义 */
  assert.match(left, /\.filter\(\(\w+\) => !\w+\.hidden/, "LeftNav filters hidden");
  /* 移动端抽屉与桌面共享同一份 SECTIONS 注册表(20260821 开闸同步):
     两端入口永远一致,不允许再出现本地副本 */
  const drawer = read("app/(app)/_components/MobileNavDrawer.tsx");
  assert.ok(
    drawer.includes(`import { SECTIONS } from "./LeftNav"`),
    "drawer shares the LeftNav SECTIONS registry",
  );
  assert.match(drawer, /\.filter\(\(\w+\) => !\w+\.hidden/, "drawer filters hidden");
  const search = read("app/(app)/_components/GlobalSearch.tsx");
  assert.ok(search.includes("soon(locale, UPCOMING.explore)"), "search explore soon");
  assert.ok(
    search.includes("NAV_HIDDEN.demoNight"),
    "search drops demoNight while nav-hidden",
  );
});

test("dedicated explore rail falls back to community while gated", () => {
  const rail = read("app/(app)/_components/right-rail.ts");
  assert.match(rail, /!UPCOMING\.explore && \(p === "\/explore"/);
});
