import type { Metadata } from "next";
import type { Locale } from "./i18n";

interface DetailMetadataInput {
  title: string;
  description: string;
  path: `/${string}`;
  locale: Locale;
  type?: "article" | "website";
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
