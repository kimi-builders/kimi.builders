import type { Metadata } from "next";
import type { Locale } from "./i18n";

interface DetailMetadataInput {
  title: string;
  description: string;
  path: `/${string}`;
  locale: Locale;
  type?: "article" | "website";
  /* Poster endpoint path (/api/share/…). When present the card upgrades
     to summary_large_image with the poster as og:image — a "Show your
     work" product must never share out as a text-only card while its
     poster pipeline is live. Relative URLs resolve against the root
     metadataBase. */
  image?: `/${string}`;
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
  image,
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
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
