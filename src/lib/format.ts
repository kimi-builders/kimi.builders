/* Display formatting helpers. */

/* Relative time: "just now" under a minute, then minutes/hours/days,
   YYYY-MM-DD from 7 days on. The 7-day cutoff keeps one list from
   mixing "27 days ago" with absolute dates; every surface reusing
   relTime (community lists, details, comments, notifications) shares
   the rule. */
export function relTime(
  d: Date | string,
  locale: "zh" | "en" = "zh",
): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 60) return locale === "en" ? "just now" : "刚刚";
  if (s < 3600) {
    const n = Math.floor(s / 60);
    return locale === "en" ? `${n}m ago` : `${n} 分钟前`;
  }
  if (s < 86400) {
    const n = Math.floor(s / 3600);
    return locale === "en" ? `${n}h ago` : `${n} 小时前`;
  }
  if (s < 7 * 86400) {
    const n = Math.floor(s / 86400);
    return locale === "en" ? `${n}d ago` : `${n} 天前`;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/* Render-boundary guard for curated bodies: a guide whose markdown
   opens with an ATX H1 identical to the page title would show the
   heading twice (page H1 + body H1). Strip only that first H1 —
   matched after whitespace normalization; anything else (H2, quotes,
   code blocks, non-matching titles) stays untouched. Storage, editor,
   and exports keep the original body. */
export function stripDuplicateLeadingHeading(
  body: string,
  title: string,
): string {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const target = normalize(title);
  if (!target) return body;
  /* Leading blank lines, then the heading at 0-3 spaces of indent
     (CommonMark); exactly one # (two+ is a subheading, kept). */
  const match = /^(?:[ \t]*\r?\n)* {0,3}# (.*)/.exec(body);
  if (!match) return body;
  /* CommonMark drops an optional closing sequence ("# Title ##"); the
     rendered text is compared, so strip it the same way. */
  const text = match[1].replace(/[ \t]+#+$/, "");
  if (normalize(text) !== target) return body;
  return body.slice(match[0].length).replace(/^(?:\r?\n)+/, "");
}

/* Markdown -> plain-text excerpt (feed cards): strips code blocks/
   images/link syntax/markers, collapses whitespace. */
export function plainExcerpt(md: string, max = 120): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/* Compact large numbers (home stats bar): zh units of 10k/100M, en
   K/M/B. */
export function compactNumber(n: number, locale: "zh" | "en" = "zh"): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/* Issue-flavored month label (monthly list/detail headers): uniformly
   YYYY-MM, legible in both languages under mono typesetting. */
export function monthLabel(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
