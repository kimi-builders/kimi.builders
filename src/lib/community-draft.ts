export const COMMUNITY_DRAFT_KEY = "kb-community-post-draft-v1";

export interface CommunityDraft {
  version: 1;
  type: "text" | "link" | "poll";
  category: string;
  title: string;
  linkUrl: string;
  body: string;
  options: string[];
  savedAt: number;
}

export function readCommunityDraft(raw: string | null): CommunityDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CommunityDraft>;
    if (value.version !== 1 || !["text", "link", "poll"].includes(value.type ?? "")) return null;
    if (typeof value.category !== "string" || typeof value.savedAt !== "number") return null;
    return {
      version: 1,
      type: value.type as CommunityDraft["type"],
      category: value.category.slice(0, 40),
      title: typeof value.title === "string" ? value.title.slice(0, 200) : "",
      linkUrl: typeof value.linkUrl === "string" ? value.linkUrl.slice(0, 2048) : "",
      body: typeof value.body === "string" ? value.body.slice(0, 20000) : "",
      options: Array.isArray(value.options)
        ? value.options.filter((option): option is string => typeof option === "string").slice(0, 8)
        : ["", ""],
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeCommunityDraft(input: Omit<CommunityDraft, "version" | "savedAt">, now = Date.now()): string {
  return JSON.stringify({ version: 1, ...input, savedAt: now } satisfies CommunityDraft);
}

export const COLLAPSED_REPLY_LIMIT = 3;

export function visibleReplyCount(total: number, expanded: boolean): number {
  const safeTotal = Math.max(0, Math.trunc(total));
  return expanded ? safeTotal : Math.min(COLLAPSED_REPLY_LIMIT, safeTotal);
}
