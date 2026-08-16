/* @kimi 召唤检测与渲染插件的单元测试(20260816):
   词边界、全角 @、代码块剥离、渲染时 code/pre 跳过。 */
import assert from "node:assert/strict";
import test from "node:test";
import { hasKimiMention, rehypeKimiMention } from "../src/lib/mention-kimi";

test("mention: 句首/句中/标点后的 @kimi 命中", () => {
  assert.ok(hasKimiMention("@kimi 这个怎么用?"));
  assert.ok(hasKimiMention("想问下 @kimi 这个报错怎么看"));
  assert.ok(hasKimiMention("如题。@Kimi 帮忙总结下"));
  assert.ok(hasKimiMention("(@kimi)"));
});

test("mention: 大小写与全角 @ 兼容,@ 后允许空白", () => {
  assert.ok(hasKimiMention("@KIMI 在吗"));
  assert.ok(hasKimiMention("@Kimi 看下"));
  assert.ok(hasKimiMention("＠kimi 在吗"));
  assert.ok(hasKimiMention("@ kimi 这样也算"));
});

test("mention: 邮箱、长句柄、连字符词不命中", () => {
  assert.ok(!hasKimiMention("发到 a@kimi.com 就行"));
  assert.ok(!hasKimiMention("@kimiko 说得对"));
  assert.ok(!hasKimiMention("@kimi-builders 项目"));
  assert.ok(!hasKimiMention("没有任何召唤"));
});

test("mention: 代码块与行内代码里的 @kimi 不触发", () => {
  assert.ok(!hasKimiMention("```\n@kimi 在代码里\n```"));
  assert.ok(!hasKimiMention("用 `@kimi` 这个写法召唤"));
  /* 未闭合的 fence 也算代码(剥离到文末) */
  assert.ok(!hasKimiMention("```\n@kimi"));
  /* 代码外另有一个真实召唤仍命中 */
  assert.ok(hasKimiMention("```\n@kimi\n```\n外面的 @kimi 算数"));
});

/* 最小 hast 辅助:构造 element/text 树喂给插件 */
type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};
const el = (tagName: string, children: Node[]): Node => ({ type: "element", tagName, children });
const text = (value: string): Node => ({ type: "text", value });

function collectText(node: Node, out: string[] = []): string[] {
  if (node.value !== undefined) out.push(node.value);
  for (const c of node.children ?? []) collectText(c, out);
  return out;
}

test("rehype: 普通文本里的 @kimi 被包成 span.mention-kimi,前后文本保留", () => {
  const tree: Node = el("div", [el("p", [text("请问 @kimi 这个")])]);
  rehypeKimiMention()(tree as never);
  const p = tree.children![0];
  assert.equal(p.children!.length, 3);
  const span = p.children![1];
  assert.equal(span.tagName, "span");
  assert.deepEqual(span.properties, { className: ["mention-kimi"] });
  assert.equal(collectText(tree).join(""), "请问 @kimi 这个");
});

test("rehype: code 与 pre 里的 @kimi 不动", () => {
  const tree: Node = el("div", [
    el("p", [el("code", [text("@kimi 行内")])]),
    el("pre", [el("code", [text("@kimi 块")])]),
  ]);
  rehypeKimiMention()(tree as never);
  const json = JSON.stringify(tree);
  assert.ok(!json.includes("mention-kimi"));
});

test("rehype: 无命中时树保持原样(引用不变)", () => {
  const p = el("p", [text("没有召唤")]);
  const tree: Node = el("div", [p]);
  rehypeKimiMention()(tree as never);
  assert.equal(tree.children![0], p);
  assert.equal(p.children!.length, 1);
});
