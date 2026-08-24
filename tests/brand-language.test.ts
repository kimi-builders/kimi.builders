import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { t } from "../src/lib/i18n";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const monthlyDetail = readFileSync(
  new URL("../app/(app)/explore/[slug]/page.tsx", import.meta.url),
  "utf8",
);
const i18n = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");

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
  assert.doesNotMatch(i18n, /Kimi bot/);
  assert.equal(t("en", "post.aiJoin"), "Xiaozhu joins");
  assert.equal(t("en", "post.aiReplied"), "Xiaozhu replied");
  assert.equal(
    t("en", "form.aiReply"),
    "Allow Xiaozhu, the community AI, to reply",
  );
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
