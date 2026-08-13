import assert from "node:assert/strict";
import test from "node:test";
import { spliceMarkdown } from "../app/(app)/_components/MarkdownEditor";

/* ---- MarkdownEditor 的纯拼接:选区包裹 / 占位词 / 光标恢复 ---- */

test("spliceMarkdown wraps the selection and selects the wrapped text", () => {
  const r = spliceMarkdown("hello world", 6, 11, "**", "**", "粗体文本");
  assert.equal(r.next, "hello **world**");
  /* 选中 world(含 ** 内侧),方便继续改 */
  assert.equal(r.next.slice(r.selectionStart, r.selectionEnd), "world");
});

test("spliceMarkdown without a selection inserts the placeholder and selects it", () => {
  const r = spliceMarkdown("", 0, 0, "**", "**", "粗体文本");
  assert.equal(r.next, "**粗体文本**");
  assert.equal(r.next.slice(r.selectionStart, r.selectionEnd), "粗体文本");
});

test("spliceMarkdown line-prefix action lands at the cursor with a leading newline", () => {
  const r = spliceMarkdown("上文", 2, 2, "\n## ", "", "标题");
  assert.equal(r.next, "上文\n## 标题");
  assert.equal(r.next.slice(r.selectionStart, r.selectionEnd), "标题");
});

test("spliceMarkdown image syntax keeps the URL outside the selection", () => {
  const r = spliceMarkdown("正文", 2, 2, "![", "](https://cdn.example.com/x.webp)", "shot");
  assert.equal(r.next, "正文![shot](https://cdn.example.com/x.webp)");
  assert.equal(r.next.slice(r.selectionStart, r.selectionEnd), "shot");
});

test("spliceMarkdown mid-document insertion leaves the tail intact", () => {
  const r = spliceMarkdown("abc-def", 3, 4, "`", "`", "code");
  assert.equal(r.next, "abc`-`def");
  assert.equal(r.next.slice(r.selectionStart, r.selectionEnd), "-");
});
