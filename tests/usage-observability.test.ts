import assert from "node:assert/strict";
import test from "node:test";
import { captureUsageOperation } from "../src/lib/usage/observability";

test("usage observability returns successful values without changing them", async () => {
  const result = await captureUsageOperation(
    "usage.test.success",
    async () => ({ rows: 3 }),
    { slowMs: 60_000 },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { rows: 3 });
    assert.ok(result.durationMs >= 0);
  }
});

test("usage observability converts failures to an opaque support reference", async () => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...values: unknown[]) => lines.push(values.map(String).join(" "));
  try {
    const result = await captureUsageOperation("usage.test.failure", async () => {
      const error = new Error("database unavailable");
      Object.assign(error, { code: "ER_TEST" });
      throw error;
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reference, /^usage_[a-f0-9]{12}$/);
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(event.event, "usage.operation");
    assert.equal(event.operation, "usage.test.failure");
    assert.equal(event.status, "error");
    assert.equal(event.errorCode, "ER_TEST");
  } finally {
    console.error = original;
  }
});
