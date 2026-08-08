/* Agent 品牌图标:窄子路径导入 @lobehub/icons(不走桶文件,防 bundle 膨胀)。
   有 Color 用 Color;没有的用 Mono(currentColor,跟随文字色)。
   图标本身是 "use client",这个 wrapper 保持 RSC,边界停在图标处。 */
import KimiColor from "@lobehub/icons/es/Kimi/components/Color";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import CodexColor from "@lobehub/icons/es/Codex/components/Color";
import CursorMono from "@lobehub/icons/es/Cursor/components/Mono";
import CopilotColor from "@lobehub/icons/es/Copilot/components/Color";
import WindsurfMono from "@lobehub/icons/es/Windsurf/components/Mono";
import TraeColor from "@lobehub/icons/es/Trae/components/Color";
import ClineMono from "@lobehub/icons/es/Cline/components/Mono";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import QwenColor from "@lobehub/icons/es/Qwen/components/Color";

const ICONS = {
  kimi: KimiColor,
  "claude-code": ClaudeColor,
  codex: CodexColor,
  cursor: CursorMono,
  copilot: CopilotColor,
  windsurf: WindsurfMono,
  trae: TraeColor,
  cline: ClineMono,
  gemini: GeminiColor,
  qwen: QwenColor,
} as const;

export default function AgentIcon({
  id,
  size = 14,
}: {
  id: string;
  size?: number;
}) {
  const Icon = ICONS[id as keyof typeof ICONS];
  if (!Icon) return null;
  return <Icon size={size} />;
}
