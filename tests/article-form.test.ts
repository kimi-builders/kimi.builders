import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleGuidePayload,
  assembleLetterPayload,
  parseTagInput,
} from "../app/(app)/blog/_components/ArticleForm";
import { validateGuidePayload } from "../src/lib/tutorials";
import { validateLetterPayload } from "../src/lib/monthly";

/* ---- 结构化表单 → payload 组装(20260822 发布改版):
   组装产物必须能过服务端严格校验(roundtrip 钉住两端不漂移) ---- */

test("parseTagInput: split, dedupe, cap 5, drop empties/overlong", () => {
  assert.deepEqual(parseTagInput("入门 工作流, 效率　入门"), ["入门", "工作流", "效率"]);
  assert.deepEqual(parseTagInput("a b c d e f g"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(parseTagInput(""), []);
});

test("assembleGuidePayload: full state roundtrips the strict validator", () => {
  const json = assembleGuidePayload({
    seriesSel: "kimi-best-practice",
    chapter: "learn",
    cover: "/covers/a.png",
    coverTone: "blue",
    products: ["kimi-code", "plugin"],
    roles: ["software"],
    videoProvider: "bilibili",
    videoId: "BV1xx",
    deck: "/decks/a.html",
    durationMin: "15",
    scenario: "起一个项目",
    aiNote: "AI 起草,编辑定稿",
    tags: "入门 工作流",
    resources: [
      { label: "官方文档", url: "https://example.com", kind: "official" },
      { label: "本集提示词", url: "/p/1", kind: "prompt" },
    ],
  });
  const parsed = validateGuidePayload(JSON.parse(json));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.payload.chapter, "learn");
    assert.equal(parsed.payload.coverTone, "blue");
    assert.deepEqual(parsed.payload.products, ["kimi-code", "plugin"]);
    assert.deepEqual(parsed.payload.resources?.[1], { label: "本集提示词", url: "/p/1", kind: "prompt" });
    assert.equal(parsed.payload.durationMin, 15);
  }
});

test("assembleGuidePayload: empty state assembles to {}", () => {
  const json = assembleGuidePayload({
    seriesSel: "", chapter: "", cover: "", coverTone: "theme", products: [], roles: [],
    videoProvider: "bilibili", videoId: "", deck: "", durationMin: "",
    scenario: "", aiNote: "", tags: "", resources: [],
  });
  assert.deepEqual(JSON.parse(json), {});
});

test("assembleGuidePayload: theme tone is omitted, fixed tone kept", () => {
  const theme = assembleGuidePayload({
    seriesSel: "", chapter: "", cover: "", coverTone: "theme", products: [], roles: [],
    videoProvider: "bilibili", videoId: "", deck: "", durationMin: "",
    scenario: "", aiNote: "", tags: "", resources: [],
  });
  assert.equal((JSON.parse(theme) as { coverTone?: string }).coverTone, undefined);
  const fixed = assembleGuidePayload({
    seriesSel: "", chapter: "", cover: "", coverTone: "green", products: [], roles: [],
    videoProvider: "bilibili", videoId: "", deck: "", durationMin: "",
    scenario: "", aiNote: "", tags: "", resources: [],
  });
  const parsed = validateGuidePayload(JSON.parse(fixed));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.payload.coverTone, "green");
});

test("assembleGuidePayload: partial resources are dropped, bad duration ignored", () => {
  const json = assembleGuidePayload({
    seriesSel: "", chapter: "", cover: "", coverTone: "theme", products: [], roles: [],
    videoProvider: "bilibili", videoId: "", deck: "", durationMin: "abc",
    scenario: "", aiNote: "", tags: "",
    resources: [{ label: "", url: "https://x", kind: "file" }, { label: "好的", url: "/f", kind: "file" }],
  });
  const parsed = JSON.parse(json) as { resources?: unknown[]; durationMin?: number };
  assert.deepEqual(parsed.resources, [{ label: "好的", url: "/f", kind: "file" }]);
  assert.equal(parsed.durationMin, undefined);
});

test("assembleLetterPayload: cover/tags/disclosure/governance roundtrip", () => {
  const json = assembleLetterPayload({
    cover: "https://picsum.photos/seed/l/640/360",
    coverTone: "black",
    tags: "评鉴 月报",
    aiDigest: "评鉴节 AI 参与…",
    aiFacts: "",
    aiDecisions: "定夺由编辑拍板",
    governance: [
      { title: "一起争议的裁决", note: "过程公开", rulingUrl: "/community/99" },
      { title: "", note: "未填标题会被丢弃", rulingUrl: "" },
    ],
  });
  const parsed = validateLetterPayload(JSON.parse(json));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.payload.cover, "https://picsum.photos/seed/l/640/360");
    assert.equal(parsed.payload.coverTone, "black");
    assert.deepEqual(parsed.payload.tags, ["评鉴", "月报"]);
    assert.equal(parsed.payload.aiDisclosure?.digest, "评鉴节 AI 参与…");
    assert.equal(parsed.payload.aiDisclosure?.facts, undefined);
    assert.deepEqual(parsed.payload.governance, [
      { title: "一起争议的裁决", note: "过程公开", rulingUrl: "/community/99" },
    ]);
  }
});
