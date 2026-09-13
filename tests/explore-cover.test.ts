import assert from "node:assert/strict";
import test from "node:test";
import { exploreCoverText, findKbChapter } from "../src/lib/kb-chapters";

/* Explore text-cover copy: zh keeps the compact kind label + single
   chapter glyph; en spells the word out — a bare "L"/"M" is unreadable
   out of context. With no chapter, the en word IS the kind, so the
   eyebrow drops (it would repeat the same word twice on one cover). */

const learn = findKbChapter("learn");

test("zh covers keep the compact kind label and single glyph", () => {
  assert.deepEqual(exploreCoverText("letter", undefined, true), {
    eyebrow: "月刊评鉴",
    word: "刊",
    latin: false,
  });
  assert.deepEqual(exploreCoverText("guide", learn, true), {
    eyebrow: "文章",
    word: "学",
    latin: false,
  });
});

test("en covers spell the chapter word out and keep the kind eyebrow", () => {
  assert.deepEqual(exploreCoverText("guide", learn, false), {
    eyebrow: "ARTICLE",
    word: "LEARN",
    latin: true,
  });
  for (const chapterId of ["build", "gain", "become"] as const) {
    const copy = exploreCoverText("guide", findKbChapter(chapterId), false);
    // The cover word matches the chapter control's own en label.
    assert.equal(copy.word, findKbChapter(chapterId)!.en);
    assert.equal(copy.latin, true);
  }
});

test("en covers without a chapter promote the kind word, eyebrow dropped", () => {
  assert.deepEqual(exploreCoverText("letter", undefined, false), {
    eyebrow: null,
    word: "MONTHLY",
    latin: true,
  });
  assert.deepEqual(exploreCoverText("guide", undefined, false), {
    eyebrow: null,
    word: "ARTICLE",
    latin: true,
  });
});

test("cover words stay single short words that fit the brick", () => {
  for (const chapter of ["learn", "build", "gain", "become"] as const) {
    const word = exploreCoverText("guide", findKbChapter(chapter), false).word;
    assert.match(word, /^[A-Z]+$/);
    assert.ok(word.length <= 6, word);
  }
  assert.ok(exploreCoverText("letter", undefined, false).word.length <= 8);
  assert.ok(exploreCoverText("guide", undefined, false).word.length <= 8);
});
