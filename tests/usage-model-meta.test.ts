import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalUsageModel,
  usageModelDetail,
  usageModelDisplayName,
  usageModelIconId,
} from "../src/lib/usage/model-meta";

test("usage vendor icons recognize provider-qualified IDs without rewriting model identity", () => {
  for (const [model, icon] of [
    ["xiaomi/mimo-v2.6-pro", "xiaomimimo"],
    ["xiaomi_mimo/MiMo-V2.6-Flash", "xiaomimimo"],
    ["mimo-v2.6-pro-ultraspeed", "xiaomimimo"],
    ["mimo-v2.5-pro", "xiaomimimo"],
    ["stepfun/step-5-preview", "stepfun"],
    ["Step-3.7-Flash", "stepfun"],
    ["step-1o-turbo-vision", "stepfun"],
    ["stepaudio-3-realtime-preview", "stepfun"],
    ["step-audio-r1.5", "stepfun"],
    ["openrouter/qwen/qwen3.8-flash", "qwen"],
    ["gpt-6.1-sol", "openai"],
    ["minimax-m3", "minimax"],
    ["step-by-step-custom", ""],
    ["custom-model", ""],
    ["__other__", ""],
  ]) {
    assert.equal(usageModelIconId({ source: "codex", model }), icon, model);
  }
  assert.equal(usageModelIconId({ model: "custom-model", modelProvider: "stepfun" }), "");
  const identity = { model: "xiaomi/mimo-v2.6-pro", modelCanonical: "mimo-v2.5-pro" };
  assert.equal(canonicalUsageModel(identity), "mimo-v2.5-pro");
  assert.equal(usageModelDisplayName(identity), identity.model);
});

test("provider-qualified current model names keep their raw details", () => {
  const identity = { model: "xiaomi/mimo-v2.6-pro", modelProvider: "xiaomi" };
  assert.equal(usageModelDisplayName(identity), "MiMo V2.6 Pro");
  assert.equal(canonicalUsageModel(identity), identity.model);
  assert.match(usageModelDetail(identity), /xiaomi\/mimo-v2.6-pro/);
  assert.equal(usageModelDisplayName({ model: "stepfun/step-3.7-flash" }), "Step 3.7 Flash");
  assert.equal(usageModelDisplayName({ model: "stepfun/step-3.7-flash-custom" }), "stepfun/step-3.7-flash-custom");
});

test("Kimi raw aliases retain detail and resolve to precise canonical IDs", () => {
  const identity = { source: "kimi-code", model: "kimi-code/kimi-for-coding-highspeed" };
  assert.equal(canonicalUsageModel(identity), "kimi-k2.7-code-highspeed");
  assert.equal(usageModelDisplayName(identity), "Kimi K2.7 Code Highspeed");
  assert.match(usageModelDetail(identity), /kimi-code\/kimi-for-coding-highspeed/);
  assert.equal(
    canonicalUsageModel({ source: "kimi-code", model: "kimi-code/kimi-for-coding" }),
    "kimi-k2.8-preview",
  );
  assert.equal(
    canonicalUsageModel({
      source: "kimi-code",
      model: "kimi-code/kimi-for-coding",
      bucketStart: "2026-09-10T23:59:59.999Z",
    }),
    "kimi-k2.7-code",
  );
  assert.equal(
    canonicalUsageModel({
      source: "kimi-code",
      model: "kimi-code/kimi-for-coding",
      modelCanonical: "kimi-k2.7-code",
      bucketStart: "2026-09-11T00:00:00.000Z",
    }),
    "kimi-k2.8-preview",
  );
  assert.equal(
    usageModelDisplayName({ source: "kimi-code", model: "kimi-code/kimi-for-coding" }),
    "Kimi K2.8 Preview",
  );
});

test("K3 context-window variants remain separate", () => {
  assert.equal(canonicalUsageModel({ source: "kimi-code", model: "kimi-code/k3" }), "kimi-k3");
  assert.equal(
    canonicalUsageModel({ source: "kimi-code", model: "kimi-code/k3-256k" }),
    "kimi-k3-256k",
  );
  assert.equal(
    canonicalUsageModel({ source: "kimi-code", model: "kimi-code/k3-256" }),
    "kimi-k3-256k",
  );
  assert.equal(canonicalUsageModel({ model: "kimi-k2.6" }), "kimi-k2.6");
  assert.equal(canonicalUsageModel({ model: "kimi-k2.5" }), "kimi-k2.5");
});

test("current model labels preserve raw IDs and stored canonical versions", () => {
  for (const [model, label] of [
    ["gpt-6.1-sol", "GPT-6.1 Sol"],
    ["gpt-6-sol", "GPT-6 Sol"],
    ["gpt-6-luna", "GPT-6 Luna"],
    ["claude-opus-5-5", "Claude Opus 5.5"],
    ["claude-sonnet-5-5", "Claude Sonnet 5.5"],
    ["claude-haiku-5-5", "Claude Haiku 5.5"],
    ["deepseek-flash", "DeepSeek V4.1 Flash"],
    ["deepseek-v4.1-flash", "DeepSeek V4.1 Flash"],
    ["grok-4.7", "Grok 4.7"],
    ["glm-5.3-flashx", "GLM-5.3 FlashX"],
    ["qwen3.8-flash", "Qwen3.8 Flash"],
    ["mimo-v2.6-pro", "MiMo V2.6 Pro"],
    ["mimo-v2.6-flash", "MiMo V2.6 Flash"],
    ["mimo-v2.6-pro-ultraspeed", "MiMo V2.6 Pro UltraSpeed"],
    ["step-5-preview", "Step 5 Preview"],
    ["step-3.7-flash", "Step 3.7 Flash"],
    ["step-3.5-flash-2603", "Step 3.5 Flash 2603"],
    ["stepaudio-3-chat-preview", "StepAudio 3 Chat Preview"],
  ]) {
    assert.equal(canonicalUsageModel({ model }), model);
    assert.equal(usageModelDisplayName({ model }), label);
    assert.equal(usageModelDetail({ model }), model);
  }
  assert.equal(
    canonicalUsageModel({ model: "deepseek-v4-flash", modelCanonical: "deepseek-v4-flash" }),
    "deepseek-v4-flash",
  );
  assert.equal(
    usageModelDisplayName({ model: "gpt-6.1-sol-2026-09-29" }),
    "gpt-6.1-sol-2026-09-29",
  );
});
