import assert from "node:assert/strict";
import test from "node:test";
import { usagePreviewSnapshot } from "../src/lib/usage/preview-mock";

/* ---- Deterministic sample data for the logged-out preview. Pins:
   two generations at the same instant are identical (no randomness);
   the shape matches the dashboard components' contract (30-day trend /
   7x24 heatmap); the bucket sums equal totalTokens exactly; totals are
   true aggregates of the trend (not a second set of hand-written
   numbers). ---- */

const NOW = new Date("2026-08-21T12:00:00.000Z");
const snap = usagePreviewSnapshot(NOW);

test("deterministic: same now → identical snapshot (no randomness)", () => {
  assert.deepEqual(usagePreviewSnapshot(NOW), usagePreviewSnapshot(NOW));
});

test("trend: 30 consecutive days ending yesterday, breakdown sums to total", () => {
  const { trend } = snap;
  assert.equal(trend.length, 30);
  for (let i = 1; i < trend.length; i++) {
    const prev = new Date(`${trend[i - 1].day}T00:00:00.000Z`).getTime();
    const cur = new Date(`${trend[i].day}T00:00:00.000Z`).getTime();
    assert.equal(cur - prev, 86_400_000, "consecutive UTC days");
  }
  /* The last day is yesterday (today is incomplete, excluded). */
  assert.equal(trend.at(-1)?.day, "2026-08-20");
  for (const d of trend) {
    assert.equal(
      d.inputTokens + d.cacheWriteInputTokens + d.cacheReadInputTokens +
        d.outputTokens + d.reasoningOutputTokens,
      d.totalTokens,
      `breakdown sums to total on ${d.day}`,
    );
  }
  /* The waveform has peaks and rest days: not all nonzero, and truly
     some zeros. */
  assert.ok(trend.some((d) => d.totalTokens === 0), "has rest days");
  assert.ok(trend.some((d) => d.totalTokens > 0), "has active days");
});

test("totals: honest aggregate of trend (not a second set of numbers)", () => {
  const sum = (key: keyof (typeof snap.trend)[number]) =>
    snap.trend.reduce((n, d) => n + (d[key] as number), 0);
  assert.equal(snap.totals.totalTokens, sum("totalTokens"));
  assert.equal(snap.totals.costMicros, sum("costMicros"));
  assert.equal(snap.totals.requests, sum("requests"));
  assert.equal(snap.totals.sessions, sum("sessions"));
  assert.ok(snap.totals.totalTokens > 1_000_000_000, "30d 总量在亿级以上,图表有看头");
});

test("heatmap: 7×24 matrices, night hours uncollected, hasData honest", () => {
  const { heatmap } = snap;
  for (const key of [
    "tokens", "inputTokens", "cacheWriteInputTokens", "cacheReadInputTokens",
    "outputTokens", "reasoningOutputTokens", "costMicros", "activeSeconds",
    "prompts", "hasData",
  ] as const) {
    assert.equal(heatmap[key].length, 7, `${key} has 7 weekday rows`);
    assert.ok(heatmap[key].every((row) => row.length === 24), `${key} has 24 hour cols`);
  }
  /* Small hours 0-6: zero usage flagged no-collection (the sample
     honestly demonstrates the collection-gap semantics too). */
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 7; hour++) {
      assert.equal(heatmap.tokens[weekday][hour], 0, "night cell is zero");
      assert.equal(heatmap.hasData[weekday][hour], false, "night cell marked no-data");
    }
  }
  /* Active slots: hasData agrees with the values (a value implies
     collection). */
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 7; hour < 24; hour++) {
      assert.equal(heatmap.hasData[weekday][hour], heatmap.tokens[weekday][hour] > 0);
    }
  }
});

test("cache hit rate lands in the believable heavy-user band (~87%)", () => {
  const input = snap.totals.inputTokens + snap.totals.cacheWriteInputTokens;
  const hit = snap.totals.cacheReadInputTokens / (input + snap.totals.cacheReadInputTokens);
  assert.ok(hit > 0.8 && hit < 0.92, `hit rate ${hit.toFixed(3)} in (0.8, 0.92)`);
});
