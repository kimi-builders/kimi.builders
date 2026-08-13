/* Agent 品牌图标:窄子路径导入 @lobehub/icons(不走桶文件,防 bundle 膨胀)。
   有 Color 用 Color;没有的用 Mono(currentColor,跟随文字色)。
   图标本身是 "use client",这个 wrapper 保持 RSC,边界停在图标处。 */
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
  /* Kimi 家族:Kimi Agent 用 Kimi K 标,Agent Swarm(Kimi Code 多智能体能力)
     用 Moonshot 月标,不再用 lucide 通用占位(与品牌标同框显灰显假) */
  "kimi-agent": KimiMono,
  "agent-swarm": MoonshotMono,
  // 用量来源 id(usage source id)直接映射
  "kimi-code": KimiMono,
  "claude-code": ClaudeCodeColor,
  codex: CodexColor,
  "gemini-cli": GeminiCliColor,
  opencode: OpenCodeMono,
  antigravity: AntigravityColor,
  // 作品库 Agent id
  cursor: CursorMono,
  copilot: CopilotColor,
  windsurf: WindsurfMono,
  trae: TraeColor,
  cline: ClineMono,
  gemini: GeminiColor,
  qoder: QoderColor,
  /* 智谱 Z.ai / 腾讯 / Pi:ZAI 与 Pi 只有 Mono(currentColor 跟随主题) */
  zcode: ZaiMono,
  codebuddy: CodeBuddyColor,
  "pi-agent": PiMono,
  "pi-coding-agent": PiMono,
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
