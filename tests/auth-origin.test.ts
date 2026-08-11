import assert from "node:assert/strict";
import test from "node:test";
import { canonicalOrigin } from "../src/lib/auth/origin";

test("canonicalOrigin prefers NEXT_PUBLIC_SITE_URL over request origin", () => {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://kimi.builders";
  try {
    // 反代后的内网请求地址必须被 canonical origin 覆盖
    const req = new Request("http://localhost:3210/api/auth/github");
    assert.equal(canonicalOrigin(req), "https://kimi.builders");
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
});

test("canonicalOrigin strips trailing slash and falls back to request origin", () => {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const req = new Request("http://localhost:3000/login?x=1");
    assert.equal(canonicalOrigin(req), "http://localhost:3000");
  } finally {
    if (saved !== undefined) process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
});
