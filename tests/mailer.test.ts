/* Resend 邮件通道单元测试:不连真 API,fetch 全部打桩。
   覆盖:not_configured 软失败(且不发请求)、请求形状、MAIL_FROM 覆盖、
   非 2xx 截断 200 字、网络/超时异常软失败。无数据库。 */
import assert from "node:assert/strict";
import test from "node:test";

import { sendMail } from "../src/lib/mailer";

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function stubFetch(impl: FetchImpl) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return impl(input, init);
  }) as unknown as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function withEnv(key: string, value: string | undefined): () => void {
  const saved = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  return () => {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  };
}

test("mailer: RESEND_API_KEY 未配置 → not_configured 软失败,不发请求", async () => {
  const restoreEnv = withEnv("RESEND_API_KEY", undefined);
  const stub = stubFetch(() => {
    throw new Error("fetch must not be called");
  });
  try {
    const res = await sendMail({ to: "u@example.com", subject: "s", text: "t" });
    assert.deepEqual(res, { ok: false, error: "not_configured" });
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test("mailer: 成功路径请求形状(endpoint/Bearer/默认 from/body/超时 signal)", async () => {
  const restoreEnv = withEnv("RESEND_API_KEY", "re_test_key");
  const restoreFrom = withEnv("MAIL_FROM", undefined);
  const stub = stubFetch(async () => new Response('{"id":"msg_1"}', { status: 200 }));
  try {
    const res = await sendMail({ to: "u@example.com", subject: "主题", text: "正文" });
    assert.deepEqual(res, { ok: true });
    assert.equal(stub.calls.length, 1);
    const { url, init } = stub.calls[0];
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer re_test_key");
    assert.equal(headers.get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      from: "kimi.builders <noreply@mail.kimi.builders>",
      to: "u@example.com",
      subject: "主题",
      text: "正文",
    });
    assert.ok(init?.signal instanceof AbortSignal);
  } finally {
    stub.restore();
    restoreEnv();
    restoreFrom();
  }
});

test("mailer: MAIL_FROM 覆盖默认发件人", async () => {
  const restoreEnv = withEnv("RESEND_API_KEY", "re_test_key");
  const restoreFrom = withEnv("MAIL_FROM", "KB <hello@mail.kimi.builders>");
  const stub = stubFetch(async () => new Response("{}", { status: 200 }));
  try {
    await sendMail({ to: "u@example.com", subject: "s", text: "t" });
    const body = JSON.parse(String(stub.calls[0].init?.body));
    assert.equal(body.from, "KB <hello@mail.kimi.builders>");
  } finally {
    stub.restore();
    restoreEnv();
    restoreFrom();
  }
});

test("mailer: 非 2xx → http_<status> + 响应文本截断 200 字", async () => {
  const restoreEnv = withEnv("RESEND_API_KEY", "re_test_key");
  const stub = stubFetch(async () => new Response("x".repeat(500), { status: 422 }));
  try {
    const res = await sendMail({ to: "u@example.com", subject: "s", text: "t" });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.error.startsWith("http_422:"));
      assert.equal(res.error.length, "http_422:".length + 200);
    }
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test("mailer: fetch 抛错(超时/网络)→ 软失败带 message,不向上抛", async () => {
  const restoreEnv = withEnv("RESEND_API_KEY", "re_test_key");
  const stub = stubFetch(async () => {
    throw new Error("The operation timed out.");
  });
  try {
    const res = await sendMail({ to: "u@example.com", subject: "s", text: "t" });
    assert.deepEqual(res, { ok: false, error: "The operation timed out." });
  } finally {
    stub.restore();
    restoreEnv();
  }
});
