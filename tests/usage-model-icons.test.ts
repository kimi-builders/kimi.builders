import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ModelIcon from "../components/ModelIcon";

test("MiMo and StepFun render local monochrome vendor marks at the requested size", () => {
  for (const [id, title] of [["stepfun", "StepFun"], ["xiaomimimo", "XiaomiMiMo"]]) {
    const html = renderToStaticMarkup(createElement(ModelIcon, { id, size: 14, context: "chart" }));
    assert.match(html, /<svg/);
    assert.match(html, /fill="currentColor"/);
    assert.match(html, /width="14"/);
    assert.match(html, /height="14"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /focusable="false"/);
    assert.match(html, /shrink-0/);
    assert.ok(html.includes(title), id);
    assert.doesNotMatch(html, /https?:\/\/[^" ]+\.(?:svg|png|webp)/);
  }
  assert.equal(renderToStaticMarkup(createElement(ModelIcon, { id: "unknown" })), "");
});

test("usage model surfaces share the same vendor resolver and preserve pricing explanations", () => {
  for (const path of [
    "app/(app)/usage/page.tsx",
    "components/UsageAttributionSummary.tsx",
    "app/(app)/usage/_components/UsageRecordsSection.tsx",
    "app/(app)/usage/leaderboard/page.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /<ModelIcon/);
    assert.match(source, /usageModelIconId\(/);
    assert.doesNotMatch(source, /function modelIconId\(/);
  }
  const icons = readFileSync("components/ModelIcon.tsx", "utf8");
  assert.match(icons, /@lobehub\/icons\/es\/Stepfun\/components\/Mono/);
  assert.match(icons, /@lobehub\/icons\/es\/XiaomiMiMo\/components\/Mono/);
  assert.doesNotMatch(icons, /from ["']@lobehub\/icons["']/);
  const dialog = readFileSync("app/(app)/usage/_components/UsageMethodologyDialog.tsx", "utf8");
  assert.match(dialog, /zh \? row\.pricingNote\.zh : row\.pricingNote\.en/);
  assert.doesNotMatch(dialog, /official price unpublished|官方价格未公布/);
  assert.match(readFileSync("src/lib/usage/query.ts", "utf8"), /pricingNote: matched\?\.pricingNote/);
});
