import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

// Use an externally supplied Playwright installation via NODE_PATH; the application adds no dependency.
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.KB_TEST_BASE_URL;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("KB_TEST_BASE_URL must point to a running local server");
}
const email = process.env.KB_TEST_EMAIL;
const password = process.env.KB_TEST_PASSWORD;

test("settings tabs: roving tabIndex + arrow/Home/End move focus and selection", async (t) => {
  if (!email || !password) {
    t.skip("KB_TEST_EMAIL / KB_TEST_PASSWORD not set");
    return;
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await context.addCookies(
      Object.entries({ kb_locale: "zh", kb_theme: "dark", kb_vibe: "poster" })
        .map(([name, value]) => ({ name, value, url: base })),
    );
    await page.goto(`${base}/login`);
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="password"]').fill(password);
    await page.locator("main").getByRole("button", { name: "登录" }).click();
    await page.getByRole("button", { name: "退出" }).waitFor({ state: "visible" });
    await page.goto(`${base}/settings`);

    const tablist = page.getByRole("tablist", { name: "设置分区" });
    await tablist.getByRole("tab", { name: "资料" }).click();

    // Real trusted keyboard input: selection follows focus, ←/→ wrap,
    // Home/End jump, and only the active tab stays in the tab order.
    await page.keyboard.press("ArrowRight");
    await expectTab(page, "偏好", { selected: true, focused: true, tabIndex: 0 });
    await page.keyboard.press("ArrowRight");
    await expectTab(page, "隐私与公开", { selected: true, focused: true, tabIndex: 0 });
    await page.keyboard.press("ArrowLeft");
    await expectTab(page, "偏好", { selected: true, focused: true, tabIndex: 0 });
    await page.keyboard.press("End");
    await expectTab(page, "账号", { selected: true, focused: true, tabIndex: 0 });
    await page.keyboard.press("Home");
    await expectTab(page, "资料", { selected: true, focused: true, tabIndex: 0 });
    // Left from the first tab wraps to the last.
    await page.keyboard.press("ArrowLeft");
    await expectTab(page, "账号", { selected: true, focused: true, tabIndex: 0 });

    // Roving tabIndex: the inactive tabs are out of the tab order.
    const tabIndexes = await tablist.getByRole("tab").evaluateAll((tabs) =>
      tabs.map((tab) => ({ label: tab.textContent, ti: tab.tabIndex })),
    );
    assert.deepEqual(
      tabIndexes.filter((tab) => tab.ti === 0).map((tab) => tab.label),
      ["账号"],
    );

    // The panels follow the active tab.
    assert.equal(await page.locator("#settings-panel-account").isVisible(), true);
    assert.equal(await page.locator("#settings-panel-profile").isVisible(), false);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

async function expectTab(page, label, { selected, focused, tabIndex }) {
  await page.waitForFunction(
    ([name, wantSelected, wantFocused, wantTi]) => {
      const list = document.querySelector('[role="tablist"][aria-label]');
      const el = [...list.querySelectorAll("[role='tab']")].find((t) => t.textContent === name);
      return (
        el &&
        (el.getAttribute("aria-selected") === "true") === wantSelected &&
        (document.activeElement === el) === wantFocused &&
        el.tabIndex === wantTi
      );
    },
    [label, selected, focused, tabIndex],
    { timeout: 3000 },
  );
}
