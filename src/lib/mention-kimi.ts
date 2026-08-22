/* @kimi summons: an explicit call to the bot in comments/post bodies. Two
   uses:
   - hasKimiMention: write-action detection over the raw markdown (code
     blocks/inline code stripped first — @kimi inside a code sample never
     triggers);
   - rehypeKimiMention: a Markdown render plugin wrapping @kimi into
     <span class="mention-kimi"> (text inside code/pre ancestors
     skipped).
   Word boundaries: no word char or @ before (a@kimi.com misses), no word
   char or - after (@kimiko / @kimi-builders miss); whitespace between @
   and kimi is allowed (fullwidth @ compatible). */

const MENTION_RE = /(?:^|[^\w@])[@＠]\s*kimi(?![\w-])/i;
/* Render-time global version: captures (prefix + summon) as two groups so
   the split text nodes land in the right places. */
const MENTION_SPLIT_RE = /(^|[^\w@])([@＠]\s*kimi(?![\w-]))/gi;

export function hasKimiMention(md: string): boolean {
  const stripped = md
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  return MENTION_RE.test(stripped);
}

/* Autocomplete: when the text right before the cursor matches
   [@＠][\w-]{0,8} and prefixes "kimi", return the replacement range (start
   = the @) and the typed query; a complete "kimi" stops suggesting. */
export function kimiMentionAt(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const m = /(?:^|[^\w@])[@＠]([\w-]{0,8})$/.exec(before);
  if (!m) return null;
  const query = m[1];
  if (!"kimi".startsWith(query.toLowerCase()) || query.toLowerCase() === "kimi")
    return null;
  return { start: caret - query.length - 1, query };
}

/* ---- rehype plugin (minimal hast types, no unist-util-visit dependency)
   ---- */

interface HastText {
  type: "text";
  value: string;
}
interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

function mentionNodes(value: string): HastNode[] {
  const out: HastNode[] = [];
  let last = 0;
  for (const m of value.matchAll(MENTION_SPLIT_RE)) {
    const at = m.index + m[1].length;
    if (at > last) out.push({ type: "text", value: value.slice(last, at) });
    out.push({
      type: "element",
      tagName: "span",
      properties: { className: ["mention-kimi"] },
      children: [{ type: "text", value: m[2] }],
    });
    last = at + m[2].length;
  }
  if (out.length === 0) return [];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function walk(node: HastNode, inCode: boolean): void {
  if (node.type === "element") {
    const el = node as HastElement;
    const code = inCode || el.tagName === "code" || el.tagName === "pre";
    el.children = el.children.flatMap((child) => {
      if (!code && child.type === "text") {
        const replaced = mentionNodes((child as HastText).value);
        if (replaced.length > 0) return replaced;
      }
      walk(child, code);
      return [child];
    });
    return;
  }
  const children = (node as { children?: HastNode[] }).children ?? [];
  for (const child of children) walk(child, inCode);
}

export function rehypeKimiMention() {
  return (tree: HastNode) => walk(tree, false);
}
