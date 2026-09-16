/* Privacy policy (/privacy): what the site collects, what stays local,
   and what is optional. Copy goes through i18n; the page is flat inside
   the (app) shell with the community rail fallback (same shape as
   /about). Content must stay honest with the product's privacy claims:
   usage is local-first and private by default, the leaderboard is
   opt-in, retention is user-configurable, and account deletion exists. */
import type { Metadata } from "next";
import { t, type I18nKey } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import PageHeader from "@/components/PageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.privacy"), description: t(locale, "metaDesc.privacy") };
}

/* Section keys rendered in order; the zh/en copy lives in i18n so both
   locales stay paired in one place. */
const SECTIONS = [
  "scope",
  "account",
  "content",
  "usage",
  "analytics",
  "cookies",
  "retention",
  "thirdParty",
  "contact",
] as const;

export default async function PrivacyPage() {
  const locale = await getLocale();
  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "legal.eyebrow")}
        title={t(locale, "privacy.title")}
        lede={t(locale, "privacy.lede")}
        meta={
          <p className="font-mono text-xs text-grey">
            {t(locale, "privacy.updated")}
          </p>
        }
      />
      <div className="mt-10 max-w-2xl space-y-8">
        {SECTIONS.map((key) => (
          <section key={key}>
            <h2 className="kb-h3">
              {t(locale, `privacy.s.${key}.title` as I18nKey)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-grey">
              {t(locale, `privacy.s.${key}.body` as I18nKey)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
