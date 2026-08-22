/* Display formatting helpers. */

/* Relative time: "just now" under a minute, then minutes/hours/days,
   YYYY-MM-DD beyond 30 days. */
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
  if (s < 30 * 86400) {
    const n = Math.floor(s / 86400);
    return locale === "en" ? `${n}d ago` : `${n} 天前`;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
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
