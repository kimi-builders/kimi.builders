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
