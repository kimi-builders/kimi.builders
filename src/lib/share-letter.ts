/* Monthly-letter section posters (/api/share/letter/[slug]?section=...):
   each issue's two data sections (02 fact sheet / 03 editorial decisions)
   get their own 1080x1440 PNG (01 editorial review is long-form, never a
   poster). Aligned with ./share-posters: pure functions (param
   normalization / clipping / snapshot assembly / fixture mapping) are
   separated from DB queries; routes only fetch a snapshot and render;
   pure functions unit-test directly (tests/letter-share.test.ts). Data
   source = getAssembledIssue from src/lib/monthly (assembled, never
   hand-written); posters are uniformly Chinese (facts labels use the zh
   buildFacts, same call as the post poster's categoryLabel("zh")). Dev
   preview (?preview=1) maps the first fixture from
   tests/fixtures/monthly-mock into the same render contract — the
   fixture's shape differs from production AssembledIssue, and that
   mapping lives only here. The "letter to the official" layer was
   retired with the product pivot; its section poster went with it. */
import { normalizeArticleSlug } from "./articles";
import {
  getAssembledIssue,
  type AiDisclosure,
  type AssembledIssue,
  type IssueDecisionKind,
  type IssueFact,
} from "./monthly";
import { getCachedMonthlyStatsSnapshot } from "./monthly-stats-cache";
import { POSTER_SITE_ORIGIN, clip, posterInitials } from "./share-posters";

/* ---- Section param ---- */

export type LetterSection = "facts" | "decisions";

export const LETTER_SECTIONS: readonly LetterSection[] = ["facts", "decisions"];

/* ?section= normalization: default facts, invalid values fall back to
   facts (the poster route never 404s on a param). */
export function normalizeLetterSection(raw: string | null): LetterSection {
  const s = (raw ?? "").trim().toLowerCase();
  return (LETTER_SECTIONS as readonly string[]).includes(s) ? (s as LetterSection) : "facts";
}

/* aiDisclosure section keys match anchors (facts/decisions); the
   function stays as the mapping point. */
export function disclosureKeyOf(section: LetterSection): keyof AiDisclosure {
  return section;
}

/* ---- Render contract ---- */

/* Decision-card cap: the poster is always a full 1440 — at most 3 cards,
   the rest goes into an "N more" row. */
export const LETTER_POSTER_DECISIONS_MAX = 3;

export interface LetterDecisionCard {
  kind: IssueDecisionKind; // chip coloring
  kindLabel: string; // production: featured build/discussion, governance
                      // ruling; fixture: best/underrated, ruling
  title: string;
  authorHandle: string; // empty = governance ruling (no single author)
  note: string; // the editor's one-line reason (clipped)
  editorHandle: string; // empty = the "— picked by @editor" row never
                         // renders
}

export interface LetterShareSnapshot {
  slug: string;
  issue: number;
  month: string; // YYYY-MM
  title: string; // issue title (identity row name, clipped)
  editorHandle: string;
  initials: string;
  section: LetterSection;
  facts: IssueFact[]; // first = hero, the rest a two-column grid;
                      // missing values already "—"
  decisions: LetterDecisionCard[]; // ≤ LETTER_POSTER_DECISIONS_MAX
  decisionsMore: number; // decisions beyond the cap (0 = all shown)
  aiNote: string | null; // this section's AI disclosure (clipped; null =
                         // none, not rendered)
  url: string; // absolute origin + section anchor (shared by QR and
                // footer)
}

/* Production kinds -> chip labels (same as the blog detail page's
   decisionChip). */
export function decisionKindLabel(kind: IssueDecisionKind): string {
  return kind === "work" ? "精选构建" : kind === "post" ? "精选讨论" : "治理公示";
}

function sectionUrl(slug: string, section: LetterSection): string {
  return `${POSTER_SITE_ORIGIN}/explore/${slug}#${section}`;
}

function aiNoteOf(issue: AssembledIssue, section: LetterSection): string | null {
  const note = issue.aiDisclosure?.[disclosureKeyOf(section)];
  return note ? clip(note, 40) : null;
}

/* Full issue -> section snapshot (pure): title/reason clipping,
   decisions capped, URL carrying the section anchor. */
export function buildLetterShareSnapshot(
  issue: AssembledIssue,
  section: LetterSection,
): LetterShareSnapshot {
  return {
    slug: issue.slug,
    issue: issue.issue,
    month: issue.month,
    title: clip(issue.title, 30),
    editorHandle: issue.editorHandle,
    initials: posterInitials("", issue.editorHandle),
    section,
    /* Value clipping: long values like the top model (a raw model id)
       overflow the fixed canvas; the full value lives on site, the
       poster keeps the head. */
    facts: issue.facts.map((f) => ({ label: f.label, value: clip(f.value, 16) })),
    decisions: issue.decisions
      .slice(0, LETTER_POSTER_DECISIONS_MAX)
      .map((d) => ({
        kind: d.kind,
        kindLabel: decisionKindLabel(d.kind),
        title: clip(d.title, 30),
        authorHandle: d.authorHandle,
        note: clip(d.note, 96),
        editorHandle: d.editorHandle,
      })),
    decisionsMore: Math.max(0, issue.decisions.length - LETTER_POSTER_DECISIONS_MAX),
    aiNote: aiNoteOf(issue, section),
    url: sectionUrl(issue.slug, section),
  };
}

/* No such published issue (getAssembledIssue null) -> null; the route
   404s (pure, testable). */
export function letterSnapshotFromResult(
  result: { issue: AssembledIssue } | null,
  section: LetterSection,
): LetterShareSnapshot | null {
  return result ? buildLetterShareSnapshot(result.issue, section) : null;
}

export async function getLetterShareSnapshot(
  slug: string,
  section: LetterSection,
): Promise<LetterShareSnapshot | null> {
  const s = normalizeArticleSlug(slug);
  if (!s) return null;
  /* The stats snapshot goes through the cache: the poster route and the
     detail page share one snapshot. */
  return letterSnapshotFromResult(
    await getAssembledIssue(s, "zh", { stats: await getCachedMonthlyStatsSnapshot() }),
    section,
  );
}

/* ---- Dev preview: the first fixture -> same render contract. The
   fixture is a hand-written issue (its type is the spec); its kind
   vocabulary differs from production: best/underrated are editorial
   tones, production post/work are source types; chip labels stay as-is
   and colors map onto production kinds. */

export interface MockLetterIssue {
  slug: string;
  issue: number;
  month: string;
  title: { zh: string };
  editorHandle: string;
  facts: { label: { zh: string }; value: string }[];
  decisions: {
    kind: "best" | "underrated" | "governance";
    title: { zh: string };
    authorHandle: string;
    note: { zh: string };
  }[];
}

const MOCK_DECISION_KIND: Record<"best" | "underrated" | "governance", IssueDecisionKind> = {
  best: "work",
  underrated: "post",
  governance: "governance",
};

const MOCK_DECISION_LABEL: Record<"best" | "underrated" | "governance", string> = {
  best: "本月最佳",
  underrated: "被低估",
  governance: "治理公示",
};

export function letterSnapshotFromMock(
  issue: MockLetterIssue,
  section: LetterSection,
): LetterShareSnapshot {
  return {
    slug: issue.slug,
    issue: issue.issue,
    month: issue.month,
    title: clip(issue.title.zh, 30),
    editorHandle: issue.editorHandle,
    initials: posterInitials("", issue.editorHandle),
    section,
    facts: issue.facts.map((f) => ({ label: f.label.zh, value: clip(f.value, 16) })),
    decisions: issue.decisions
      .slice(0, LETTER_POSTER_DECISIONS_MAX)
      .map((d) => ({
        kind: MOCK_DECISION_KIND[d.kind],
        kindLabel: MOCK_DECISION_LABEL[d.kind],
        title: clip(d.title.zh, 30),
        authorHandle: d.authorHandle,
        note: clip(d.note.zh, 96),
        /* The fixture has no per-decision editor; attribution goes to
           the editor-in-chief (keeping the decisions-attributed-to-a-person
           discipline); governance entries are rulings, not picks — no
           attribution row, same as production. */
        editorHandle: d.kind === "governance" ? "" : issue.editorHandle,
      })),
    decisionsMore: Math.max(0, issue.decisions.length - LETTER_POSTER_DECISIONS_MAX),
    aiNote: null,
    url: sectionUrl(issue.slug, section),
  };
}

/* Poster dynamic text (for CJK bold-subset fetching; static labels are
   assembled route-side as LETTER_POSTER_STATIC_TEXT). Facts values must
   be included too: the zh compact format can produce CJK magnitude words (wan/yi). */
export function letterShareText(s: LetterShareSnapshot): string {
  return [
    s.title,
    s.initials,
    ...s.facts.flatMap((f) => [f.label, f.value]),
    ...s.decisions.flatMap((d) => [d.kindLabel, d.title, d.authorHandle, d.note]),
    s.aiNote ?? "",
  ].join(" ");
}

/* Every static Chinese label on this poster (a missing glyph falls back
   to a dynamic weight; Latin/digits go through JetBrains Mono and are
   not listed). Fullwidth punctuation (,。:—) must be in the subset too,
   or punctuation in static sentences falls back. */
export const LETTER_POSTER_STATIC_TEXT =
  "事实盘点编辑定夺精选构建讨论治理公示本月最佳被低估" +
  "扫码看本期留空也是记录栏还有条定夺站内查看全部参与披露到人没新的,。:—";
