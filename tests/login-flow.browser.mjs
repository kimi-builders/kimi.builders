import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import test from "node:test";

// Use an externally supplied Playwright installation via NODE_PATH; the application adds no dependency.
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.KB_TEST_BASE_URL;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("KB_TEST_BASE_URL must point to a running local server");
}
const screenshots = process.env.KB_TEST_SCREENSHOTS;
async function enterIncorrectPassword(field) {
  // Generate inside the browser so assertion and automation failure logs cannot expose a password.
  await field.evaluate((input) => {
    input.value = crypto.randomUUID();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const variants = [
  { width: 390, locale: "zh", theme: "dark", vibe: "poster" },
  { width: 390, locale: "en", theme: "light", vibe: "soft" },
  { width: 1280, locale: "zh", theme: "light", vibe: "soft" },
  { width: 1280, locale: "en", theme: "dark", vibe: "poster" },
];

for (const variant of variants) {
  test(`login retry and dismissal: ${Object.values(variant).join(" / ")}`, async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: variant.width, height: 900 } });
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
      await context.addCookies(Object.entries({ kb_locale: variant.locale, kb_theme: variant.theme, kb_vibe: variant.vibe })
        .map(([name, value]) => ({ name, value, url: base })));
      await page.goto(`${base}/community?sort=new`);
      const source = await page.locator("main h1").elementHandle();
      const trigger = page.locator('a[href="/login?next=%2Fcommunity%2Fnew"]:visible').first();
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      const openedUrl = page.url();
      const next = new URL(openedUrl).searchParams.get("next");
      const form = dialog.locator("form");
      const email = form.locator('[name="email"]');
      const password = form.locator('[name="password"]');
      let submissions = 0;
      let release;
      let responseMode = "credentials";
      await page.route("**/api/auth/email/login*", async (route) => {
        submissions++;
        assert.equal(route.request().headers().accept, "application/json");
        assert.equal(new URL(route.request().url()).searchParams.get("next"), next);
        if (submissions === 1) await new Promise((resolve) => { release = resolve; });
        if (responseMode === "network") return route.abort("failed");
        await route.fulfill({
          status: responseMode === "rate" ? 429 : 401,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: responseMode === "rate" ? "rate_limited" : "bad_credentials" }),
        });
      });
      await email.fill("builder@example.com");
      await enterIncorrectPassword(password);
      await password.press("Enter");
      await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
      assert.equal(await form.locator('button[type="submit"]').isDisabled(), true);
      assert.equal(await email.isDisabled(), true);
      assert.equal(await password.isDisabled(), true);
      await form.evaluate((node) => { node.requestSubmit(); node.requestSubmit(); });
      await page.waitForTimeout(100);
      assert.equal(submissions, 1);
      release();
      const expectedError = variant.locale === "zh" ? "邮箱或密码不正确" : "Incorrect email or password.";
      await form.getByRole("alert").filter({ hasText: expectedError }).waitFor();
      assert.equal(page.url(), openedUrl);
      assert.equal(await source.evaluate((node) => node.isConnected), true);
      assert.equal(await email.inputValue(), "builder@example.com");
      assert.equal((await password.inputValue()).length, 0);
      assert.equal(await password.evaluate((node) => node === document.activeElement), true);
      assert.equal(await form.locator('button[type="submit"]').isEnabled(), true);
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= variant.width && box.y >= 0 && box.y + box.height <= 900);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({ path: `${screenshots}/modal-${variant.width}-${variant.locale}.png` });
      }
      await enterIncorrectPassword(password);
      await form.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('form[aria-busy="false"] [role="alert"]'));
      assert.equal(submissions, 2);
      assert.equal((await password.inputValue()).length, 0);
      await page.keyboard.press("Escape");
      await page.waitForURL(`${base}/community?sort=new`);
      assert.equal(await page.locator("dialog[open]").count(), 0);

      for (const close of ["button", "backdrop"]) {
        await trigger.click();
        await dialog.waitFor({ state: "visible" });
        await email.fill("builder@example.com");
        await enterIncorrectPassword(password);
        await password.press("Enter");
        await form.getByRole("alert").filter({ hasText: expectedError }).waitFor();
        if (close === "button") await dialog.getByRole("button", { name: variant.locale === "zh" ? "关闭" : "Close", exact: true }).click();
        else await page.mouse.click(2, 2);
        await page.waitForURL(`${base}/community?sort=new`);
        assert.equal(await page.locator("dialog[open]").count(), 0);
      }

      await page.goto(`${base}/login?next=${encodeURIComponent(next)}`);
      assert.equal(await page.locator("dialog[open]").count(), 0);
      const fullForm = page.locator('form[action^="/api/auth/email/login"]');
      const fullPassword = fullForm.locator('[name="password"]');
      await fullForm.locator('[name="email"]').fill("builder@example.com");
      await enterIncorrectPassword(fullPassword);
      await fullPassword.press("Enter");
      await fullForm.getByRole("alert").filter({ hasText: expectedError }).waitFor();
      assert.equal(await fullForm.locator('[name="email"]').inputValue(), "builder@example.com");
      assert.equal((await fullPassword.inputValue()).length, 0);
      assert.equal(await fullPassword.evaluate((node) => node === document.activeElement), true);
      if (screenshots) await page.screenshot({ path: `${screenshots}/page-${variant.width}-${variant.locale}.png` });

      for (const mode of ["rate", "network"]) {
        responseMode = mode;
        await enterIncorrectPassword(fullPassword);
        await fullPassword.press("Enter");
        await page.waitForFunction(() => document.querySelector('form[aria-busy="false"] [role="alert"]'));
        assert.equal((await fullPassword.inputValue()).length, 0);
        assert.equal(await fullForm.locator('[name="email"]').inputValue(), "builder@example.com");
        assert.equal(await fullPassword.evaluate((node) => node === document.activeElement), true);
        assert.equal(await fullForm.getByRole("alert").textContent(), variant.locale === "zh"
          ? (mode === "rate" ? "尝试太频繁，请稍后再试" : "暂时无法确认登录结果，请重试")
          : (mode === "rate" ? "Too many attempts. Try again later." : "Unable to confirm sign-in. Please try again."));
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  });
}

test("native full-page submissions retain only email and next across the 303", async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await context.addCookies([{ name: "kb_locale", value: "en", url: base }]);
    await page.goto(`${base}/login?next=%2Fcommunity%3Fsort%3Dnew`);
    await page.route("**/api/auth/email/login*", async (route) => {
      assert.notEqual(route.request().headers().accept, "application/json");
      await route.fulfill({
        status: 303,
        headers: { location: "/login?error=bad_credentials&next=%2Fcommunity%3Fsort%3Dnew&email=builder%40example.com" },
      });
    });
    await page.locator('[name="email"]').fill("builder@example.com");
    await enterIncorrectPassword(page.locator('[name="password"]'));
    await page.locator('form[action^="/api/auth/email/login"]').evaluate((form) => form.submit());
    await page.waitForURL("**/login?error=bad_credentials&**");
    await page.getByRole("alert").filter({ hasText: "Incorrect email or password." }).waitFor();
    assert.equal(await page.locator('[name="email"]').inputValue(), "builder@example.com");
    assert.equal((await page.locator('[name="password"]').inputValue()).length, 0);
    assert.equal(new URL(page.url()).searchParams.get("next"), "/community?sort=new");
    assert.equal(new URL(page.url()).searchParams.has("password"), false);
    assert.equal(await page.locator("dialog[open]").count(), 0);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("closing during sign-in cancels late navigation and leaves the source usable", async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let release;
  try {
    await context.addCookies([{ name: "kb_locale", value: "en", url: base }]);
    await page.goto(`${base}/community`);
    await page.locator('a[href="/login?next=%2Fcommunity%2Fnew"]:visible').first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await page.route("**/api/auth/email/login*", async (route) => {
      await new Promise((resolve) => { release = resolve; });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, next: "/explore" }) });
    });
    await dialog.locator('[name="email"]').fill("builder@example.com");
    await enterIncorrectPassword(dialog.locator('[name="password"]'));
    await dialog.locator('[name="password"]').press("Enter");
    await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForURL(`${base}/community`);
    release();
    await page.waitForTimeout(300);
    assert.equal(page.url(), `${base}/community`);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page.locator('a[href="/login?next=%2Fcommunity%2Fnew"]:visible').first().click();
    await dialog.waitFor();
    assert.equal(await dialog.locator('button[type="submit"]').isEnabled(), true);
    assert.equal((await dialog.locator('[name="password"]').inputValue()).length, 0);
  } finally {
    release?.();
    await context.close();
    await browser.close();
  }
});
