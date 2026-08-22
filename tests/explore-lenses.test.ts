import assert from "node:assert/strict";
import test from "node:test";
import {
  KB_PRODUCTS,
  isKbProductId,
  kbProductLabel,
} from "../src/lib/kb-products";
import {
  KB_ROLES,
  isKbRoleId,
  kbRoleLabel,
} from "../src/lib/kb-roles";
import {
  countByProduct,
  countByRoles,
  deriveFormats,
  filterExploreItems,
  roleLandingEligible,
  type ExploreItem,
} from "../src/lib/explore";
import {
  guidePayloadFromDb,
  validateGuidePayload,
} from "../src/lib/tutorials";

/* ---- 透镜词表注册表 ---- */

test("kb-products: ids unique, labels bilingual, lookup helpers", () => {
  const ids = KB_PRODUCTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of KB_PRODUCTS) {
    assert.ok(p.id && p.zh && p.en && p.icon, `${p.id} fields complete`);
  }
  assert.equal(isKbProductId("kimi-code"), true);
  assert.equal(isKbProductId("nope"), false);
  assert.equal(kbProductLabel("sheet", true), "表格");
  assert.equal(kbProductLabel("sheet", false), "Sheets");
  assert.equal(kbProductLabel("nope", true), null);
});

test("kb-roles: ids unique, labels bilingual, lookup helpers", () => {
  const ids = KB_ROLES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(isKbRoleId("lawyer"), true);
  assert.equal(isKbRoleId("nope"), false);
  assert.equal(kbRoleLabel("lawyer", true), "律师");
  assert.equal(kbRoleLabel("lawyer", false), "Lawyer");
});

/* ---- guide payload 契约:透镜与资源分型(严格校验 / 容错渲染分离) ---- */

test("validateGuidePayload: lens slugs must be registered, ≤3, deduped", () => {
  const ok = validateGuidePayload({
    products: ["kimi-code", "kimi-code", "plugin"],
    roles: ["software", "student"],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.payload.products, ["kimi-code", "plugin"]);
    assert.deepEqual(ok.payload.roles, ["software", "student"]);
  }
  assert.equal(validateGuidePayload({ products: ["nope"] }).ok, false);
  assert.equal(validateGuidePayload({ roles: ["nope"] }).ok, false);
  assert.equal(
    validateGuidePayload({ products: ["kimi-code", "kimi-design", "kimi-claw", "plugin"] }).ok,
    false,
  );
  assert.equal(validateGuidePayload({ products: [] }).ok, false);
  assert.equal(validateGuidePayload({ products: "kimi-code" }).ok, false);
  /* 空对象与未知字段照旧 */
  assert.equal(validateGuidePayload({}).ok, true);
  assert.equal(validateGuidePayload({ stray: 1 }).ok, false);
});

test("validateGuidePayload: resource kind is whitelisted", () => {
  assert.equal(
    validateGuidePayload({
      resources: [{ label: "官方", url: "https://example.com", kind: "official" }],
    }).ok,
    true,
  );
  assert.equal(
    validateGuidePayload({
      resources: [{ label: "坏", url: "https://example.com", kind: "weird" }],
    }).ok,
    false,
  );
});

test("guidePayloadFromDb: invalid lens items dropped, page survives", () => {
  const payload = guidePayloadFromDb({
    products: ["kimi-code", "nope", "sheet"],
    roles: ["lawyer", 42],
    resources: [{ label: "提示词", url: "/p/1", kind: "prompt" }],
  });
  assert.deepEqual(payload.products, ["kimi-code", "sheet"]);
  assert.deepEqual(payload.roles, ["lawyer"]);
  assert.deepEqual(payload.resources, [{ label: "提示词", url: "/p/1", kind: "prompt" }]);
  /* 非法 kind 渲染回落为无 kind(默认推荐资源组) */
  const lenient = guidePayloadFromDb({
    resources: [{ label: "x", url: "/x", kind: "weird" }],
  });
  assert.deepEqual(lenient.resources, [{ label: "x", url: "/x" }]);
});

/* ---- 形态推导(派生不说谎) ---- */

test("deriveFormats: presence-driven, read first", () => {
  assert.deepEqual(deriveFormats("正文", {}), ["read"]);
  assert.deepEqual(deriveFormats("", { video: { provider: "bilibili", id: "BV1" } }), ["video"]);
  assert.deepEqual(deriveFormats(null, { deck: "/d.html" }), ["deck"]);
  assert.deepEqual(
    deriveFormats("  ", { video: { id: "x" }, deck: "/d" }),
    ["video", "deck"],
  );
  assert.deepEqual(deriveFormats("稿", { video: { id: "x" }, deck: "/d" }), [
    "read",
    "video",
    "deck",
  ]);
  assert.deepEqual(deriveFormats(undefined, {}), []);
});

/* ---- 透镜计数 / 过滤 / 落地页门槛 ---- */

function item(partial: Partial<ExploreItem>): ExploreItem {
  return {
    slug: "x",
    kind: "guide",
    title: "x",
    summary: "",
    locale: "zh",
    fallback: false,
    publishedAt: new Date("2026-08-01"),
    editorHandle: "e",
    series: null,
    tags: [],
    products: [],
    roles: [],
    formats: ["read"],
    ...partial,
  };
}

const LENS_ITEMS = [
  item({ slug: "a", products: ["kimi-code"], roles: ["software"], formats: ["read", "video"] }),
  item({ slug: "b", products: ["kimi-code", "plugin"], roles: ["software", "student"] }),
  item({ slug: "c", products: ["sheet"], roles: ["software"] }),
  item({ slug: "d", roles: ["lawyer"] }),
];

test("countByProduct / countByRoles: registry order, zero counts dropped", () => {
  /* 词表序(kb-products.ts):kimi-code(0) < sheet(6) < plugin(9),
     计数并列时按词表位次,主产品永远靠前 */
  assert.deepEqual(countByProduct(LENS_ITEMS), [
    { value: "kimi-code", count: 2 },
    { value: "sheet", count: 1 },
    { value: "plugin", count: 1 },
  ]);
  /* 0 计数的产品(chip 之外)完全不出 */
  assert.equal(
    countByProduct(LENS_ITEMS).some((c) => c.value === "kimi-design"),
    false,
  );
  /* 词表序(kb-roles.ts):student(0) < lawyer(1) < software(12) */
  assert.deepEqual(countByRoles(LENS_ITEMS), [
    { value: "student", count: 1 },
    { value: "lawyer", count: 1 },
    { value: "software", count: 3 },
  ]);
});

test("filterExploreItems: product / role / format conditions compose", () => {
  assert.deepEqual(
    filterExploreItems(LENS_ITEMS, { product: "kimi-code" }).map((i) => i.slug),
    ["a", "b"],
  );
  assert.deepEqual(
    filterExploreItems(LENS_ITEMS, { role: "software", product: "kimi-code" }).map((i) => i.slug),
    ["a", "b"],
  );
  assert.deepEqual(
    filterExploreItems(LENS_ITEMS, { format: "video" }).map((i) => i.slug),
    ["a"],
  );
  /* 组合空集 = 空数组(页面层给放宽筛选,不给死胡同) */
  assert.deepEqual(filterExploreItems(LENS_ITEMS, { role: "lawyer", product: "kimi-code" }), []);
});

test("roleLandingEligible: landing page needs ≥3 published units", () => {
  assert.equal(roleLandingEligible(LENS_ITEMS, "software"), true);
  assert.equal(roleLandingEligible(LENS_ITEMS, "lawyer"), false);
  assert.equal(roleLandingEligible([], "software"), false);
});
