/* /api/auth/* 与 /api/cron/* 的路由级测试:鉴权判断、限速顺序、错误分支的
   回归护栏。与 upload-route.test.ts 同约定——直接断言路由源码的关键顺序,
   不起服务;逻辑细节由 lib 层单测/集成测试覆盖。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function sourceOf(path: string): string {
  return readFileSync(new URL(`../app/api/${path}/route.ts`, import.meta.url), "utf8");
}

/* 前后顺序断言:a 必须出现在 b 之前(鉴权/限速先于解析与写库)。 */
function assertOrder(src: string, a: string, b: string, label: string) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  assert.ok(ia >= 0, `${label}: 缺少 ${a}`);
  assert.ok(ib >= 0, `${label}: 缺少 ${b}`);
  assert.ok(ia < ib, `${label}: ${a} 必须先于 ${b}`);
}

/* ---- OAuth 起点 /api/auth/[provider] ---- */

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
  /* redirect_uri 走 canonical origin,不用裸请求 Host(Host 头注入防线) */
  assert.match(src, /canonicalOrigin\(req\)/);
});

/* ---- OAuth 回调 /api/auth/callback/[provider] ---- */

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
  /* 失败出口统一走 fail/linkFail,不裸抛 */
  assert.match(src, /auth_error/);
  assert.match(src, /link_error/);
});

/* ---- 邮箱注册 /api/auth/email/register ---- */

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

/* ---- 邮箱登录 /api/auth/email/login ---- */

test("login: IP 限速先于解析,账号限速先于查库", () => {
  const src = sourceOf("auth/email/login");
  assertOrder(src, "isSameOrigin(req)", "req.formData()", "同源校验先于表单解析");
  assertOrder(src, '"auth-email-login"', "req.formData()", "IP 限速先于表单解析");
  assertOrder(src, '"auth-email-login-account"', "findEmailAccount(", "账号限速先于查库");
});

test("login: 失败口径统一 bad_credentials,不暴露邮箱是否注册", () => {
  const src = sourceOf("auth/email/login");
  /* 查无此号与密码错误走同一个出口 */
  assert.match(src, /account\?\.passwordHash != null\s*&&/);
  assert.equal((src.match(/"bad_credentials"/g) ?? []).length, 1);
  assertOrder(src, "verifyPassword(", "setSessionCookie(", "验密先于种会话");
});

/* ---- 忘记密码 /api/auth/email/forgot ---- */

test("forgot: 无论邮箱是否注册都回 sent=1(不泄露注册状态)", () => {
  const src = sourceOf("auth/email/forgot");
  assertOrder(src, "isSameOrigin(req)", "req.formData()", "同源校验先于表单解析");
  assertOrder(src, "consumeUsageRateLimit(", "req.formData()", "限速先于表单解析");
  /* 查库结果只决定发不发信,成功出口只有 sent=1 */
  assert.ok(src.includes('back(req, { sent: "1" })'));
  assertOrder(src, "issuePasswordResetToken(", 'sent: "1"', "发信分支不改变对外口径");
});

test("forgot: 重置链接用 canonical origin 拼,防 Host 头注入", () => {
  const src = sourceOf("auth/email/forgot");
  assert.match(src, /canonicalOrigin\(req\)/);
  assertOrder(src, "canonicalOrigin(req)", "resetUrl", "origin 先于链接拼接");
});

/* ---- 重置密码 /api/auth/email/reset ---- */

test("reset: 密码策略先于消费 token(不合规不烧有效 token)", () => {
  const src = sourceOf("auth/email/reset");
  assertOrder(src, "isSameOrigin(req)", "consumePasswordResetToken(", "同源校验先于消费 token");
  assertOrder(src, "passwordPolicyError(", "consumePasswordResetToken(", "密码策略先于消费 token");
  assertOrder(src, "password !== password2", "consumePasswordResetToken(", "二次确认先于消费 token");
  assertOrder(src, "setUserPassword(", "setSessionCookie(", "换散列先于种会话");
});

/* ---- 登出 /api/auth/logout ---- */

test("logout: 删会话 cookie 并回 canonical 首页", () => {
  const src = sourceOf("auth/logout");
  assert.match(src, /cookies\.delete\("kb_session"\)/);
  assert.match(src, /canonicalOrigin\(req\)/);
});

/* ---- cron 路由的 Bearer 鉴权 ---- */

for (const cron of ["cron/ai-reply-retry", "cron/usage-retention", "cron/analytics-retention"]) {
  test(`${cron}: 未配置 CRON_SECRET 拒绝服务,Bearer 不符即 401`, () => {
    const src = sourceOf(cron);
    assert.match(src, /CRON_SECRET is not configured/);
    assert.match(src, /headers\.get\("authorization"\) !== `Bearer \$\{secret\}`/);
    assert.match(src, /401/);
  });
}
