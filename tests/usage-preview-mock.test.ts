import assert from "node:assert/strict";
import test from "node:test";
import { usagePreviewSnapshot } from "../src/lib/usage/preview-mock";

/* ---- 未登录预览的确定性示例数据(20260822 活渲染方案)----
   钉住:同一时刻两次生成完全一致(无随机源);形状与 dashboard 组件的
   契约一致(30 天趋势 / 7×24 热力图);分桶之和恰等于 totalTokens;
   totals 是 trend 的真聚合(不是另一套手写数字)。 ---- */

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
  /* 末日 = 昨日(今日不完整,不进示例) */
  assert.equal(trend.at(-1)?.day, "2026-08-20");
  for (const d of trend) {
    assert.equal(
      d.inputTokens + d.cacheWriteInputTokens + d.cacheReadInputTokens +
        d.outputTokens + d.reasoningOutputTokens,
      d.totalTokens,
      `breakdown sums to total on ${d.day}`,
    );
  }
  /* 波形有起伏也有休整日:不全是零,也确有零 */
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
  /* 凌晨 0-6 点:零用量且标记无采集(采集缺口语义也被示例如实展示) */
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 7; hour++) {
      assert.equal(heatmap.tokens[weekday][hour], 0, "night cell is zero");
      assert.equal(heatmap.hasData[weekday][hour], false, "night cell marked no-data");
    }
  }
  /* 活跃时段 hasData 与数值一致(有值必有采集) */
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
