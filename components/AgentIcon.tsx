/* Agent brand icons: narrow subpath imports from @lobehub/icons (never
   the barrel, against bundle bloat). Color variants where they exist;
   otherwise Mono (currentColor, following the text color). The icons
   themselves are "use client"; this wrapper stays RSC with the
   boundary at the icon. */
import KimiMono from "@lobehub/icons/es/Kimi/components/Mono";
import MoonshotMono from "@lobehub/icons/es/Moonshot/components/Mono";
import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color";
import CodexColor from "@lobehub/icons/es/Codex/components/Color";
import CursorMono from "@lobehub/icons/es/Cursor/components/Mono";
import CopilotColor from "@lobehub/icons/es/Copilot/components/Color";
import WindsurfMono from "@lobehub/icons/es/Windsurf/components/Mono";
import TraeColor from "@lobehub/icons/es/Trae/components/Color";
import ClineMono from "@lobehub/icons/es/Cline/components/Mono";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import GeminiCliColor from "@lobehub/icons/es/GeminiCLI/components/Color";
import OpenCodeMono from "@lobehub/icons/es/OpenCode/components/Mono";
import AntigravityColor from "@lobehub/icons/es/Antigravity/components/Color";
import QoderColor from "@lobehub/icons/es/Qoder/components/Color";
import ZaiMono from "@lobehub/icons/es/ZAI/components/Mono";
import CodeBuddyColor from "@lobehub/icons/es/CodeBuddy/components/Color";
import PiMono from "@lobehub/icons/es/Pi/components/Mono";

const ICONS = {
  kimi: KimiMono,
  /* Kimi family: Kimi Agent uses the Kimi K mark, Agent Swarm (Kimi
     Code's multi-agent capability) uses the Moonshot moon mark — no
     more lucide placeholders (grey and fake next to brand marks). */
  "kimi-agent": KimiMono,
  "agent-swarm": MoonshotMono,
  // Usage source ids map directly.
  "kimi-code": KimiMono,
  "claude-code": ClaudeCodeColor,
  codex: CodexColor,
  "gemini-cli": GeminiCliColor,
  opencode: OpenCodeMono,
  antigravity: AntigravityColor,
  // Works-library agent ids.
  cursor: CursorMono,
  copilot: CopilotColor,
  windsurf: WindsurfMono,
  trae: TraeColor,
  cline: ClineMono,
  gemini: GeminiColor,
  qoder: QoderColor,
  /* Zhipu Z.ai / Tencent / Pi: ZAI and Pi are Mono-only (currentColor
     follows the theme); WorkBuddy has no dedicated mark yet and
     reuses the sibling CodeBuddy brand mark. */
  zcode: ZaiMono,
  workbuddy: CodeBuddyColor,
  "pi-agent": PiMono,
  "pi-coding-agent": PiMono,
} as const;

export default function AgentIcon({
  id,
  size,
  context = "inline",
  className = "",
}: {
  id: string;
  size?: number;
  context?: "inline" | "chart" | "badge";
  className?: string;
}) {
  const Icon = ICONS[id as keyof typeof ICONS];
  if (!Icon) return null;
  const opticalSize = size ?? (context === "inline" ? 14 : 12);
  const glyph = <Icon size={opticalSize} />;
  if (context === "inline") return glyph;

  const kimiFamily = id === "kimi" || id === "kimi-agent" || id === "kimi-code";
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center align-middle ${
        context === "badge" ? "size-5" : "size-4"
      } ${
        kimiFamily
          ? "rounded-[4px] border border-viz-neutral-mid/55 bg-viz-neutral-strong text-white"
          : context === "badge"
            ? "rounded-[4px] border border-line bg-paper/[0.04] text-paper"
            : "text-paper"
      } ${className}`}
    >
      {glyph}
    </span>
  );
}
