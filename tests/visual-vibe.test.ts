import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* ---- 视觉气质(kb_vibe: poster 默认 / soft)的源码钉(20260815 拍板)----
   实现原理:Tailwind v4 的 rounded-* 全部解析为 var(--radius-*),投影经
   --tw-shadow 组合,因此气质切换 = globals.css 覆盖变量,组件零改动跟随。
   本测试钉住管线四环:变量块存在、<html data-vibe> 直出、cookie 解析、
   切换入口(TopBar/抽屉/设置页)与无 JS 兜底 action——任何一环被误删,
   气质切换会静默退化成"永远经典",这里负责第一时间红。 ---- */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("globals.css: poster vibe zeroes radius/shadow and flattens card wash", () => {
  const css = read("app/globals.css");
  assert.match(css, /:root\[data-vibe="poster"\]\s*\{[\s\S]*?--radius-2xl: 0px/);
  assert.match(css, /--radius-lg: 0px/);
  /* 裸 rounded 与 rounded-4xl 不在 xs…3xl 序列里,归零须显式列出(20260816 补漏) */
  assert.match(css, /:root\[data-vibe="poster"\]\s*\{[\s\S]*?--radius: 0px/);
  assert.match(css, /--radius-4xl: 0px/);
  /* 投影置空必须只灭 --tw-shadow 一项(ring/焦点环走独立变量,不得波及) */
  assert.match(css, /:root\[data-vibe="poster"\][^{]*\{[\s\S]*?--tw-shadow: 0 0 #0000/);
  assert.match(css, /:root\[data-vibe="poster"\]\s*\{[\s\S]*?--color-card:/);
  /* 首页海报作用域(跟随 UI 主题,scope="poster")就近重声明令牌,
     poster 的降档必须显式跟进 */
  assert.match(css, /:root\[data-vibe="poster"\] \[data-theme-scope="poster"\]/);
  /* 设置页气质卡激活态 */
  assert.match(css, /html\[data-vibe="poster"\] \.vibe-card-poster/);
});

test("root layout SSR-writes data-vibe from prefs (no-flash first paint)", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /data-vibe=\{prefs\.vibe\}/);
});

test("prefs: kb_vibe parses with poster as default", () => {
  const prefs = read("src/lib/prefs.ts");
  assert.match(prefs, /vibe: store\.get\("kb_vibe"\)\?\.value === "soft" \? "soft" : "poster"/);
});

test("vibe surfaces: toggle in topbar/drawer, cards in settings, no-JS fallbacks", () => {
  const topbar = read("app/(app)/_components/TopBar.tsx");
  assert.ok(topbar.includes("VibeToggle"), "topbar has vibe toggle");

  const drawer = read("app/(app)/_components/MobileNavDrawer.tsx");
  assert.ok(drawer.includes("VibeToggle"), "mobile drawer has vibe toggle");

  const settings = read("app/(app)/settings/_components/SettingsContent.tsx");
  assert.ok(settings.includes("VibeCards"), "settings page has vibe cards");

  const communityActions = read("app/(app)/community/actions.ts");
  assert.ok(communityActions.includes("setVibeAction"), "toggle fallback action");

  const settingsActions = read("app/(app)/settings/actions.ts");
  assert.ok(settingsActions.includes("setVibeToAction"), "explicit pick fallback action");
});
