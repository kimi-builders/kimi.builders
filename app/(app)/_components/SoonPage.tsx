/* Placeholder page for unbuilt sections: big icon + section name +
   "still being built" + planned items + a back-to-community CTA. The
   routes exist so nav entries aren't dead links; real development
   replaces the whole page. */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function SoonPage({
  icon: Icon,
  name,
  desc,
  items,
  locale,
}: {
  icon: LucideIcon;
  name: string;
  desc: string;
  items: string[];
  locale: Locale;
}) {
  return (
    <div className="border border-line bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="border border-line p-2.5 text-grey">
          <Icon size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-paper">{name}</h1>
          <p className="font-mono text-xs tracking-[0.08em] text-ui-blue">
            {t(locale, "soon.headline")}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-grey">{desc}</p>
      <h2 className="mt-6 font-mono text-xs tracking-[0.08em] text-grey">
        {t(locale, "soon.planned")}
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li
            key={it}
            className="flex items-center gap-2 font-mono text-xs text-paper/80"
          >
            <span className="text-ui-blue">·</span>
            {it}
          </li>
        ))}
      </ul>
      <Link
        href="/community"
        className="mt-6 inline-block border border-ui-blue px-5 py-2 text-xs text-ui-blue transition-colors hover:bg-blue hover:text-bg"
      >
        {t(locale, "soon.cta")}
      </Link>
    </div>
  );
}
