/* Route-level tests for /api/auth/* and /api/cron/*: regression guards
   for auth decisions, rate-limit ordering, and error branches. Same
   convention as upload-route.test.ts — assert key orderings directly
   against the route source, start no server; logic details live in
   lib-level unit/integration tests. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function sourceOf(path: string): string {
  return readFileSync(new URL(`../app/api/${path}/route.ts`, import.meta.url), "utf8");
}

/* Order assertion: a must appear before b (auth/rate limiting precede
   parsing and writes). */
function assertOrder(src: string, a: string, b: string, label: string) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  assert.ok(ia >= 0, `${label}: 缺少 ${a}`);
  assert.ok(ib >= 0, `${label}: 缺少 ${b}`);
  assert.ok(ia < ib, `${label}: ${a} 必须先于 ${b}`);
}

/* ---- OAuth start /api/auth/[provider] ---- */

test("oauth start: unknown provider 404 before issuing any redirect", () => {
  const src = sourceOf("auth/[provider]");
  assertOrder(src, "unknown provider", "NextResponse.redirect(", "provider 校验先于跳转");
});

test("oauth start: state cookie 是 CSRF 防线,httpOnly+lax+10 分钟", () => {
  const src = sourceOf("auth/[provider]");
  assert.match(src, /httpOnly: true/);
  assert.match(src, /sameSite: "lax"/);
  assert.match(src, /maxAge: 600/);
  assertOrder(src, "STATE_COOKIE, state", "return res", "state cookie 写入先于返回");
  /* redirect_uri uses the canonical origin, never the raw request Host
     (the Host-header injection defense). */
  assert.match(src, /canonicalOrigin\(req\)/);
});

/* ---- OAuth callback /api/auth/callback/[provider] ---- */

test("oauth callback: state 校验先于 code 换资料", () => {
  const src = sourceOf("auth/callback/[provider]");
  assertOrder(src, "state !== stored", "fetchProfile(", "state 校验先于 fetchProfile");
});

test("oauth callback: 绑定模式必须先有会话再写绑定", () => {
  const src = sourceOf("auth/callback/[provider]");
  assertOrder(src, 'linkFail("no_session")', "linkProviderAccount(", "no_session 先于写绑定");
});

test("oauth callback: 所有跳转统一清流程 cookie", () => {
  const src = sourceOf("auth/callback/[provider]");
  assert.match(src, /clearFlowCookies\(NextResponse\.redirect/);
  /* Failure exits uniformly go through fail/linkFail, never bare
     throws. */
  assert.match(src, /auth_error/);
  assert.match(src, /link_error/);
});

/* ---- Email signup /api/auth/email/register ---- */

test("register: 同源校验 + IP 限速都在解析表单之前", () => {
  const src = sourceOf("auth/email/register");
  assertOrder(src, "isSameOrigin(req)", "req.formData()", "同源校验先于表单解析");
  assertOrder(src, "consumeUsageRateLimit(", "req.formData()", "限速先于表单解析");
});

test("register: 全部校验先于建号,会话只在成功后种下", () => {
  const src = sourceOf("auth/email/register");
  assertOrder(src, "isValidEmail(email)", "createEmailUser(", "邮箱格式先于建号");
  assertOrder(src, "passwordPolicyError(", "createEmailUser(", "密码策略先于建号");
  assertOrder(src, "password !== password2", "createEmailUser(", "二次确认先于建号");
  assertOrder(src, "findEmailAccount(", "createEmailUser(", "占用检查先于建号");
  assertOrder(src, "createEmailUser(", "setSessionCookie(", "建号先于种会话");
});

/* ---- Email login /api/auth/email/login ---- */

test("login: IP 限速先于解析,账号限速先于查库", () => {
  const src = sourceOf("auth/email/login");
  assertOrder(src, "isSameOrigin(req)", "req.formData()", "同源校验先于表单解析");
  assertOrder(src, '"auth-email-login"', "req.formData()", "IP 限速先于表单解析");
  assertOrder(src, '"auth-email-login-account"', "findEmailAccount(", "账号限速先于查库");
});

test("login: 失败口径统一 bad_credentials,不暴露邮箱是否注册", () => {
  const src = sourceOf("auth/email/login");
  /* Unknown email and wrong password share one exit. */
  assert.match(src, /account\?\.passwordHash != null\s*&&/);
  assert.equal((src.match(/"bad_credentials"/g) ?? []).length, 1);
  assertOrder(src, "verifyPassword(", "setSessionCookie(", "验密先于种会话");
});

/* ---- Forgot password /api/auth/email/forgot ---- */

test("forgot: 无论邮箱是否注册都回 sent=1(不泄露注册状态)", () => {
  const src = sourceOf("auth/email/forgot");
  assertOrder(src, "isSameOrigin(req)", "req.formData()", "同源校验先于表单解析");
  assertOrder(src, "consumeUsageRateLimit(", "req.formData()", "限速先于表单解析");
  /* The lookup only decides whether to send; the success exit is
     always sent=1 (next merely passes the redirect target through). */
  assert.ok(src.includes('back(req, { ...extras, sent: "1" })'));
  assertOrder(src, "issuePasswordResetToken(", 'sent: "1"', "发信分支不改变对外口径");
});

test("forgot: 重置链接用 canonical origin 拼,防 Host 头注入", () => {
  const src = sourceOf("auth/email/forgot");
  assert.match(src, /canonicalOrigin\(req\)/);
  assertOrder(src, "canonicalOrigin(req)", "resetUrl", "origin 先于链接拼接");
});

/* ---- Reset password /api/auth/email/reset ---- */

test("reset: 密码策略先于消费 token(不合规不烧有效 token)", () => {
  const src = sourceOf("auth/email/reset");
  assertOrder(src, "isSameOrigin(req)", "consumePasswordResetToken(", "同源校验先于消费 token");
  assertOrder(src, "passwordPolicyError(", "consumePasswordResetToken(", "密码策略先于消费 token");
  assertOrder(src, "password !== password2", "consumePasswordResetToken(", "二次确认先于消费 token");
  assertOrder(src, "setUserPassword(", "destroyAllSessions(", "换散列先于撤销旧会话");
  assertOrder(src, "destroyAllSessions(", "setSessionCookie(", "撤销旧会话先于种新会话");
  assertOrder(src, "setUserPassword(", "setSessionCookie(", "换散列先于种会话");
});

/* ---- Logout /api/auth/logout ---- */

test("logout: POST-only + 同源校验,撤销服务端会话并删 cookie", () => {
  const src = sourceOf("auth/logout");
  assert.match(src, /export async function POST/);
  assert.doesNotMatch(src, /export function GET|export async function GET/);
  assert.match(src, /isSameOrigin\(req\)/);
  assertOrder(src, "destroySessionToken(", 'res.cookies.delete("kb_session")', "先撤销服务端会话再删 cookie");
  assert.match(src, /cookies\.delete\("kb_session"\)/);
  assert.match(src, /canonicalOrigin\(req\)/);
});

/* ---- Cron Bearer auth (constant-time compare + a uniform 401 for
   the unconfigured case) ---- */

for (const cron of ["cron/ai-reply-retry", "cron/usage-retention", "cron/analytics-retention"]) {
  test(`${cron}: cronAuthorized 恒时鉴权,拒绝一律 401(不区分未配置/凭据错误)`, () => {
    const src = sourceOf(cron);
    assert.match(src, /import \{ cronAuthorized \} from "@\/src\/lib\/cron-auth"/);
    assert.match(src, /if \(!cronAuthorized\(request\)\)/);
    assert.match(src, /status: 401/);
    /* The old inline plaintext compare and the 500 that leaked
       configuration state are both gone. */
    assert.doesNotMatch(src, /headers\.get\("authorization"\)/);
    assert.doesNotMatch(src, /CRON_SECRET is not configured/);
  });
}
