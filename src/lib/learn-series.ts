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

/* Registered series (a curated registry, few and heavy; first batch in
   preparation). Note: the catalog renders only series with published
   episodes — registered but empty = not shelved, no empty shells. */
export const LEARN_SERIES: LearnSeries[] = [
  /* Temporary walkthrough data (for a visual pass, paired with the
     lens-* seed rows in kb_dev; delete this block and those rows once
     the styling is reviewed). */
  {
    slug: "kimi-best-practice",
    code: "SER-01",
    chapter: "build",
    title: { zh: "Kimi 最佳实战", en: "Kimi Best Practices" },
    tagline: {
      zh: "每一集都以「跟着做完」收口:产物可验证,路径可复走。",
      en: "Every episode ends in a followable action: verifiable output, repeatable path.",
    },
    summary: {
      zh: "从起项目到深度研究,Kimi 全家桶各产品各职业的最小可用工作流。编辑逐集验证,换代即重走。",
      en: "Minimal workable workflows across the Kimi suite, per product and per role. Editor-verified, re-walked on every model generation.",
    },
    editorHandle: "aklmans",
    verifiedModel: "kimi-latest",
    verifiedAt: "2026-08-20",
    reverifyLog: [
      { at: "2026-07-30", model: "kimi-latest", note: { zh: "代际升级后全系列重走。", en: "Re-walked after the model generation bump." } },
    ],
  },
  {
    slug: "swarm-field-notes",
    code: "SER-02",
    chapter: "gain",
    title: { zh: "Kimi Swarm 实战笔记", en: "Kimi Swarm Field Notes" },
    tagline: {
      zh: "多 Agent 不是演示,是排班。",
      en: "Multi-agent is not a demo — it's a rota.",
    },
    summary: {
      zh: "用 Swarm 编排真实任务的野地笔记:调研、巡检、交接。附编排提示词与失败记录。",
      en: "Field notes on orchestrating real work with Swarm: research, patrols, handoffs. With prompts and failure logs.",
    },
    editorHandle: "aklmans",
    verifiedModel: "kimi-prev-gen",
    verifiedAt: "2026-05-12",
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
