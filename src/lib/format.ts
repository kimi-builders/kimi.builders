/* 展示格式化小工具。 */

/* 相对时间:1 分钟内「刚刚」,然后分钟/小时/天,超过 30 天落 YYYY-MM-DD。 */
export function relTime(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} 天前`;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
