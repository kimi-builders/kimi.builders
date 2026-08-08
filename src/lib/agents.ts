/* 参与构建的 Agent 品牌注册表 —— 纯数据,客户端/服务端共享。
   id 落库进 works.agents(JSON 数组);图标映射在 components/AgentIcon.tsx。
   收录口径(decision):不要求 100% 由 Kimi 构建 —— Kimi 参与了、
   为 Kimi 生态做的应用、以 Kimi 为基座的项目都算;参与的 Agent 标出来。 */
export const AGENTS = [
  { id: "kimi", name: "Kimi" },
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "cursor", name: "Cursor" },
  { id: "copilot", name: "GitHub Copilot" },
  { id: "windsurf", name: "Windsurf" },
  { id: "trae", name: "Trae" },
  { id: "cline", name: "Cline" },
  { id: "gemini", name: "Gemini" },
  { id: "qwen", name: "Qwen" },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];

const IDS = new Set<string>(AGENTS.map((a) => a.id));

/* 只保留注册表里的 id,去重,最多 10 个。 */
export function sanitizeAgentIds(raw: unknown[]): AgentId[] {
  const out: AgentId[] = [];
  for (const v of raw) {
    const s = String(v);
    if (IDS.has(s) && !out.includes(s as AgentId)) out.push(s as AgentId);
    if (out.length >= 10) break;
  }
  return out;
}

export function agentName(id: string): string {
  return AGENTS.find((a) => a.id === id)?.name ?? id;
}
