/* 用量看板展示标签:source id → 展示名。
   页面(服务端)与筛选栏(客户端)共用,必须保持客户端可引 —— 不得引入
   next/headers、db 或任何服务端专属模块。 */

const SOURCE_LABELS: Record<string, string> = {
  "kimi-code": "Kimi Code",
  "claude-code": "Claude Code",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  opencode: "opencode",
  "copilot-cli": "Copilot CLI",
  grok: "Grok",
  cursor: "Cursor",
  zcode: "Zcode",
  workbuddy: "WorkBuddy",
  "pi-coding-agent": "Pi Agent",
};

export function usageSourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id;
}
