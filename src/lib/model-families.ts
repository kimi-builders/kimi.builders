/* 开发模型家族(作品库表单/详情/卡片用):家族级预设,带厂商图标(ModelIcon)。
   家族而非具体型号:图标只到厂商级;型号月月换代,家族稳定不漂移;
   具体型号可走自填文本(原样存储展示)。 */
export const MODEL_FAMILIES = [
  { id: "kimi", name: "Kimi" },
  { id: "claude", name: "Claude" },
  { id: "openai", name: "GPT" },
  { id: "gemini", name: "Gemini" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "qwen", name: "Qwen" },
  { id: "grok", name: "Grok" },
  { id: "minimax", name: "MiniMax" },
  { id: "glm", name: "GLM" },
  { id: "doubao", name: "豆包" },
  { id: "wenxin", name: "文心一言" },
] as const;

export type ModelFamilyId = (typeof MODEL_FAMILIES)[number]["id"];

export function isModelFamily(id: string): id is ModelFamilyId {
  return MODEL_FAMILIES.some((f) => f.id === id);
}

export function modelFamilyName(id: string): string {
  return MODEL_FAMILIES.find((f) => f.id === id)?.name ?? id;
}
