import assert from "node:assert/strict";
import test from "node:test";
import { isMobileUA, WORKS_VIEW_COOKIE } from "../src/lib/works-view";

/* ---- 移动端 UA 判定(20260822 移动端恒行式) ---- */

test("isMobileUA: phones detected, desktop UA not", () => {
  /* iPhone Safari */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ),
    true,
  );
  /* Android Chrome(手机与平板同前缀,一并走移动口径) */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
    ),
    true,
  );
  /* 桌面 macOS Safari(iPadOS 13+ 默认请求桌面版 UA,同样落桌面口径) */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    ),
    false,
  );
  /* 桌面 Windows Chrome */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    ),
    false,
  );
  /* 空/缺失 UA:宁可当桌面(回落行式默认态之外仍显示切换器,不困人) */
  assert.equal(isMobileUA(""), false);
});

test("works-view cookie name stays stable (kb-works-view)", () => {
  assert.equal(WORKS_VIEW_COOKIE, "kb-works-view");
});
