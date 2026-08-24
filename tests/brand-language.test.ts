import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BOT_NAME } from "../src/lib/bot-identity";
import { articleLanguageLabel, t } from "../src/lib/i18n";
import { detailMetadata, languageTaggedTitle } from "../src/lib/page-metadata";
import { normalizePosterLocale } from "../src/lib/poster-locale";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const monthlyDetail = readFileSync(
  new URL("../app/(app)/explore/[slug]/page.tsx", import.meta.url),
  "utf8",
);
const i18n = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");
const aiReply = readFileSync(new URL("../src/lib/ai-reply.ts", import.meta.url), "utf8");
const emailTemplates = readFileSync(
  new URL("../src/lib/email-templates.ts", import.meta.url),
  "utf8",
);
const workPoster = readFileSync(
  new URL("../app/api/share/work/[id]/WorkSharePoster.tsx", import.meta.url),
  "utf8",
);
const profilePage = readFileSync(
  new URL("../app/(app)/u/[handle]/page.tsx", import.meta.url),
  "utf8",
);
const workDetail = readFileSync(
  new URL("../app/(app)/works/[id]/page.tsx", import.meta.url),
  "utf8",
);
const seriesDetail = readFileSync(
  new URL("../app/(app)/explore/series/[slug]/page.tsx", import.meta.url),
  "utf8",
);
const chapters = readFileSync(new URL("../src/lib/kb-chapters.ts", import.meta.url), "utf8");
const usageShare = readFileSync(new URL("../src/lib/usage/share.ts", import.meta.url), "utf8");
const usagePoster = readFileSync(
  new URL("../app/api/usage/share/UsageSharePoster.tsx", import.meta.url),
  "utf8",
);
const posterComponents = [
  "../app/api/share/post/[id]/PostSharePoster.tsx",
  "../app/api/share/work/[id]/WorkSharePoster.tsx",
  "../app/api/share/u/[handle]/ProfileSharePoster.tsx",
  "../app/api/share/letter/[slug]/LetterSharePoster.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const posterRoutes = [
  "../app/api/share/post/[id]/route.tsx",
  "../app/api/share/work/[id]/route.tsx",
  "../app/api/share/u/[handle]/route.tsx",
  "../app/api/share/letter/[slug]/route.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const explorePage = readFileSync(
  new URL("../app/(app)/explore/page.tsx", import.meta.url),
  "utf8",
);
const exploreRail = readFileSync(
  new URL("../app/(app)/_components/rail/ExploreRail.tsx", import.meta.url),
  "utf8",
);
const detailRouteSources = [
  "../app/(app)/community/[id]/page.tsx",
  "../app/(app)/works/[id]/page.tsx",
  "../app/(app)/explore/[slug]/page.tsx",
  "../app/(app)/explore/series/[slug]/page.tsx",
  "../app/(app)/u/[handle]/page.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("home uses one positioning line across locales", () => {
  assert.equal(home.match(/t\(locale, "home\.tagline"\)/g)?.length ?? 0, 1);
  assert.doesNotMatch(home, /BUILD REAL THINGS WITH KIMI/);
  assert.equal(t("zh", "home.tagline"), "Build with Kimi. Show your work.");
  assert.equal(t("en", "home.tagline"), "Build with Kimi. Show your work.");
  assert.equal(
    t("zh", "site.metaTitle"),
    "kimi.builders — Build with Kimi. Show your work.",
  );
  assert.equal(
    t("en", "site.metaTitle"),
    "kimi.builders — Build with Kimi. Show your work.",
  );
  assert.equal(t("zh", "home.cta"), "浏览社区");
  assert.equal(t("en", "home.cta"), "Browse the community");
});

test("community AI copy identifies Xiaozhu without implying an official Kimi bot", () => {
  const generatedCopy = [i18n, aiReply, emailTemplates].join("\n");
  assert.equal(BOT_NAME, "小筑");
  assert.doesNotMatch(generatedCopy, /Kimi 小筑|Kimi bot|SUMMON KIMI/);
  assert.doesNotMatch(
    generatedCopy,
    /非商业 builder 社区|community of Kimi builders|community of builders/,
  );
  assert.match(aiReply, /非商业 Builder 社区/);
  assert.match(emailTemplates, /community for Builders using Kimi/);
  assert.equal(t("zh", "rail.aiSummon"), "召唤小筑分析");
  assert.equal(t("en", "rail.aiSummon"), "ASK XIAOZHU");
  assert.equal(t("en", "post.aiJoin"), "Xiaozhu joins");
  assert.equal(t("en", "post.aiReplied"), "Xiaozhu replied");
  assert.equal(
    t("en", "form.aiReply"),
    "Allow Xiaozhu, the community AI, to reply",
  );
});

test("about and Awesome state scope without unverifiable promotion", () => {
  assert.doesNotMatch(
    i18n,
    /这里没有空话|No fluff|全世界|around the world|worldwide|The bar is deliberately low|yours belongs|值得上榜/,
  );
  assert.match(t("zh", "about.who"), /核验线索，不构成官方认证/);
  assert.match(t("en", "about.who"), /verification clues; they are not official certification/);
  assert.match(t("zh", "awesome.intro"), /成员推荐的站外 Kimi 生态项目/);
  assert.match(t("en", "awesome.intro"), /External Kimi ecosystem projects recommended by members/);
  assert.equal(t("zh", "home.joinAwesome"), "符合收录口径的项目，可由成员推荐。");
});

test("work token claims disclose aggregate caps and per-project limits", () => {
  assert.match(t("zh", "works.wallIntro"), /已同步总用量封顶/);
  assert.match(t("zh", "works.wallIntro"), /不代表单个作品的精确用量/);
  assert.match(t("en", "works.wallIntro"), /capped by synced aggregate usage/);
  assert.match(t("en", "works.wallIntro"), /not exact per-project usage/);
  assert.equal(t("en", "works.claim"), "Declared tokens (optional)");
  assert.doesNotMatch(t("en", "works.claimHint"), /verified|verifiable|build effort/i);
  assert.match(workPoster, /按已同步总用量封顶 · 非单作品精确用量/);
  assert.doesNotMatch(workPoster, /声明构建投入|可验证总量/);
});

test("detail metadata replaces root social fields and keeps route canonicals", () => {
  const metadata = detailMetadata({
    title: "A detail — kimi.builders",
    description: "Detail description",
    path: "/explore/a-detail",
    locale: "en",
    type: "article",
  });
  assert.equal(metadata.alternates?.canonical, "/explore/a-detail");
  assert.equal(metadata.openGraph?.title, "A detail — kimi.builders");
  assert.equal(metadata.openGraph?.description, "Detail description");
  assert.equal(metadata.openGraph?.url, "/explore/a-detail");
  assert.equal(metadata.twitter?.title, "A detail — kimi.builders");
  assert.equal(metadata.twitter?.description, "Detail description");
  for (const source of detailRouteSources) {
    assert.match(source, /detailMetadata\(\{/);
  }
  assert.match(detailRouteSources[4], /profileDisplay\(p, false\)/);
});

test("Explore hides sparse chapter dimensions and uses a wrapping control", () => {
  assert.match(explorePage, /chapterFilterVisible = activeChapters\.length >= 2/);
  assert.match(explorePage, /SEG_WRAP_FLOW/);
  assert.match(explorePage, /activeChapters\.map/);
  assert.doesNotMatch(explorePage, /KB_CHAPTERS\.map|zero-count chapters grey/);
  assert.match(exploreRail, /activeChapters\.length >= 2/);
  assert.match(exploreRail, /Methods, evidence, and sources\./);
  assert.doesNotMatch(exploreRail, /every piece ships|KB_CHAPTERS\.map/);
});

test("usage language describes observable usage rather than inferred building", () => {
  const generatedCopy = [i18n, usageShare, usagePoster].join("\n");
  assert.equal(t("zh", "prof.footprint"), "用量记录");
  assert.equal(t("en", "prof.footprint"), "USAGE HISTORY");
  assert.equal(t("zh", "prof.statStreak"), "连续活跃");
  assert.equal(t("en", "prof.statStreak"), "ACTIVITY STREAK");
  assert.equal(t("zh", "prof.prefs"), "使用分布");
  assert.equal(t("en", "prof.prefs"), "Usage breakdown");
  assert.doesNotMatch(
    generatedCopy,
    /构建足迹|连续构建|构建偏好|构建脉冲|天有构建|BUILD FOOTPRINT|BUILD PULSE|Build preferences/,
  );
});

test("Explore format labels and chapter English avoid literal translation", () => {
  assert.doesNotMatch(chapters, /Turn judgment into things you made|Turn results into standing and self/);
  assert.match(monthlyDetail, /label: zh \? "文稿" : "Article"/);
  assert.match(monthlyDetail, /label: zh \? "演示稿" : "Slides"/);
  assert.match(seriesDetail, /zh \? "文稿" : "ARTICLE"/);
  assert.doesNotMatch(monthlyDetail, /label: zh \? "文稿" : "Read"|label: zh \? "演示稿" : "Deck"/);
});

test("work links default to open project and reserve try-it for demos", () => {
  assert.equal(t("zh", "works.openProject"), "打开作品");
  assert.equal(t("en", "works.openProject"), "Open project");
  assert.match(workDetail, /work\.kind === "demo" \? "works\.tryIt" : "works\.openProject"/);
});

test("content fallback labels and social titles use the UI language", () => {
  assert.equal(articleLanguageLabel("en", "zh", true), "Chinese (fallback)");
  assert.equal(articleLanguageLabel("zh", "en", true), "英文（回退）");
  assert.equal(languageTaggedTitle("原文标题", "en", "zh", true), "[Chinese] 原文标题");
  assert.equal(languageTaggedTitle("Original title", "zh", "en", true), "[英文] Original title");
  assert.equal(languageTaggedTitle("Same language", "en", "en", false), "Same language");
  assert.match(monthlyDetail, /articleLanguageLabel\(locale, tutorial\.locale, true\)/);
  assert.match(seriesDetail, /articleLanguageLabel\(zh \? "zh" : "en", ep\.locale, true\)/);
});

test("share posters use explicit locale variants", () => {
  assert.equal(normalizePosterLocale("en"), "en");
  assert.equal(normalizePosterLocale("zh"), "zh");
  assert.equal(normalizePosterLocale("anything"), "zh");
  for (const route of posterRoutes) {
    assert.match(route, /normalizePosterLocale\(request\.nextUrl\.searchParams\.get\("locale"\)\)/);
    assert.match(route, /locale=\{locale\}/);
  }
  for (const component of posterComponents) {
    assert.match(component, /locale: Locale/);
    assert.match(component, /locale === "zh"/);
  }
  assert.match(monthlyDetail, /locale=\$\{locale\}/);
  assert.match(workDetail, /locale=\$\{locale\}/);
  assert.match(profilePage, /locale=\$\{locale\}/);
});

test("Chinese dictionary copy uses fullwidth prose punctuation and Token casing", () => {
  const values = [...i18n.matchAll(/\bzh:\s*"((?:\\.|[^"\\])*)"/g)].map((match) => match[1]);
  assert.ok(values.length > 900);
  for (const value of values) {
    const prose = value
      .replace(/http\(s\):\/\//g, "")
      .replace(/\d+:\d+/g, "")
      .replace(/快捷键（\?）|按 \? 随时/g, "")
      .replace(/\?[a-z][\w-]*=/gi, "");
    assert.doesNotMatch(prose, /[,;():?]/, value);
    assert.doesNotMatch(value, /\btokens?\b/, value);
  }
});

test("monthly footer describes share links without claiming translations", () => {
  assert.doesNotMatch(monthlyDetail, /Published in both languages|中英双发/);
  assert.match(monthlyDetail, /本刊各节均有独立链接/);
  assert.match(monthlyDetail, /Each section has its own shareable link/);
});

test("error copy avoids guarantees about unknown write outcomes", () => {
  assert.doesNotMatch(
    i18n,
    /你的数据没有丢失|Your data is safe|没有修改你的数据|didn't modify your data/,
  );
  assert.match(t("zh", "state.errorBody"), /请先不要重复操作/);
  assert.match(t("en", "state.errorBody"), /avoid repeating the action/);
  assert.match(t("zh", "usageErr.body"), /错误编号/);
  assert.match(t("en", "usageErr.body"), /error reference/);
});
