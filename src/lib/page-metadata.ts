import type { Metadata } from "next";
import type { Locale } from "./i18n";

interface DetailMetadataInput {
  title: string;
  description: string;
  path: `/${string}`;
  locale: Locale;
  type?: "article" | "website";
}

/* A fallback article keeps its original-language title. The language
   tag makes that fact visible in search and social previews, where the
   in-page fallback badge is unavailable. */
export function languageTaggedTitle(
  title: string,
  uiLocale: Locale,
  contentLocale: Locale,
  fallback: boolean,
): string {
  if (!fallback) return title;
  const language = uiLocale === "zh"
    ? contentLocale === "zh" ? "中文" : "英文"
    : contentLocale === "zh" ? "Chinese" : "English";
  return `[${language}] ${title}`;
}

/* Detail routes must replace the root social fields as one unit. Next
   merges metadata shallowly, so omitting any field can leave a generic
   home-page preview attached to a detail URL. */
export function detailMetadata({
  title,
  description,
  path,
  locale,
  type = "website",
}: DetailMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      siteName: "kimi.builders",
      type,
      url: path,
      locale: locale === "zh" ? "zh_CN" : "en_US",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
