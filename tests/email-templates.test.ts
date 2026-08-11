/* 品牌邮件骨架单元测试:结构(table 布局/内联样式/防弹按钮)、内容透传与转义、
   安全约束(无 script/外部样式表)、logo URL 约定。无数据库、无网络。 */
import assert from "node:assert/strict";
import test from "node:test";

import { renderBrandEmail, renderPasswordResetMail } from "../src/lib/email-templates";

const SAMPLE = {
  title: "重置密码 / Reset your password",
  bodyHtml: '<p style="margin:0;">测试正文 Test body</p>',
  cta: {
    label: "重置密码 / Reset password",
    href: "https://kimi.builders/login/reset?token=abc123",
  },
  footnote: "如果这不是你的操作,忽略本邮件即可。\nIf you didn't request this, ignore it.",
} as const;

test("template: CTA href 同时出现在按钮与明文兜底链接", () => {
  const html = renderBrandEmail(SAMPLE);
  const occurrences = html.split(SAMPLE.cta.href).length - 1;
  assert.ok(occurrences >= 2, `href should appear at least twice, got ${occurrences}`);
  assert.match(html, /bgcolor="#1783ff"/); // 防弹按钮的 td 底色(品牌蓝)
  assert.match(html, /border-radius:8px/);
});

test("template: 双语关键串 + 标题 + 正文透传", () => {
  const html = renderBrandEmail(SAMPLE);
  assert.ok(html.includes("重置密码 / Reset your password"));
  assert.ok(html.includes("测试正文 Test body"));
  assert.ok(html.includes("如果这不是你的操作,忽略本邮件即可。"));
  assert.ok(html.includes("If you didn't request this, ignore it."));
  // 页脚站点链接
  assert.ok(html.includes('href="https://kimi.builders"'));
});

test("template: 无 script / 无外部样式表 / 无 flex/grid,纯 table + 内联", () => {
  const html = renderBrandEmail(SAMPLE).toLowerCase();
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<link"));
  assert.ok(!html.includes('rel="stylesheet"'));
  assert.ok(!html.includes("display:flex"));
  assert.ok(!html.includes("display:grid"));
  assert.ok(!html.includes("class="));
  assert.ok(html.includes("<table"));
  assert.ok(html.includes("style="));
});

test("template: 外层深底(bgcolor+style 双写)+ 深卡 hairline 圆角 + 560px 居中", () => {
  const html = renderBrandEmail(SAMPLE);
  assert.ok(html.includes('bgcolor="#0e0e13"')); // body/外层 table 的 bgcolor 属性
  assert.ok(html.includes("background-color:#0e0e13"));
  assert.ok(html.includes('bgcolor="#16161f"')); // 深面板卡
  assert.ok(html.includes("border:1px solid rgba(255,255,255,0.12)"));
  assert.ok(html.includes("width:560px;max-width:100%"));
  assert.ok(html.includes("border-radius:16px"));
  // 深色邮件:暖白主文字 + 次要灰,不允许深底上压近黑文字
  assert.ok(html.includes("color:#efe8dc"));
  assert.ok(html.includes("color:#9a9aa5"));
  assert.ok(!html.includes("color:#000"));
});

test("template: style 属性内不混双引号(字体栈单引号,按钮白字样式不被截断)", () => {
  const html = renderBrandEmail(SAMPLE);
  assert.ok(!html.includes('"Segoe UI"'));
  assert.match(html, /<a href="[^"]*" target="_blank" style="[^"]*color:#ffffff;[^"]*">/);
});

test("template: logo 默认走 canonical URL,alt 完整;siteUrl 可覆盖", () => {
  const html = renderBrandEmail(SAMPLE);
  assert.ok(html.includes('src="https://kimi.builders/brand/logo-email.png"'));
  assert.match(html, /alt="[^"]*kimi\.builders[^"]*"/);
  const custom = renderBrandEmail({ ...SAMPLE, siteUrl: "http://localhost:3111/" });
  assert.ok(custom.includes('src="http://localhost:3111/brand/logo-email.png"'));
});

test("template: title/label/footnote 转义,bodyHtml 信任透传", () => {
  const html = renderBrandEmail({
    ...SAMPLE,
    title: '<b>x</b>"',
    cta: { label: "<i>y</i>", href: SAMPLE.cta.href },
  });
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;&quot;"));
  assert.ok(html.includes("&lt;i&gt;y&lt;/i&gt;"));
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(!html.includes("<i>y</i>"));
});

test("template: 缺省 cta/footnote 时对应块不渲染;footnote 换行变 <br>", () => {
  const bare = renderBrandEmail({ title: "t", bodyHtml: "<p>x</p>" });
  assert.ok(!bare.includes('bgcolor="#1783ff"'));
  assert.ok(!bare.includes("Paste this link"));
  const html = renderBrandEmail(SAMPLE);
  assert.ok(html.includes("即可。<br>If you didn't"));
});

test("template: eyebrow mono 小字标签渲染并转义;缺省不出现", () => {
  const html = renderBrandEmail({ ...SAMPLE, eyebrow: "KIMI.BUILDERS / SECURITY" });
  assert.ok(html.includes("KIMI.BUILDERS / SECURITY"));
  assert.ok(html.includes("ui-monospace,'SF Mono'"));
  const bare = renderBrandEmail({ title: "t", bodyHtml: "<p>x</p>" });
  assert.ok(!bare.includes("ui-monospace"));
});

test("template: preheader 隐藏摘要缺省用 title,可覆盖", () => {
  const html = renderBrandEmail(SAMPLE);
  assert.match(html, /<div style="display:none[^"]*">重置密码 \/ Reset your password<\/div>/);
  const custom = renderBrandEmail({ ...SAMPLE, preheader: "预览摘要" });
  assert.ok(custom.includes(">预览摘要</div>"));
});

test("password reset mail: subject/text/html 齐备,双语文案 + 链接一致", () => {
  const mail = renderPasswordResetMail({
    resetUrl: "https://kimi.builders/login/reset?token=deadbeef",
    siteUrl: "https://kimi.builders",
  });
  assert.ok(mail.subject.includes("重置"));
  assert.ok(mail.subject.includes("Reset"));
  // text 兜底:纯文本、含链接、无 HTML 标签
  assert.ok(mail.text.includes("https://kimi.builders/login/reset?token=deadbeef"));
  assert.ok(mail.text.includes("1 小时内有效"));
  assert.ok(!mail.text.includes("<p"));
  // html:品牌骨架 + 同一链接 + 双语 + mono eyebrow
  assert.ok(mail.html.includes("https://kimi.builders/login/reset?token=deadbeef"));
  assert.ok(mail.html.includes("点击下方按钮设置新密码"));
  assert.ok(mail.html.includes("Use the button below"));
  assert.ok(mail.html.includes("KIMI.BUILDERS / SECURITY"));
  assert.ok(mail.html.includes("<!doctype html>"));
});
