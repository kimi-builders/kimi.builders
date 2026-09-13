import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

// Use an externally supplied Playwright installation via NODE_PATH; the application adds no dependency.
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.KB_TEST_BASE_URL;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("KB_TEST_BASE_URL must point to a running local server");
}
// Credentials never live in the tree; the scenario needs a real session
// (the post form renders for members only).
const email = process.env.KB_TEST_EMAIL;
const password = process.env.KB_TEST_PASSWORD;
const DRAFT_KEY = "kb-community-post-draft-v1";

test("post draft confirm: closing keeps the draft, clearing it un-arms the confirm", async (t) => {
  if (!email || !password) {
    t.skip("KB_TEST_EMAIL / KB_TEST_PASSWORD not set");
    return;
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()) &&
      !/^Failed to load resource: (the server responded with a status of (401|429)|net::ERR_FAILED)/.test(message.text())) {
      errors.push(message.text());
    }
  });
  try {
    await context.addCookies(
      Object.entries({ kb_locale: "zh", kb_theme: "dark", kb_vibe: "poster" })
        .map(([name, value]) => ({ name, value, url: base })),
    );

    // Log in through the UI (never submits content anywhere).
    await page.goto(`${base}/login`);
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="password"]').fill(password);
    await page.locator("main").getByRole("button", { name: "登录" }).click();
    await page.getByRole("button", { name: "退出" }).waitFor({ state: "visible" });

    // Open the intercepted new-post modal from the community page.
    await page.goto(`${base}/community`);
    const compose = page.locator("main").getByRole("link", { name: /发帖/ });
    await compose.waitFor({ state: "visible" });
    await compose.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });

    const title = dialog.locator('[name="title"]');
    const confirmTitle = page.getByText("关闭发帖窗口？草稿仍会保存在本设备。");
    const keepDraftClose = dialog.getByRole("button", { name: "保留草稿并关闭" });
    const clearDraft = dialog.getByRole("button", { name: "清空草稿" });
    const closeButton = dialog.getByRole("button", { name: "关闭", exact: true });

    // Dirty form + X → the honest confirm: the draft survives the close.
    await title.fill("[QA] draft confirm interaction test");
    // The autosave debounce is 180ms — wait it out so the close really
    // has a stored draft to promise about.
    await page.waitForTimeout(300);
    await closeButton.click();
    await confirmTitle.waitFor({ state: "visible" });
    await keepDraftClose.click();
    await dialog.waitFor({ state: "hidden" });

    // Reopen: the draft restores, copy and behavior agree.
    await compose.click();
    await dialog.waitFor({ state: "visible" });
    await page.waitForFunction(
      (expected) => document.querySelector('dialog [name="title"]')?.value === expected,
      "[QA] draft confirm interaction test",
      { timeout: 5000 },
    );
    assert.equal(await page.evaluate((key) => !!localStorage.getItem(key), DRAFT_KEY), true);

    // Clear the draft: nothing left to keep — X must close directly,
    // the confirm (now a false promise) must not appear.
    await clearDraft.click();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY), null);
    assert.equal(await confirmTitle.count(), 0);
    await closeButton.click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await confirmTitle.count(), 0);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
