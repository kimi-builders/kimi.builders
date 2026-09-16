import assert from "node:assert/strict";
import test from "node:test";
import { relTime, stripDuplicateLeadingHeading } from "../src/lib/format";

/* ---- relTime: near-relative, then absolute from 7 days on. One rule
   for every surface reusing relTime (community lists, details,
   comments, notifications) so one list never mixes "27 days ago" with
   "2026-08-12". ---- */

const NOW = Date.parse("2026-09-12T12:00:00.000Z");

function relFromSeconds(seconds: number, locale: "zh" | "en" = "zh"): string {
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    return relTime(new Date(NOW - seconds * 1000), locale);
  } finally {
    Date.now = realNow;
  }
}

test("relTime stays relative inside 7 days and switches to YYYY-MM-DD at the boundary", () => {
  assert.equal(relFromSeconds(0), "刚刚");
  assert.equal(relFromSeconds(59), "刚刚");
  assert.equal(relFromSeconds(60), "1 分钟前");
  assert.equal(relFromSeconds(3600), "1 小时前");
  assert.equal(relFromSeconds(86400), "1 天前");
  // Just under the cutoff: still relative (6 full days).
  assert.equal(relFromSeconds(7 * 86400 - 1), "6 天前");
  // At exactly 7 days: absolute — the boundary itself is absolute.
  assert.equal(relFromSeconds(7 * 86400), "2026-09-05");
  assert.equal(relFromSeconds(8 * 86400), "2026-09-04");
  assert.equal(relFromSeconds(30 * 86400), "2026-08-13");
});

test("relTime English variants share the same 7-day cutoff", () => {
  assert.equal(relFromSeconds(0, "en"), "just now");
  assert.equal(relFromSeconds(3600, "en"), "1h ago");
  assert.equal(relFromSeconds(86400, "en"), "1d ago");
  assert.equal(relFromSeconds(7 * 86400 - 1, "en"), "6d ago");
  assert.equal(relFromSeconds(7 * 86400, "en"), "2026-09-05");
});

test("relTime clamps future timestamps to just now", () => {
  assert.equal(relFromSeconds(-120), "刚刚");
});

/* The post-draft restore banner feeds a stored savedAt (epoch ms from
   the localStorage draft) through relTime with the clock injected —
   the pure path, no Date.now patching. These pins hold the exact
   wording the banner interpolates into form.draftRestoredAge. */
test("relTime with an injected clock renders the draft-saved age buckets", () => {
  const savedAt = (secondsAgo: number) => NOW - secondsAgo * 1000;
  assert.equal(relTime(new Date(savedAt(60)), "zh", NOW), "1 分钟前");
  assert.equal(relTime(new Date(savedAt(5 * 60)), "en", NOW), "5m ago");
  assert.equal(relTime(new Date(savedAt(3 * 3600)), "zh", NOW), "3 小时前");
  assert.equal(relTime(new Date(savedAt(2 * 86400)), "en", NOW), "2d ago");
  /* A month-old draft shows the absolute date (the banner copy then
     reads "restored the draft saved on 2026-08-13") instead of
     pretending to be fresh. */
  assert.equal(relTime(new Date(savedAt(30 * 86400)), "zh", NOW), "2026-08-13");
  assert.equal(relTime(new Date(savedAt(30 * 86400)), "en", NOW), "2026-08-13");
});

/* ---- stripDuplicateLeadingHeading: render-boundary guard only. An
   opening ATX H1 equal to the page title (whitespace-normalized) is
   removed; nothing else is. Stored bodies are never rewritten. ---- */

test("strips an opening H1 that duplicates the page title", () => {
  assert.equal(
    stripDuplicateLeadingHeading("# 用 Kimi 搭一个 CLI\n\n正文开始。", "用 Kimi 搭一个 CLI"),
    "正文开始。",
  );
  assert.equal(
    stripDuplicateLeadingHeading("# Build a CLI with Kimi\n\nBody text.", "Build a CLI with Kimi"),
    "Body text.",
  );
});

test("tolerates CRLF, leading blank lines and surrounding whitespace", () => {
  assert.equal(
    stripDuplicateLeadingHeading("\r\n\r\n# Title Here\r\n\r\nBody.", "Title Here"),
    "Body.",
  );
  assert.equal(
    stripDuplicateLeadingHeading("#  Spaced   Out  Title \n\nBody.", "Spaced Out Title"),
    "Body.",
  );
});

test("keeps non-matching headings, subheadings and leading blocks", () => {
  // Different text: untouched.
  assert.equal(
    stripDuplicateLeadingHeading("# Other Heading\n\nBody.", "Real Title"),
    "# Other Heading\n\nBody.",
  );
  // H2 is not an H1: untouched.
  assert.equal(
    stripDuplicateLeadingHeading("## Real Title\n\nBody.", "Real Title"),
    "## Real Title\n\nBody.",
  );
  // A quote / code fence opening the body is not a heading: untouched.
  assert.equal(
    stripDuplicateLeadingHeading("> Real Title\n\nBody.", "Real Title"),
    "> Real Title\n\nBody.",
  );
  assert.equal(
    stripDuplicateLeadingHeading("```\n# Real Title\n```\n\nBody.", "Real Title"),
    "```\n# Real Title\n```\n\nBody.",
  );
  // Only the FIRST heading is considered; a matching H1 below other
  // content stays.
  assert.equal(
    stripDuplicateLeadingHeading("Intro paragraph.\n\n# Real Title\n\nBody.", "Real Title"),
    "Intro paragraph.\n\n# Real Title\n\nBody.",
  );
});

test("degenerate inputs are returned unchanged", () => {
  assert.equal(stripDuplicateLeadingHeading("", "Title"), "");
  assert.equal(stripDuplicateLeadingHeading("# Untitled", ""), "# Untitled");
  // A body that is only the duplicated H1 collapses to empty.
  assert.equal(stripDuplicateLeadingHeading("# Solo", "Solo"), "");
});
