/* Tutorial channel · series registry. Series are curated objects (few
   and heavy), stored in code rather than the DB — attribution,
   verification stamps, re-verification traces, and the discussion post
   live at the series level; episodes (tutorials) = articles rows
   (kind='guide') attached via payload.series, assembled in
   src/lib/tutorials.ts. Verification stamps: editorHandle x
   verifiedModel x verifiedAt; stale is never hand-set — isPathStale
   computes it (over-age or a model-generation change -> due for
   re-verification) — a stamp must never expire into a lie by itself;
   reverifyLog keeps a trace of every re-verification. Discussion loop:
   discussionPostId links the community post (backfilled after ops
   creates it). */
import type { ChapterId } from "./kb-chapters";

export interface L10n {
  zh: string;
  en: string;
}

/* The model generation the site currently vouches for (the stamp's
   comparison baseline). When the model generation changes, update this:
   at that instant every series whose verifiedModel differs flips to
   "due for re-verification". */
export const CURRENT_KIMI_MODEL = "kimi-latest";

/* Stamp shelf life: no re-verification within this many days of
   verifiedAt -> automatically "due". */
export const STALE_AFTER_DAYS = 45;

/* Computed staleness (pure): a stamp must never expire into a lie by
   itself. verifiedModel != the current generation -> due; verifiedAt
   (YYYY-MM[-DD]) older than STALE_AFTER_DAYS -> due; unparseable
   verifiedAt -> due (an unreadable stamp vouches for nothing). */
export function isPathStale(
  series: { verifiedModel: string; verifiedAt: string },
  currentModel: string = CURRENT_KIMI_MODEL,
  now: Date = new Date(),
): boolean {
  if (series.verifiedModel !== currentModel) return true;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(series.verifiedAt.trim());
  if (!m) return true;
  const month = Number(m[2]);
  const day = Number(m[3] ?? 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) return true;
  const verified = Date.UTC(Number(m[1]), month - 1, day);
  return now.getTime() - verified > STALE_AFTER_DAYS * 86_400_000;
}

/* Re-verification log: a trace per re-verification — date x model x
   editor note, newest first. The latest re-verification also updates
   verifiedAt/verifiedModel; the log is the trail before it. */
export interface ReverifyEntry {
  at: string;
  model: string;
  note: L10n;
}

/* Tutorial series: the channel's curated unit. */
export interface LearnSeries {
  slug: string;
  /* Mono short code (catalog card corner tag), e.g. "SER-01". */
  code: string;
  title: L10n;
  /* Owning chapter (kb-chapters registry; chapters are the primary
     browsing axis — every path hangs on one). */
  chapter?: ChapterId;
  /* Hero quote. */
  tagline: L10n;
  summary: L10n;
  /* Cover (optional): on-site path or https image; default = the
     automatic text cover (code + title). */
  cover?: string;
  editorHandle: string;
  verifiedModel: string;
  verifiedAt: string;
  reverifyLog: ReverifyEntry[];
  /* Discussion loop: links a community post (backfilled after ops
     creates it; default = the detail page renders no discussion
     section). */
  discussionPostId?: number;
}

/* Registered series (a curated registry, few and heavy). 0-episode
   series stay unlisted — register here when real content lands. A
   series slug is the join key for guide payloads (payload.series) and
   works.source_path graduation; registering a slug activates the
   series page, shelf cards, and the verification stamp together. */
export const LEARN_SERIES: LearnSeries[] = [
  {
    slug: "kimi-best-practice",
    code: "PATH-01",
    title: { zh: "Kimi 最佳实践", en: "Kimi Best Practices" },
    chapter: "build",
    tagline: {
      zh: "从起项目到周报，亲自跑通的工作流。",
      en: "Hand-run workflows, from project setup to the weekly report.",
    },
    summary: {
      zh: "用 Kimi Code 从零起一个项目、用 Kimi Design 出一版能用的视觉稿、表格 × PPT 打通周报最后一公里——每篇附方法、证据与出处。",
      en: "Start a project from zero with Kimi Code, get a usable visual draft out of Kimi Design, and close the weekly-report loop with sheets × slides — each with its method, evidence, and sources.",
    },
    editorHandle: "aklmans",
    verifiedModel: "kimi-latest",
    verifiedAt: "2026-08",
    reverifyLog: [],
  },
  {
    slug: "swarm-field-notes",
    code: "PATH-02",
    title: { zh: "Swarm 实战笔记", en: "Swarm Field Notes" },
    chapter: "build",
    tagline: {
      zh: "把一组 agent 排上岗，再把夜班也交出去。",
      en: "Put a swarm on the job, then hand it the night shift.",
    },
    summary: {
      zh: "两条 Swarm 落地实践：编排一次竞品调研、用定时任务让 Swarm 值夜班——分工、验证与交付全程留痕。",
      en: "Two field-tested Swarm practices: orchestrating a competitive scan, and putting Swarm on the night shift with scheduled patrols — division of labor, verification, and delivery all on the record.",
    },
    editorHandle: "aklmans",
    verifiedModel: "kimi-latest",
    verifiedAt: "2026-08",
    reverifyLog: [],
  },
];

export function findLearnSeries(slug: string): LearnSeries | undefined {
  return LEARN_SERIES.find((s) => s.slug === slug);
}

/* Graduation attribution validation (works.source_path): only
   registered series slugs pass; everything else becomes null. */
export function normalizePathSlug(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > 64) return null;
  return findLearnSeries(s) ? s : null;
}
