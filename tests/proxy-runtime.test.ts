/* Runtime contract of proxy.ts, executed rather than text-asserted:
   legacy 308s leave before render, the works-source cookie rides only
   on the two list pages, and every (app) page path is covered by
   config.matcher — a missing entry once hid the right rail with
   visibility:hidden (the 20260821 explore trap), so coverage is an
   invariant, not a style preference. */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { proxy, config } from "../proxy";
import { LEARN_SERIES, type LearnSeries } from "../src/lib/learn-series";

const ORIGIN = "https://kimi.builders.test";

function fakeRequest(pathname: string, search = "") {
  const url = new URL(`${ORIGIN}${pathname}${search}`);
  /* proxy.ts clones nextUrl before mutating pathname; the real NextURL
     has clone(), a plain URL needs one attached. */
  const nextUrl = Object.assign(url, { clone: () => new URL(url.href) });
  return {
    headers: new Headers(),
    nextUrl,
  } as unknown as Parameters<typeof proxy>[0];
}

test("legacy /blog and /learn paths 308 into /explore before render", () => {
  for (const [from, to] of [
    ["/blog", "/explore"],
    ["/blog/my-slug", "/explore/my-slug"],
    ["/blog/my-slug?tab=video", "/explore/my-slug?tab=video"],
    ["/learn", "/explore"],
    ["/learn/a-series", "/explore/series/a-series"],
    ["/learn/a-series/an-episode", "/explore/an-episode"],
  ] as const) {
    const [pathname, search] = from.split("?");
    const res = proxy(fakeRequest(pathname, search ? `?${search}` : ""));
    assert.equal(res.status, 308, from);
    assert.equal(res.headers.get("location"), `${ORIGIN}${to}`, from);
  }
});

test("the edit console under /blog/admin is never redirected", () => {
  const res = proxy(fakeRequest("/blog/admin/new"));
  assert.notEqual(res.status, 308);
});

test("unknown series commit a 404 before loading can stream, preserving the original render path", () => {
  for (const path of ["/explore/series/missing", "/explore/series/%6dissing", "/explore/series/missing/", "/explore/series/%ZZ"]) {
    const response = proxy(fakeRequest(path));
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("x-middleware-request-x-kb-path"), path);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-rewrite"), null);
  }
  for (const path of ["/explore", "/explore/an-article", "/community", "/explore/series/a/b"]) {
    assert.equal(proxy(fakeRequest(path)).status, 200, path);
  }
});

test("registered series retain normal rendering and legacy routes still redirect first", () => {
  const series = { slug: "registered-series" } as LearnSeries;
  LEARN_SERIES.push(series);
  try {
    assert.equal(proxy(fakeRequest("/explore/series/registered-series")).status, 200);
    assert.equal(proxy(fakeRequest("/explore/series/%72egistered-series")).status, 200);
    const legacy = proxy(fakeRequest("/learn/missing"));
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), `${ORIGIN}/explore/series/missing`);
  } finally {
    LEARN_SERIES.splice(LEARN_SERIES.indexOf(series), 1);
  }
});

test("the works-source cookie rides only on the two list pages", () => {
  assert.equal(
    proxy(fakeRequest("/awesome")).cookies.get("kb-works-src")?.value,
    "awesome",
  );
  assert.equal(
    proxy(fakeRequest("/works")).cookies.get("kb-works-src")?.value,
    "works",
  );
  assert.equal(proxy(fakeRequest("/works/7")).cookies.get("kb-works-src"), undefined);
  assert.equal(proxy(fakeRequest("/community")).cookies.get("kb-works-src"), undefined);
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
