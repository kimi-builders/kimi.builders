import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NAV_HIDDEN, UPCOMING } from "../src/lib/upcoming";

/* ---- 未就绪板块开关(src/lib/upcoming.ts)的源码钉:
   月刊 / 知识库 / Demo Night 关闸期间,页面、导航、搜索、右栏四处必须一致;
   Demo Night 近期不上线,入口连 SOON 标都不挂,直接屏蔽(NAV_HIDDEN)。
   开闸(改 false)时需要同步删掉这些分支,测试会提醒。 ---- */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("upcoming flags: blog / learn / demoNight are gated until content is ready", () => {
  /* 内容就绪后把对应项改 false 并清理分支——见 src/lib/upcoming.ts 注释 */
  assert.deepEqual(UPCOMING, { blog: true, learn: true, demoNight: true });
});

test("nav-hidden flags: demoNight entries are removed, not just badged", () => {
  assert.deepEqual(NAV_HIDDEN, { demoNight: true });
});

test("gated pages short-circuit to SoonPanel before any data fetch", () => {
  const gated: Array<[string, string]> = [
    ["app/(app)/blog/page.tsx", "UPCOMING.blog"],
    ["app/(app)/blog/[slug]/page.tsx", "UPCOMING.blog"],
    ["app/(app)/blog/admin/new/page.tsx", "UPCOMING.blog"],
    ["app/(app)/blog/admin/[slug]/edit/page.tsx", "UPCOMING.blog"],
    ["app/(app)/learn/page.tsx", "UPCOMING.learn"],
    ["app/(app)/learn/[slug]/page.tsx", "UPCOMING.learn"],
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
  for (const path of [
    "app/(app)/_components/LeftNav.tsx",
    "app/(app)/_components/MobileNavDrawer.tsx",
  ]) {
    const source = read(path);
    assert.ok(source.includes("soon: UPCOMING.blog"), `${path} blog soon`);
    assert.ok(source.includes("soon: UPCOMING.learn"), `${path} learn soon`);
    assert.ok(
      source.includes("hidden: NAV_HIDDEN.demoNight"),
      `${path} demoNight hidden`,
    );
    assert.match(source, /\.filter\(\(\w+\) => !\w+\.hidden\)/, `${path} filters hidden`);
  }
  const search = read("app/(app)/_components/GlobalSearch.tsx");
  assert.ok(search.includes("soon(locale, UPCOMING.learn)"), "search learn soon");
  assert.ok(search.includes("soon(locale, UPCOMING.blog)"), "search blog soon");
  assert.ok(
    search.includes("NAV_HIDDEN.demoNight"),
    "search drops demoNight while nav-hidden",
  );
});

test("dedicated blog/learn rails fall back to community while gated", () => {
  const rail = read("app/(app)/_components/right-rail.ts");
  assert.match(rail, /!UPCOMING\.blog && p === "\/blog"/);
  assert.match(rail, /!UPCOMING\.learn && \(p === "\/learn"/);
});
