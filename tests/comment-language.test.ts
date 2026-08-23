/* Comment-language ratchet: code comments migrate from Chinese to English
   (docs/comment-style.md). This test scans .ts/.tsx/.css sources for
   comment lines containing CJK and enforces two invariants:
   1. per-area counts never exceed the snapshot in tests/comment-baseline.json
      (conversions may only lower them; regenerate deliberately with
      UPDATE_BASELINE=1 npm test);
   2. every file listed as "locked" in the snapshot contains zero CJK comment
      lines, forever.
   Scope is comments only; product copy (i18n dict values), AGENTS.md and
   local-dev-docs/ are intentionally not covered. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/* Han only: any real Chinese comment contains Han characters, while
   fullwidth punctuation (e.g. the fullwidth @ in regex docs) can appear in
   legitimate English comments. */
const CJK = /[\u4e00-\u9fff]/;
const BASELINE_PATH = new URL("./comment-baseline.json", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/* Scanned trees plus root-level source files. db/ (SQL) and ops/ (shell)
   are out of scope. */
const SCAN_DIRS = ["src", "app", "components", "tests", "scripts"];
const SCAN_FILES = ["proxy.ts"];

interface Snapshot {
  areas: Record<string, number>;
  locked: string[];
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      listSourceFiles(path.join(dir, entry.name), acc);
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

/* CJK lines inside // or block comments, including JSX comment blocks: a
   JSX comment opens with a brace followed by the block-comment opener, and
   its continuation lines may start with anything. Line-based on purpose: a
   real tokenizer is overkill for a ratchet; string literals starting with
   "*" are vanishingly rare and would only inflate a baseline, never unlock
   anything. */
function cjkCommentLines(file: string): number {
  const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
  let count = 0;
  let inBlock = false;
  let inJsx = false;
  for (const raw of lines) {
    const line = raw.trim();
    let text: string | null = null;
    if (inBlock) {
      text = line;
      if (line.includes("*/")) inBlock = false;
    } else if (inJsx) {
      text = line;
      if (line.includes("*/")) inJsx = false;
    } else if (line.startsWith("//")) {
      text = line;
    } else if (line.startsWith("/*")) {
      /* A block that opens and closes on one line must not leave inBlock
         set, or every later line (including code with CJK strings) would
         be miscounted as a comment. */
      text = line.replace("*/", "");
      if (!line.includes("*/")) inBlock = true;
    } else if (line.startsWith("{/*")) {
      text = line.replace("*/", "");
      if (!line.includes("*/")) inJsx = true;
    } else if (line.startsWith("*")) {
      text = line.replace("*/", "");
    }
    if (text && CJK.test(text)) count += 1;
  }
  return count;
}

/* Area key: first path segment, with src and app split one level deeper so
   progress is visible where the work actually happens. */
function areaOf(file: string): string {
  const parts = file.split("/");
  if (parts[0] === "src" || parts[0] === "app") {
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return parts[0];
}

function scan(): { areas: Record<string, number>; perFile: Map<string, number> } {
  const files = [
    ...SCAN_DIRS.flatMap((d) => listSourceFiles(d)),
    ...SCAN_FILES,
  ];
  const areas: Record<string, number> = {};
  const perFile = new Map<string, number>();
  for (const file of files) {
    const n = cjkCommentLines(file);
    perFile.set(file, n);
    if (n > 0) areas[areaOf(file)] = (areas[areaOf(file)] ?? 0) + n;
  }
  return { areas, perFile };
}

const current = scan();

if (process.env.UPDATE_BASELINE === "1") {
  const previous = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Snapshot;
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ areas: current.areas, locked: previous.locked }, null, 2)}\n`,
  );
  console.log("comment-baseline.json regenerated");
}

const snapshot = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Snapshot;

test("comment-language ratchet: CJK comment lines stay within the baseline", () => {
  const failures: string[] = [];
  for (const [area, count] of Object.entries(current.areas)) {
    const allowed = snapshot.areas[area] ?? 0;
    if (count > allowed) {
      failures.push(
        `${area}: ${count} CJK comment lines > baseline ${allowed}. ` +
          "New comments must be English (docs/comment-style.md).",
      );
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("locked files contain zero CJK comment lines", () => {
  const failures: string[] = [];
  for (const file of snapshot.locked) {
    const count = current.perFile.get(file) ?? 0;
    if (count > 0) {
      failures.push(`${file}: ${count} CJK comment lines (locked at zero)`);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});
