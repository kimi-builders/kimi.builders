import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalUsageModel,
  usageModelDetail,
  usageModelDisplayName,
} from "../src/lib/usage/model-meta";

test("Kimi raw aliases retain detail and resolve to precise canonical IDs", () => {
  const identity = { source: "kimi-code", model: "kimi-code/kimi-for-coding-highspeed" };
  assert.equal(canonicalUsageModel(identity), "kimi-k2.7-code-highspeed");
  assert.equal(usageModelDisplayName(identity), "Kimi K2.7 Code Highspeed");
  assert.match(usageModelDetail(identity), /kimi-code\/kimi-for-coding-highspeed/);
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
