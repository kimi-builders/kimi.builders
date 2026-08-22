/* Development model families (work form/detail/card): family-level
   presets with vendor icons (ModelIcon). Families, not concrete models:
   icons only go to vendor level; models churn monthly while families
   stay stable; a concrete model can be typed free-form (stored and
   shown as-is). */
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
  { id: "doubao", name: "豆包", nameEn: "Doubao" },
  { id: "wenxin", name: "文心一言", nameEn: "ERNIE Bot" },
] as const;

export type ModelFamilyId = (typeof MODEL_FAMILIES)[number]["id"];

export function isModelFamily(id: string): id is ModelFamilyId {
  return MODEL_FAMILIES.some((f) => f.id === id);
}

/* Family display names: Chinese families use the English vendor name on
   the EN interface; other families share one form across languages. */
export function modelFamilyName(id: string, locale?: "zh" | "en"): string {
  const family = MODEL_FAMILIES.find((f) => f.id === id);
  if (!family) return id;
  if (locale === "en") return ("nameEn" in family ? family.nameEn : family.name) as string;
  return family.name;
}
