/* 模型家族厂商图标:窄子路径导入 @lobehub/icons(不走桶文件,防 bundle 膨胀)。
   有 Color 用 Color;没有的(OpenAI/Grok)用 Mono(currentColor,跟随文字色)。
   未收录的家族 id 返回 null(调用方落回纯文本 chip)。 */
import KimiMono from "@lobehub/icons/es/Kimi/components/Mono";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color";
import QwenColor from "@lobehub/icons/es/Qwen/components/Color";
import GrokMono from "@lobehub/icons/es/Grok/components/Mono";
import MinimaxColor from "@lobehub/icons/es/Minimax/components/Color";
import GLMVColor from "@lobehub/icons/es/GLMV/components/Color";
import DoubaoColor from "@lobehub/icons/es/Doubao/components/Color";
import WenxinColor from "@lobehub/icons/es/Wenxin/components/Color";

const ICONS: Record<string, typeof KimiMono> = {
  kimi: KimiMono,
  claude: ClaudeColor,
  openai: OpenAIMono,
  gemini: GeminiColor,
  deepseek: DeepSeekColor,
  qwen: QwenColor,
  grok: GrokMono,
  minimax: MinimaxColor,
  glm: GLMVColor,
  doubao: DoubaoColor,
  wenxin: WenxinColor,
};

export default function ModelIcon({
  id,
  size = 14,
}: {
  id: string;
  size?: number;
}) {
  const Icon = ICONS[id];
  if (!Icon) return null;
  return <Icon size={size} />;
}
