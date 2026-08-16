/* @kimi 召唤(20260816):评论/正文里显式召唤 Kimi 小筑。
   两处用法:
   - hasKimiMention:写操作 action 侧检测原始 md(先剥离代码块/行内代码,
     代码示例里的 @kimi 不触发);
   - rehypeKimiMention:Markdown 渲染插件,把正文里的 @kimi 包成
     <span class="mention-kimi"> 高亮(code/pre 祖先内的文本跳过)。
   词边界:前导不能是单词字符或 @(a@kimi.com 不命中),后续不能是单词字符
   或 -(@kimiko / @kimi-builders 不命中);@ 与 kimi 之间允许空白(全角 @ 兼容)。 */

const MENTION_RE = /(?:^|[^\w@])[@＠]\s*kimi(?![\w-])/i;
/* 渲染用全局版:捕获 前导 + 召唤词 两段,拆分文本节点时各归各位 */
const MENTION_SPLIT_RE = /(^|[^\w@])([@＠]\s*kimi(?![\w-]))/gi;

export function hasKimiMention(md: string): boolean {
  const stripped = md
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  return MENTION_RE.test(stripped);
}

/* 自动补全(20260816):光标前紧跟 [@＠][\w-]{0,8} 且是 kimi 的前缀时,
   返回待替换区间(start = @ 位置)与已输入 query;query="kimi" 完整输入后不再提示。 */
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

/* ---- rehype 插件(最小 hast 类型,不引 unist-util-visit 依赖)---- */

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
