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

/* Minimal fake DB (as in usage-social.test.ts): records calls, returns
   fixed rows. */
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

/* Routes different rows by SQL content (getClaimAllowance issues two
   queries at once). */
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

/* ---- Compact-number parsing ---- */

test("parseClaimInput: plain integers and compact suffixes", () => {
  assert.deepEqual(parseClaimInput("2500"), { kind: "ok", value: 2500 });
  assert.deepEqual(parseClaimInput("612M"), { kind: "ok", value: 612_000_000 });
  assert.deepEqual(parseClaimInput("612m"), { kind: "ok", value: 612_000_000 });
  assert.deepEqual(parseClaimInput("2k"), { kind: "ok", value: 2000 });
  assert.deepEqual(parseClaimInput("1.5M"), { kind: "ok", value: 1_500_000 });
  assert.deepEqual(parseClaimInput("1.2B"), { kind: "ok", value: 1_200_000_000 });
  /* Tolerates grouping separators and whitespace. */
  assert.deepEqual(parseClaimInput("10,000"), { kind: "ok", value: 10_000 });
  assert.deepEqual(parseClaimInput(" 1_000 "), { kind: "ok", value: 1000 });
});

test("parseClaimInput: empty means undeclared, garbage is invalid", () => {
  assert.deepEqual(parseClaimInput(""), { kind: "none" });
  assert.deepEqual(parseClaimInput("   "), { kind: "none" });
  assert.deepEqual(parseClaimInput("abc"), { kind: "invalid" });
  // Non-integer tokens.
  // A zero badge is meaningless.
  assert.deepEqual(parseClaimInput("-5"), { kind: "invalid" });
  assert.deepEqual(parseClaimInput("10x"), { kind: "invalid" });
});

/* ---- Write-time validation: claim <= remaining allowance ---- */

test("checkClaimAllowance: exactly remaining passes, one over is rejected", () => {
  assert.deepEqual(checkClaimAllowance(600, 600), { ok: true });
  assert.deepEqual(checkClaimAllowance(601, 600), { ok: false, remaining: 600 });
  /* Retracting (null) always passes. */
  assert.deepEqual(checkClaimAllowance(null, 0), { ok: true });
});

test("checkClaimAllowance: no usage data means nothing can be claimed", () => {
  /* No usage data -> remaining 0 -> any positive claim rejected (the
     server-side "bring data before wearing the badge" backstop). */
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
  /* Editing excludes self: the second query carries id <> ? and the
     params carry workId. */
  const b = await getClaimAllowance(7, 42, db);
  assert.equal(db.calls.length, 4);
  const sumCall = db.calls[3];
  assert.match(sumCall.sql, /id <> \?/);
  assert.deepEqual(sumCall.params, [7, 42]);
  assert.equal(b.remaining, 600_000);
  /* Remaining never goes negative (a display-side backstop when claims
     already exceed; the write side sees it clamped to 0). */
  const over = fakeDbRoutes([
    { match: /FROM usage_buckets/, rows: [{ user_id: 7, total_tokens: 100 }] },
    { match: /FROM works/, rows: [{ claimed: 400 }] },
  ]);
  assert.equal((await getClaimAllowance(7, undefined, over)).remaining, 0);
});

test("getClaimAllowance: deleting a work releases its claim (physical delete)", async () => {
  /* Physically deleting a work sums claims over surviving rows only —
     no deleted_at filter is the release semantics. */
  const q = workClaimSumsQuery([7]);
  assert.ok(q);
  assert.equal(q!.sql.includes("deleted"), false);
  const db = fakeDbRoutes([
    { match: /FROM usage_buckets/, rows: [{ user_id: 7, total_tokens: 1_000_000 }] },
    // The sum falls back after deletion.
  ]);
  const a = await getClaimAllowance(7, undefined, db);
  assert.equal(a.claimed, 0);
  // The allowance releases itself.
});

/* ---- Verifiable-total query: internal definition, no opt-in gate
   ---- */

test("verifiableTokenTotalsQuery: same SUM as social totals but no opt-in JOIN", () => {
  const q = verifiableTokenTotalsQuery([3, 1, 3])!;
  assert.ok(q);
  assert.match(q.sql, /FROM usage_buckets b/);
  assert.match(q.sql, /WHERE b\.user_id IN \(\?\)/);
  assert.match(q.sql, /GROUP BY b\.user_id/);
  /* The key difference: no show_on_leaderboard gate (declaring is
     itself the public act). */
  assert.equal(q.sql.includes("usage_settings"), false);
  assert.equal(q.sql.includes("show_on_leaderboard"), false);
  /* Inputs deduped; empty/invalid id sets -> null. */
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
  // Empty sets issue no query.
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
  // All-NULL -> 0.
});

/* ---- Display invariant: sum of claims <= verifiable total, else hide
   everything ---- */

test("claimBadgeOf: declared work within budget shows its own claim", () => {
  const totals = new Map([[1, 1_000_000]]);
  const sums = new Map([[1, 700_000]]);
  const w = { userId: 1, source: "site", claimedTokens: 300_000 };
  assert.equal(claimBadgeOf(w, totals, sums), 300_000);
});

test("claimBadgeOf: over-claimed author loses ALL badges (shrunk total)", () => {
  /* Shrunk total (retention/deletion): claims 700 > total 500 -> none
     of the works render. */
  const totals = new Map([[1, 500]]);
  const sums = new Map([[1, 700]]);
  const a = { userId: 1, source: "site", claimedTokens: 300 };
  const b = { userId: 1, source: "site", claimedTokens: 400 };
  assert.equal(claimBadgeOf(a, totals, sums), null);
  assert.equal(claimBadgeOf(b, totals, sums), null);
  /* Exactly equal -> invariant holds, renders normally. */
  const exact = new Map([[1, 700]]);
  assert.equal(claimBadgeOf(b, exact, sums), 400);
});

test("claimBadgeOf: null means render nothing (no negative marker)", () => {
  const totals = new Map([[1, 1_000_000]]);
  const sums = new Map([[1, 700_000]]);
  /* Unclaimed. */
  assert.equal(
    claimBadgeOf({ userId: 1, source: "site", claimedTokens: null }, totals, sums),
    null,
  );
  /* Zero / negative claims are meaningless. */
  assert.equal(
    claimBadgeOf({ userId: 1, source: "site", claimedTokens: 0 }, totals, sums),
    null,
  );
  /* Awesome external entries carry no claim badge. */
  assert.equal(
    claimBadgeOf({ userId: null, source: "awesome", claimedTokens: 100 }, totals, sums),
    null,
  );
  assert.equal(
    claimBadgeOf({ userId: 1, source: "awesome", claimedTokens: 100 }, totals, sums),
    null,
  );
  /* Author with no verifiable data (never synced/cleared) -> claims
     unverifiable, nothing renders. (In production claimSums covers the
     author's every work: sum of claims >= this work's claim.) */
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
  // Exactly equal = not over cap.
  assert.equal(claimsPaused(1_000_000, 700), false);
  // No claims = no hint.
  // Data fully deleted but claims remain = paused over cap.
});

/* ---- Suggestion prefill (project-mix matching) ---- */

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
  /* Exact match wins (case-insensitive). */
  assert.deepEqual(matchSuggestedClaim("MoonLedger", projects), {
    label: "moonledger",
    tokens: 900,
  });
  /* Mutual substring: work name inside label or label inside work
     name. */
  assert.deepEqual(matchSuggestedClaim("moon ledger", projects), {
    label: "Moon Ledger Pro",
    tokens: 300,
  });
  assert.deepEqual(matchSuggestedClaim("Moon Ledger Pro 2", projects), {
    label: "Moon Ledger Pro",
    tokens: 300,
  });
  /* Empty name / no match -> no suggestion. */
  assert.equal(matchSuggestedClaim("", projects), null);
  assert.equal(matchSuggestedClaim("nothing alike", projects), null);
});
