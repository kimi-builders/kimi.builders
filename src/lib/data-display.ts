import { compactNumber } from "@/src/lib/format";
import type { Locale } from "@/src/lib/i18n";

export function formatApproxUsdMicros(
  micros: number,
  options: { compactLarge?: boolean } = {},
): string {
  const value = Math.max(0, micros) / 1e6;
  if (options.compactLarge && value >= 1000) {
    return `≈$${(value / 1000).toFixed(value >= 10000 ? 0 : 2)}k`;
  }
  if (options.compactLarge && value >= 100) return `≈$${Math.round(value)}`;
  if (options.compactLarge && value >= 10) return `≈$${value.toFixed(1)}`;
  if (options.compactLarge && value < 1) {
    return `≈$${value >= 0.01 ? value.toFixed(2) : value.toFixed(4)}`;
  }
  return `≈$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatReportedCompact(
  value: number,
  locale: Locale,
  emptyLabel: string,
): string {
  return value > 0 ? compactNumber(value, locale) : emptyLabel;
}
