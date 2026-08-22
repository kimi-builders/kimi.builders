import assert from "node:assert/strict";
import test from "node:test";
import {
  isEditableTarget,
  isPlainShortcutContext,
} from "../src/lib/shortcut-guards";

/* 快捷键守卫(20260822):触发条件是快捷键层的全部安全边界,钉住防回归 */
const plain = { metaKey: false, ctrlKey: false, altKey: false, isComposing: false };

test("isPlainShortcutContext: 修饰键组合一律不触发", () => {
  const target = null;
  assert.equal(isPlainShortcutContext({ ...plain, metaKey: true }, target, false), false);
  assert.equal(isPlainShortcutContext({ ...plain, ctrlKey: true }, target, false), false);
  assert.equal(isPlainShortcutContext({ ...plain, altKey: true }, target, false), false);
});

test("isPlainShortcutContext: IME 组合中不触发", () => {
  assert.equal(isPlainShortcutContext({ ...plain, isComposing: true }, null, false), false);
});

test("isPlainShortcutContext: 弹窗开着时不触发(字母键让位,Esc 例外在调用方)", () => {
  assert.equal(isPlainShortcutContext(plain, null, true), false);
});

test("isPlainShortcutContext: 焦点在可编辑区不触发", () => {
  const input = { closest: (sel: string) => (sel.includes("input") ? {} : null) } as Element;
  const textarea = { closest: (sel: string) => (sel.includes("textarea") ? {} : null) } as Element;
  const contenteditable = {
    closest: (sel: string) => (sel.includes("contenteditable") ? {} : null),
  } as Element;
  assert.equal(isPlainShortcutContext(plain, input, false), false);
  assert.equal(isPlainShortcutContext(plain, textarea, false), false);
  assert.equal(isPlainShortcutContext(plain, contenteditable, false), false);
});

test("isPlainShortcutContext: 普通页面元素触发;Shift 不拦(? 是 Shift+/)", () => {
  const div = { closest: () => null } as unknown as Element;
  assert.equal(isPlainShortcutContext(plain, div, false), true);
  assert.equal(isPlainShortcutContext(plain, null, false), true);
});

test("isEditableTarget: 输入态识别(? 呼出面板的豁免依据)", () => {
  const input = { closest: (sel: string) => (sel.includes("input") ? {} : null) } as Element;
  const div = { closest: () => null } as unknown as Element;
  assert.equal(isEditableTarget(input), true);
  assert.equal(isEditableTarget(div), false);
  assert.equal(isEditableTarget(null), false);
});
