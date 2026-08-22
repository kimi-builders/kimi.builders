/* Category definitions — pure data shared by client and server; no
   server-side imports. */
import type { Locale } from "./i18n";

export const CATEGORIES = [
  { id: "chat", zh: "闲聊", en: "Chat" },
  { id: "showcase", zh: "晒作品", en: "Showcase" },
  { id: "help", zh: "求助", en: "Help" },
  { id: "feedback", zh: "反馈", en: "Feedback" },
  /* "announcement" is retired: no announcement content exists yet and
     empty categories don't ship. Restore by re-adding an entry here
     (filter/post form/validation all read CATEGORIES and pick it up); the
     zh/en copy lives in git history. Existing announcement posts keep
     their dot (PostCard CATEGORY_DOT) and label fallbacks. */
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function categoryLabel(locale: Locale, id: string): string {
  const c = CATEGORIES.find((c) => c.id === id);
  return c ? c[locale] : id;
}
