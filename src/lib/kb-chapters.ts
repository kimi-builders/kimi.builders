/* Chapter registry: an internal curation dimension of /explore. The
   section collects reproducible, verifiable builder practices — methods
   the sharer personally ran, shown with method, evidence, and sources;
   it does not claim a universal optimal solution. The four chapters are
   four perspectives onto those practices and user-life entry points —
   learn (information -> cognition), build (cognition -> artifact),
   measure (artifact -> value), establish (value -> position and self).
   Chapters live in a code registry (a permanent frame, capped at 3-5);
   series hang on chapters; monthly letters never do — chapters are the
   language of "paths", periodicals are orthogonal. Rendering counts
   published content; zero-count chapters grey out in the segmented
   control (always visible). */
import type { L10n } from "./learn-series";

export type ChapterId = "learn" | "build" | "gain" | "become";

export interface KbChapter {
  id: ChapterId;
  zh: string;
  en: string;
  /* Defining sentence (the chapter header's one-liner). */
  tagline: L10n;
}

export const KB_CHAPTERS: KbChapter[] = [
  {
    id: "learn",
    zh: "学",
    en: "LEARN",
    tagline: { zh: "把智能变成你的认知", en: "Turn intelligence into your own judgment" },
  },
  {
    id: "build",
    zh: "做",
    en: "BUILD",
    tagline: { zh: "把认知变成做出来的东西", en: "Turn judgment into things you made" },
  },
  {
    id: "gain",
    zh: "得",
    en: "GAIN",
    tagline: { zh: "把东西变成收入与成绩", en: "Turn what you made into income and results" },
  },
  {
    id: "become",
    zh: "立",
    en: "BECOME",
    tagline: { zh: "把成绩变成位置与自我", en: "Turn results into standing and self" },
  },
];

export function findKbChapter(id: string): KbChapter | undefined {
  return KB_CHAPTERS.find((c) => c.id === id);
}

export function isKbChapterId(id: string): id is ChapterId {
  return KB_CHAPTERS.some((c) => c.id === id);
}

export function kbChapterLabel(id: string, zh: boolean): string | null {
  const c = findKbChapter(id);
  return c ? (zh ? c.zh : c.en) : null;
}
