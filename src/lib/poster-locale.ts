import type { Locale } from "./i18n";

/* Poster URLs carry locale explicitly so public image caches never mix
   language variants. Missing or invalid values preserve the historical
   Chinese default for copied poster URLs. */
export function normalizePosterLocale(raw: string | null): Locale {
  return raw === "en" ? "en" : "zh";
}

