/* Terms of service (/terms): community ground rules and disclaimers.
   Same shape as /privacy — flat (app) page, all copy through i18n so
   the zh/en pair lives in one place. The terms mirror the site's
   existing public claims: member-built, non-commercial at this stage,
   verifiable proof over promises, and moderation with notice. */
import type { Metadata } from "next";
import { t, type I18nKey } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import PageHeader from "@/components/PageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.terms"), description: t(locale, "metaDesc.terms") };
}

/* Section keys rendered in order. */
const SECTIONS = [
  "service",
  "account",
  "content",
  "moderation",
  "claims",
  "liability",
  "changes",
  "contact",
] as const;

export default async function TermsPage() {
  const locale = await getLocale();
  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "legal.eyebrow")}
        title={t(locale, "terms.title")}
        lede={t(locale, "terms.lede")}
        meta={
          <p className="font-mono text-xs text-grey">
            {t(locale, "terms.updated")}
          </p>
        }
      />
      <div className="mt-10 max-w-2xl space-y-8">
        {SECTIONS.map((key) => (
          <section key={key}>
            <h2 className="kb-h3">
              {t(locale, `terms.s.${key}.title` as I18nKey)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-grey">
              {t(locale, `terms.s.${key}.body` as I18nKey)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
