/* Display labels for the usage dashboard: source id -> display name.
   Shared by the server-rendered page and the client filter bar, so this module
   must stay client-importable: no next/headers, db, or server-only imports. */

const SOURCE_LABELS: Record<string, string> = {
  "kimi-code": "Kimi Code",
  "claude-code": "Claude Code",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  opencode: "opencode",
  "copilot-cli": "Copilot CLI",
  grok: "Grok CLI",
  "trae-cli": "Trae CLI",
  kiro: "Kiro",
  mcode: "MiniMax Code",
  cursor: "Cursor",
  zcode: "Zcode",
  workbuddy: "WorkBuddy",
  "pi-coding-agent": "Pi Agent",
};

export function usageSourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id;
}
