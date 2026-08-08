/* 展示格式化小工具。 */

/* 相对时间:1 分钟内「刚刚」,然后分钟/小时/天,超过 30 天落 YYYY-MM-DD。 */
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

/* Markdown → 纯文本摘要(feed 卡片用):去代码块/图片/链接语法/标记符,收空白。 */
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
