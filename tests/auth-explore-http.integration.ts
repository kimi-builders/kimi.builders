import assert from "node:assert/strict";
import test from "node:test";

// Run against a local Next dev or production server; no database writes are needed.
const base = process.env.KB_TEST_BASE_URL;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("KB_TEST_BASE_URL must point to a running local server");
}

test("missing series return real HTTP 404 for browsers, crawlers, GET and HEAD", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const agent of ["Mozilla/5.0", "curl/8.0", "facebookexternalhit/1.1"]) {
      const response: Response = await fetch(new URL("/explore/series/unregistered-http-check", base), {
        method, headers: { "User-Agent": agent },
      });
      assert.equal(response.status, 404, `${method} ${agent}`);
      if (method === "GET") {
        assert.match(await response.text(), /name="robots" content="noindex"/);
      }
    }
  }
});

test("legacy series URLs still emit 308 before resolving to the missing-series 404", async () => {
  const response = await fetch(new URL("/learn/unregistered-http-check", base), { redirect: "manual" });
  assert.equal(response.status, 308);
  assert.equal(new URL(response.headers.get("location")!, base).pathname, "/explore/series/unregistered-http-check");
});

test("real login route rejects foreign origins in JSON or full-page redirect form before any DB write", async () => {
  for (const enhanced of [true, false]) {
    const response: Response = await fetch(new URL("/api/auth/email/login?next=%2Fcommunity%3Fsort%3Dnew", base), {
      method: "POST",
      headers: { Origin: "https://untrusted.example", Accept: enhanced ? "application/json" : "text/html" },
      redirect: "manual",
    });
    if (enhanced) {
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { ok: false, error: "invalid_origin" });
      assert.equal(response.headers.get("location"), null);
    } else {
      assert.equal(response.status, 303);
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.pathname, "/login");
      assert.equal(location.searchParams.get("error"), "invalid_origin");
      assert.equal(location.searchParams.get("next"), "/community?sort=new");
      assert.equal(location.searchParams.has("password"), false);
    }
  }
});
