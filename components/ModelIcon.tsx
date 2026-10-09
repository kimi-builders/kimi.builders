/* Model-family vendor icons: narrow subpath imports from
   @lobehub/icons (never the barrel, against bundle bloat). Color
   variants where they exist; the rest (OpenAI/Grok) use Mono
   (currentColor, following the text color). Unregistered family ids
   return null (callers fall back to a plain text chip). */
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
import StepfunMono from "@lobehub/icons/es/Stepfun/components/Mono";
import XiaomiMiMoMono from "@lobehub/icons/es/XiaomiMiMo/components/Mono";

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
  stepfun: StepfunMono,
  xiaomimimo: XiaomiMiMoMono,
};

export default function ModelIcon({
  id,
  size = 14,
  context = "inline",
}: {
  id: string;
  size?: number;
  context?: "inline" | "chart";
}) {
  const Icon = ICONS[id];
  if (!Icon) return null;
  const glyph = <Icon size={size} aria-hidden="true" focusable="false" />;
  return context === "chart" ? (
    <span aria-hidden="true" className="inline-grid size-4 shrink-0 place-items-center text-paper">
      {glyph}
    </span>
  ) : glyph;
}
