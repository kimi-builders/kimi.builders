/* Registry of Agent brands involved in building — pure data, shared by
   client and server. ids land in works.agents (JSON array); icon mapping
   in components/AgentIcon.tsx. Inclusion bar (decision): not required to
   be 100% Kimi-built — built with Kimi's participation, built for the
   Kimi ecosystem, or based on Kimi all count; participating Agents get
   marked. */
export const AGENTS = [
  /* `kimi` exists in stored data; the id stays for compatibility while
     the display name tracks the current official product. */
  { id: "kimi", name: "Kimi Code" },
  { id: "kimi-agent", name: "Kimi Agent" },
  { id: "agent-swarm", name: "Agent Swarm" },
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "cursor", name: "Cursor" },
  { id: "copilot", name: "GitHub Copilot" },
  { id: "windsurf", name: "Windsurf" },
  { id: "trae", name: "Trae" },
  { id: "cline", name: "Cline" },
  { id: "gemini", name: "Gemini" },
  /* Qoder = Alibaba's agentic IDE (brand in AgentIcon); Qwen is a model
     family, not an Agent slot. */
  { id: "qoder", name: "Qoder" },
  /* Zhipu's international (Z.ai) coding agent; icon key "zai". */
  { id: "zcode", name: "Zcode" },
  /* Tencent WorkBuddy (renamed from CodeBuddy; the collector reports the
     same id). */
  { id: "workbuddy", name: "WorkBuddy" },
  /* Pi Agent. */
  { id: "pi-agent", name: "Pi Agent" },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];

const IDS = new Set<string>(AGENTS.map((a) => a.id));

/* Keep only registry ids, deduped; capped by the works agent registry. */
export function sanitizeAgentIds(raw: unknown[]): AgentId[] {
  const out: AgentId[] = [];
  for (const v of raw) {
    const s = String(v);
    if (IDS.has(s) && !out.includes(s as AgentId)) out.push(s as AgentId);
    if (out.length >= AGENTS.length) break;
  }
  return out;
}

export function agentName(id: string): string {
  return AGENTS.find((a) => a.id === id)?.name ?? id;
}
