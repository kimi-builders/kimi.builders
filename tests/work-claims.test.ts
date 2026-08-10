import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import {
  verifiableTokenTotalsQuery,
  getVerifiableTokenTotals,
  getSuggestedClaimProjects,
  suggestedClaimProjectsQuery,
} from "../src/lib/usage/verifiable";
import {
  checkClaimAllowance,
  claimBadgeOf,
  claimsPaused,
  getClaimAllowance,
  getWorkClaimSums,
  matchSuggestedClaim,
  parseClaimInput,
  workClaimSumsQuery,
} from "../src/lib/works";

interface FakeCall {
  sql: string;
  params: unknown[];
}

/* 最小假 DB(同 usage-social.test.ts):记录调用,统一返回固定行 */
function fakeDb(rows: Record<string, unknown>[]) {
  const calls: FakeCall[] = [];
  const db = {
    calls,
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      return [rows];
    },
  };
  return db as unknown as Pool & { calls: FakeCall[] };
}

/* 按 SQL 内容路由不同返回行(getClaimAllowance 一次发两条查询) */
function fakeDbRoutes(routes: { match: RegExp; rows: Record<string, unknown>[] }[]) {
  const calls: FakeCall[] = [];
  const db = {
    calls,
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      const route = routes.find((r) => r.match.test(sql));
      return [route ? route.rows : []];
    },
  };
  return db as unknown as Pool & { calls: FakeCall[] };
}

/* ---- 紧凑数字解析 ---- */

test("parseClaimInput: plain integers and compact suffixes", () => {
  assert.deepEqual(parseClaimInput("2500"), { kind: "ok", value: 2500 });
  assert.deepEqual(parseClaimInput("612M"), { kind: "ok", value: 612_000_000 });
  assert.deepEqual(parseClaimInput("612m"), { kind: "ok", value: 612_000_000 });
  assert.deepEqual(parseClaimInput("2k"), { kind: "ok", value: 2000 });
  assert.deepEqual(parseClaimInput("1.5M"), { kind: "ok", value: 1_500_000 });
  assert.deepEqual(parseClaimInput("1.2B"), { kind: "ok", value: 1_200_000_000 });
  /* 分组符与空白容忍 */
  assert.deepEqual(parseClaimInput("10,000"), { kind: "ok", value: 10_000 });
  assert.deepEqual(parseClaimInput(" 1_000 "), { kind: "ok", value: 1000 });
});

test("parseClaimInput: empty means undeclared, garbage is invalid", () => {
  assert.deepEqual(parseClaimInput(""), { kind: "none" });
  assert.deepEqual(parseClaimInput("   "), { kind: "none" });
  assert.deepEqual(parseClaimInput("abc"), { kind: "invalid" });
  assert.deepEqual(parseClaimInput("1.5"), { kind: "invalid" }); // 非整数 tokens
  assert.deepEqual(parseClaimInput("0"), { kind: "invalid" }); // 0 徽章无意义
  assert.deepEqual(parseClaimInput("-5"), { kind: "invalid" });
  assert.deepEqual(parseClaimInput("10x"), { kind: "invalid" });
});

/* ---- 写时校验:声明 ≤ 剩余可声明额度 ---- */

test("checkClaimAllowance: exactly remaining passes, one over is rejected", () => {
  assert.deepEqual(checkClaimAllowance(600, 600), { ok: true });
  assert.deepEqual(checkClaimAllowance(601, 600), { ok: false, remaining: 600 });
  /* 撤销声明(null)永远放行 */
  assert.deepEqual(checkClaimAllowance(null, 0), { ok: true });
});

test("checkClaimAllowance: no usage data means nothing can be claimed", () => {
  /* 无用量数据 → 剩余 0 → 任何正声明都被拒(「想戴徽章,先接数据」的服务端兜底) */
  assert.deepEqual(checkClaimAllowance(1, 0), { ok: false, remaining: 0 });
  assert.deepEqual(checkClaimAllowance(500, 0), { ok: false, remaining: 0 });
});

test("getClaimAllowance: remaining = verifiable total minus claims of other works", async () => {
  const db = fakeDbRoutes([
    { match: /FROM usage_buckets/, rows: [{ user_id: 7, total_tokens: 1_000_000 }] },
    { match: /FROM works/, rows: [{ claimed: 400_000 }] },
  ]);
  const a = await getClaimAllowance(7, undefined, db);
  assert.deepEqual(a, { total: 1_000_000, claimed: 400_000, remaining: 600_000 });
  /* 编辑排除自身:第二条查询带 id <> ? 且参数带 workId */
  const b = await getClaimAllowance(7, 42, db);
  assert.equal(db.calls.length, 4);
  const sumCall = db.calls[3];
  assert.match(sumCall.sql, /id <> \?/);
  assert.deepEqual(sumCall.params, [7, 42]);
  assert.equal(b.remaining, 600_000);
  /* 剩余不为负(声明已超额时展示侧兜底,写侧看到的剩余夹到 0) */
  const over = fakeDbRoutes([
    { match: /FROM usage_buckets/, rows: [{ user_id: 7, total_tokens: 100 }] },
    { match: /FROM works/, rows: [{ claimed: 400 }] },
  ]);
  assert.equal((await getClaimAllowance(7, undefined, over)).remaining, 0);
});

test("getClaimAllowance: deleting a work releases its claim (physical delete)", async () => {
  /* 作品物理删除,Σ声明 只在现存行上求和 —— 无 deleted_at 过滤即释放语义 */
  const q = workClaimSumsQuery([7]);
  assert.ok(q);
  assert.equal(q!.sql.includes("deleted"), false);
  const db = fakeDbRoutes([
    { match: /FROM usage_buckets/, rows: [{ user_id: 7, total_tokens: 1_000_000 }] },
    { match: /FROM works/, rows: [{ claimed: 0 }] }, // 删除后合计回落
  ]);
  const a = await getClaimAllowance(7, undefined, db);
  assert.equal(a.claimed, 0);
  assert.equal(a.remaining, 1_000_000); // 额度自然释放
});

/* ---- 验证用总量查询:内部口径,无 opt-in 门禁 ---- */

test("verifiableTokenTotalsQuery: same SUM as social totals but no opt-in JOIN", () => {
  const q = verifiableTokenTotalsQuery([3, 1, 3])!;
  assert.ok(q);
  assert.match(q.sql, /FROM usage_buckets b/);
  assert.match(q.sql, /WHERE b\.user_id IN \(\?\)/);
  assert.match(q.sql, /GROUP BY b\.user_id/);
  /* 关键差异:不做 show_on_leaderboard 门禁(声明行为本身即公开授权) */
  assert.equal(q.sql.includes("usage_settings"), false);
  assert.equal(q.sql.includes("show_on_leaderboard"), false);
  /* 入参去重;空/非法 id 集 → null */
  assert.deepEqual(q.args, [[3, 1]]);
  assert.equal(verifiableTokenTotalsQuery([]), null);
  assert.equal(verifiableTokenTotalsQuery([null, 0, -1]), null);
});

test("getVerifiableTokenTotals maps rows; empty id set skips the query", async () => {
  const db = fakeDb([{ user_id: 5, total_tokens: 123456 }]);
  const totals = await getVerifiableTokenTotals([5, 6], db);
  assert.equal(totals.get(5), 123456);
  assert.equal(totals.has(6), false);
  const empty = await getVerifiableTokenTotals([], db);
  assert.equal(empty.size, 0);
  assert.equal(db.calls.length, 1); // 空集不发查询
});

test("workClaimSumsQuery / getWorkClaimSums: per-author Σclaimed over all their works", async () => {
  const q = workClaimSumsQuery([3, 1, 3])!;
  assert.match(q.sql, /SELECT user_id, SUM\(claimed_tokens\) AS claimed\s+FROM works/);
  assert.match(q.sql, /GROUP BY user_id/);
  assert.deepEqual(q.args, [[3, 1]]);
  assert.equal(workClaimSumsQuery([]), null);
  const db = fakeDb([{ user_id: 3, claimed: 700 }, { user_id: 1, claimed: null }]);
  const sums = await getWorkClaimSums([3, 1], db);
  assert.equal(sums.get(3), 700);
  assert.equal(sums.get(1), 0); // 全 NULL → 0
});

/* ---- 展示不变式:Σ声明 ≤ 可验证总量,否则整体隐藏 ---- */

test("claimBadgeOf: declared work within budget shows its own claim", () => {
  const totals = new Map([[1, 1_000_000]]);
  const sums = new Map([[1, 700_000]]);
  const w = { userId: 1, source: "site", claimedTokens: 300_000 };
  assert.equal(claimBadgeOf(w, totals, sums), 300_000);
});

test("claimBadgeOf: over-claimed author loses ALL badges (shrunk total)", () => {
  /* 总量缩水(retention/删数据):Σ声明 700 > 总量 500 → 每个作品都不渲染 */
  const totals = new Map([[1, 500]]);
  const sums = new Map([[1, 700]]);
  const a = { userId: 1, source: "site", claimedTokens: 300 };
  const b = { userId: 1, source: "site", claimedTokens: 400 };
  assert.equal(claimBadgeOf(a, totals, sums), null);
  assert.equal(claimBadgeOf(b, totals, sums), null);
  /* 恰好等于总量 → 不变式满足,正常渲染 */
  const exact = new Map([[1, 700]]);
  assert.equal(claimBadgeOf(b, exact, sums), 400);
});

test("claimBadgeOf: null means render nothing (no negative marker)", () => {
  const totals = new Map([[1, 1_000_000]]);
  const sums = new Map([[1, 700_000]]);
  /* 未声明 */
  assert.equal(
    claimBadgeOf({ userId: 1, source: "site", claimedTokens: null }, totals, sums),
    null,
  );
  /* 声明 0 / 负值无意义 */
  assert.equal(
    claimBadgeOf({ userId: 1, source: "site", claimedTokens: 0 }, totals, sums),
    null,
  );
  /* awesome 外部条目不挂声明徽章 */
  assert.equal(
    claimBadgeOf({ userId: null, source: "awesome", claimedTokens: 100 }, totals, sums),
    null,
  );
  assert.equal(
    claimBadgeOf({ userId: 1, source: "awesome", claimedTokens: 100 }, totals, sums),
    null,
  );
  /* 作者无可验证数据(从未同步/数据清空)→ 声明不可验证,不渲染。
     (生产上 claimSums 与该作者全部作品一致:Σ声明 ≥ 本作品声明) */
  assert.equal(
    claimBadgeOf({ userId: 9, source: "site", claimedTokens: 100 }, totals, sums),
    null,
  );
  assert.equal(
    claimBadgeOf(
      { userId: 1, source: "site", claimedTokens: 100 },
      new Map([[1, 0]]),
      new Map([[1, 100]]),
    ),
    null,
  );
});

test("claimsPaused: author-side notice when Σclaims exceeds the verifiable total", () => {
  assert.equal(claimsPaused(500, 700), true);
  assert.equal(claimsPaused(700, 700), false); // 恰好等于 = 未超额
  assert.equal(claimsPaused(1_000_000, 700), false);
  assert.equal(claimsPaused(0, 0), false); // 无声明 = 无提示
  assert.equal(claimsPaused(0, 10), true); // 数据全删但声明还在 = 超额暂停
});

/* ---- 建议预填(项目分布匹配)---- */

test("suggestedClaimProjectsQuery: gated on upload_project, labeled buckets only", () => {
  const { sql, args } = suggestedClaimProjectsQuery(7);
  assert.match(sql, /JOIN usage_settings s\s+ON s\.user_id = b\.user_id AND s\.upload_project = 1/);
  assert.match(sql, /project_label IS NOT NULL/);
  assert.match(sql, /GROUP BY b\.project_label/);
  assert.match(sql, /ORDER BY tokens DESC/);
  assert.deepEqual(args, [7]);
});

test("getSuggestedClaimProjects maps rows and drops empty labels", async () => {
  const db = fakeDb([
    { label: "moonledger", tokens: 900 },
    { label: "", tokens: 500 },
    { label: "side", tokens: 0 },
  ]);
  const projects = await getSuggestedClaimProjects(7, db);
  assert.deepEqual(projects, [{ label: "moonledger", tokens: 900 }]);
});

test("matchSuggestedClaim: exact (case-insensitive) first, then substring", () => {
  const projects = [
    { label: "moonledger", tokens: 900 },
    { label: "Moon Ledger Pro", tokens: 300 },
    { label: "side", tokens: 100 },
  ];
  /* 精确匹配优先(大小写不敏感) */
  assert.deepEqual(matchSuggestedClaim("MoonLedger", projects), {
    label: "moonledger",
    tokens: 900,
  });
  /* 互为子串:作品名 ⊂ label 或 label ⊂ 作品名 */
  assert.deepEqual(matchSuggestedClaim("moon ledger", projects), {
    label: "Moon Ledger Pro",
    tokens: 300,
  });
  assert.deepEqual(matchSuggestedClaim("Moon Ledger Pro 2", projects), {
    label: "Moon Ledger Pro",
    tokens: 300,
  });
  /* 空名字 / 匹配不上 → 无建议 */
  assert.equal(matchSuggestedClaim("", projects), null);
  assert.equal(matchSuggestedClaim("nothing alike", projects), null);
});
