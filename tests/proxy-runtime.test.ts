/* Runtime contract of proxy.ts, executed rather than text-asserted:
   legacy 308s leave before render, the works-source cookie rides only
   on the two list pages, every (app) page path is covered by
   config.matcher — a missing entry once hid the right rail with
   visibility:hidden (the 20260821 explore trap), so coverage is an
   invariant, not a style preference — and the detail-route soft-404
   guard returns real 404 statuses for deleted/private/unpublished
   content (rows injected; no database in unit tests). */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { proxy, config } from "../proxy";
import { LEARN_SERIES, type LearnSeries } from "../src/lib/learn-series";
import type { ProxyQuery } from "../proxy";

const ORIGIN = "https://kimi.builders.test";

/* Detail lookups are injected so tests never touch MySQL; the default
   stub answers "live public row" for every query (keeps the legacy
   status assertions meaningful). */
const liveRow: ProxyQuery = async (sql) => {
  if (sql.includes("FROM articles")) {
    return [{ published_at: new Date(), deleted_at: null }] as never;
  }
  if (sql.includes("FROM works")) {
    return [{ visibility: "public", hidden_at: null }] as never;
  }
  return [{ deleted_at: null, visibility: "public", hidden_at: null }] as never;
};

function fakeRequest(pathname: string, search = "", session = false) {
  const url = new URL(`${ORIGIN}${pathname}${search}`);
  /* proxy.ts clones nextUrl before mutating pathname; the real NextURL
     has clone(), a plain URL needs one attached. */
  const nextUrl = Object.assign(url, { clone: () => new URL(url.href) });
  return {
    headers: new Headers(),
    nextUrl,
    cookies: { has: (name: string) => session && name === "kb_session" },
  } as unknown as Parameters<typeof proxy>[0];
}

test("legacy /blog and /learn paths 308 into /explore before render", async () => {
  for (const [from, to] of [
    ["/blog", "/explore"],
    ["/blog/my-slug", "/explore/my-slug"],
    ["/blog/my-slug?tab=video", "/explore/my-slug?tab=video"],
    ["/learn", "/explore"],
    ["/learn/a-series", "/explore/series/a-series"],
    ["/learn/a-series/an-episode", "/explore/an-episode"],
  ] as const) {
    const [pathname, search] = from.split("?");
    const res = await proxy(fakeRequest(pathname, search ? `?${search}` : ""), {
      query: liveRow,
    });
    assert.equal(res.status, 308, from);
    assert.equal(res.headers.get("location"), `${ORIGIN}${to}`, from);
  }
});

test("the edit console under /blog/admin is never redirected", async () => {
  const res = await proxy(fakeRequest("/blog/admin/new"), { query: liveRow });
  assert.notEqual(res.status, 308);
});

test("unknown series commit a 404 before loading can stream, preserving the original render path", async () => {
  for (const path of ["/explore/series/missing", "/explore/series/%6dissing", "/explore/series/missing/", "/explore/series/%ZZ"]) {
    const response = await proxy(fakeRequest(path), { query: liveRow });
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("x-middleware-request-x-kb-path"), path);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-rewrite"), null);
  }
  for (const path of ["/explore", "/explore/an-article", "/community", "/explore/series/a/b"]) {
    assert.equal((await proxy(fakeRequest(path), { query: liveRow })).status, 200, path);
  }
});

/* The detail soft-404 matrix (deleted/private/hidden/draft rows are
   injected; unit tests pin the decision logic, not the SQL). */
test("detail routes commit 404 for content invisible to the requester", async () => {
  const rows = (row: Record<string, unknown>): ProxyQuery => async () => [row] as never;
  const noRows: ProxyQuery = async () => [] as never;

  // Deleted post: 404 for everyone.
  assert.equal(
    (await proxy(fakeRequest("/community/5"), { query: rows({ deleted_at: new Date(), visibility: "public", hidden_at: null }) })).status,
    404,
  );
  // Missing work row (hard delete): 404 for everyone.
  assert.equal((await proxy(fakeRequest("/works/9"), { query: noRows })).status, 404);
  // Private post: 404 anonymous, 200 with a session (page decides).
  assert.equal(
    (await proxy(fakeRequest("/community/5"), { query: rows({ deleted_at: null, visibility: "private", hidden_at: null }) })).status,
    404,
  );
  assert.equal(
    (await proxy(fakeRequest("/community/5", "", true), { query: rows({ deleted_at: null, visibility: "private", hidden_at: null }) })).status,
    200,
  );
  // Hidden work: 404 anonymous, 200 with a session.
  assert.equal(
    (await proxy(fakeRequest("/works/9"), { query: rows({ visibility: "public", hidden_at: new Date() }) })).status,
    404,
  );
  assert.equal(
    (await proxy(fakeRequest("/works/9", "", true), { query: rows({ visibility: "public", hidden_at: new Date() }) })).status,
    200,
  );
  // Draft/deleted article: 404 for everyone.
  assert.equal(
    (await proxy(fakeRequest("/explore/draft-slug"), { query: rows({ published_at: null, deleted_at: null }) })).status,
    404,
  );
  // Non-numeric detail segments (/community/new) never hit the lookup.
  assert.equal((await proxy(fakeRequest("/community/new"), { query: noRows })).status, 200);
});

test("registered series retain normal rendering and legacy routes still redirect first", async () => {
  const series = { slug: "registered-series" } as LearnSeries;
  LEARN_SERIES.push(series);
  try {
    assert.equal((await proxy(fakeRequest("/explore/series/registered-series"), { query: liveRow })).status, 200);
    assert.equal((await proxy(fakeRequest("/explore/series/%72egistered-series"), { query: liveRow })).status, 200);
    const legacy = await proxy(fakeRequest("/learn/missing"), { query: liveRow });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), `${ORIGIN}/explore/series/missing`);
  } finally {
    LEARN_SERIES.splice(LEARN_SERIES.indexOf(series), 1);
  }
});

test("the works-source cookie rides only on the two list pages", async () => {
  assert.equal(
    (await proxy(fakeRequest("/awesome"), { query: liveRow })).cookies.get("kb-works-src")?.value,
    "awesome",
  );
  assert.equal(
    (await proxy(fakeRequest("/works"), { query: liveRow })).cookies.get("kb-works-src")?.value,
    "works",
  );
  assert.equal((await proxy(fakeRequest("/works/7"), { query: liveRow })).cookies.get("kb-works-src"), undefined);
  assert.equal((await proxy(fakeRequest("/community"), { query: liveRow })).cookies.get("kb-works-src"), undefined);
});

function appPageRoutes(): string[] {
  const root = fileURLToPath(new URL("../app/(app)", import.meta.url));
  const walk = (dir: string, prefix: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_")) return [];
        return walk(`${dir}/${entry.name}`, `${prefix}/${entry.name}`);
      }
      if (entry.name !== "page.tsx") return [];
      return [prefix || "/"];
    });
  return walk(root, "").sort();
}

/* Minimal translation of the matcher shapes proxy.ts uses:
   "/seg/:path*" matches the segment itself and anything below it. */
function matcherCovers(pathname: string): boolean {
  return config.matcher.some((pattern) => {
    const base = pattern.replace("/:path*", "");
    if (!pattern.endsWith("/:path*")) return pattern === pathname;
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

test("every (app) page route is covered by the proxy matcher", () => {
  const routes = appPageRoutes();
  assert.ok(routes.length > 20, "route enumeration is working");
  const uncovered = routes.filter((route) => !matcherCovers(route));
  assert.deepEqual(
    uncovered,
    [],
    "page routes missing from proxy.ts config.matcher (right rail would be hidden): " +
      uncovered.join(", "),
  );
});
