import assert from "node:assert/strict";
import test from "node:test";
import {
  isModelFamily,
  MODEL_FAMILIES,
  modelFamilyName,
} from "../src/lib/model-families";
import { AGENTS } from "../src/lib/agents";

/* ---- 模型家族/Agent 注册表的双语与成员钉 ---- */

test("modelFamilyName: Chinese families get English names in en locale", () => {
  assert.equal(modelFamilyName("doubao", "zh"), "豆包");
  assert.equal(modelFamilyName("doubao", "en"), "Doubao");
  assert.equal(modelFamilyName("wenxin", "zh"), "文心一言");
  assert.equal(modelFamilyName("wenxin", "en"), "ERNIE Bot");
});

test("modelFamilyName: latin families are identical in both locales", () => {
  for (const f of MODEL_FAMILIES) {
    if (f.id === "doubao" || f.id === "wenxin") continue;
    assert.equal(modelFamilyName(f.id, "en"), modelFamilyName(f.id, "zh"));
  }
});

test("modelFamilyName: unknown id falls back to the raw id", () => {
  assert.equal(modelFamilyName("some-custom-model", "en"), "some-custom-model");
  assert.ok(!isModelFamily("some-custom-model"));
});

test("agents registry: zcode / codebuddy / pi-agent present, qwen stays a model family", () => {
  const ids = AGENTS.map((a) => a.id);
  for (const id of ["zcode", "codebuddy", "pi-agent", "qoder"]) {
    assert.ok(ids.includes(id as never), `agent ${id}`);
  }
  assert.ok(!ids.includes("qwen" as never), "qwen is a model family, not an agent");
  assert.ok(isModelFamily("qwen"));
});
