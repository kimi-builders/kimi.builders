/* The "on its way" placeholder: the unified empty state for
   not-yet-ready sections (see src/lib/upcoming.ts), shipping instead of
   blank features. Visual language follows the panel grammar: mono
   kicker + title + copy + back-to-community link. Expectation
   management: expect states what the first batch will bring (turning
   "nothing here" into "worth coming back"); a follow entry gives a
   return hook (the GitHub Org feed) — the site has no newsletter, and
   this is the honest equivalent. */
import Link from "next/link";
import { t, type Locale } from "@/src/lib/i18n";

export default function SoonPanel({
  title,
  locale,
  expect,
}: {
  title: string;
  locale: Locale;
  /* First-batch content directions (optional): passed by section
     pages; the admin/edit entries pass none. */
  expect?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-6 py-14 text-center sm:py-20">
      <p className="font-mono text-xs tracking-[0.08em] text-ui-blue">
        {t(locale, "soon.kicker")}
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-[0.2px] text-paper">
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-grey">
        {t(locale, "soon.body")}
      </p>
      {expect && (
        <p className="mx-auto mt-3 max-w-md border-l-2 border-blue/60 pl-3 text-left text-sm leading-relaxed text-paper/80">
          {expect}
        </p>
      )}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
        <Link
          href="/community"
          className="inline-flex min-h-9 items-center rounded-lg border border-line px-4 font-mono text-xs text-paper transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "soon.back")}
        </Link>
        <a
          href="https://github.com/kimi-builders"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center font-mono text-xs text-ui-blue transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "soon.follow")} →
        </a>
      </div>
    </div>
  );
}
