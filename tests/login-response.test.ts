import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loginFailureResponse, loginSuccessResponse, type LoginError } from "../src/lib/auth/login-response";

const next = "/community?sort=new#post";
function request(enhanced: boolean, returnTo = next) {
  return new Request(`http://localhost/api/auth/email/login?next=${encodeURIComponent(returnTo)}`, {
    method: "POST",
    headers: { Accept: enhanced ? "application/json" : "text/html,application/xhtml+xml,*/*;q=0.8" },
  });
}

test("enhanced login failures return only a typed error, never a navigation or credentials", async () => {
  for (const [error, status] of [["bad_credentials", 401], ["rate_limited", 429], ["invalid_origin", 403]] as const) {
    const response = loginFailureResponse(request(true), error, "builder@example.com");
    assert.equal(response.status, status);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, error });
  }
});

test("native full-page login failures use 303 and preserve only email, error and safe next", () => {
  for (const error of ["bad_credentials", "rate_limited", "invalid_origin"] satisfies LoginError[]) {
    const response = loginFailureResponse(request(false), error, "builder@example.com");
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.pathname, "/login");
    assert.deepEqual(Object.fromEntries(location.searchParams), { error, next, email: "builder@example.com" });
  }
  const early = loginFailureResponse(request(false), "invalid_origin");
  assert.equal(new URL(early.headers.get("location")!).searchParams.has("email"), false);
});

test("success negotiation preserves next query/hash and the community fallback", async () => {
  for (const [input, expected] of [[next, next], ["/", "/community"], ["//other.example", "/community"]]) {
    const enhanced = loginSuccessResponse(request(true, input));
    assert.equal(enhanced.status, 200);
    assert.deepEqual(await enhanced.json(), { ok: true, next: expected });
    const native = loginSuccessResponse(request(false, input));
    assert.equal(native.status, 303);
    const location = new URL(native.headers.get("location")!);
    assert.equal(location.pathname + location.search + location.hash, expected);
  }
});

test("both login presentations share the enhanced form and its native fallback", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("app/(app)/login/page.tsx"), /<LoginContent/);
  assert.match(read("app/@modal/(.)login/page.tsx"), /<LoginContent/);
  assert.match(read("app/(app)/login/_components/LoginContent.tsx"), /<LoginForm/);
  const form = read("app/(app)/login/_components/LoginForm.tsx");
  assert.match(form, /method="POST" action=/);
  assert.match(form, /Accept: "application\/json"/);
  assert.match(form, /defaultValue=\{initialEmail\}/);
  assert.match(form, /passwordRef\.current\.value = ""/);
  assert.doesNotMatch(form, /form\.reset\(|localStorage|sessionStorage|console\./);
});
