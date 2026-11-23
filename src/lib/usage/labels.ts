/* Display labels for the usage dashboard: source id -> display name.
   Shared by the server-rendered page and the client filter bar, so this module
   must stay client-importable: no next/headers, db, or server-only imports. */

import type { UsageSourceId } from "../usage-contract";

// Current CLI parsers only. Protocol v2 also accepts historical source IDs.
export const LOCAL_USAGE_AGENTS = {
  "kimi-code": "Kimi Code",
  "claude-code": "Claude Code",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  "copilot-cli": "Copilot CLI",
  "roo-code": "Roo Code",
  "pi-coding-agent": "Pi",
  zcode: "ZCode",
  workbuddy: "WorkBuddy",
  grok: "Grok CLI",
  "trae-cli": "Trae CLI",
  mcode: "MiniMax Code",
  qoder: "Qoder",
  "qoder-cn": "Qoder CN",
  dsh: "DeepSeek Harness",
  stepcode: "StepCode",
  cursor: "Cursor",
} satisfies Partial<Record<UsageSourceId, string>>;

const SOURCE_LABELS: Record<string, string> = { ...LOCAL_USAGE_AGENTS, kiro: "Kiro" };

export function usageSourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id;
}
