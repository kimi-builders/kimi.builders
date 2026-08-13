/* 「正在路上」占位页:未就绪板块(见 src/lib/upcoming.ts)的统一空态,
   代替空白功能上线。视觉沿用 panel 语法:mono kicker + 标题 + 说明 + 回社区链接。 */
import Link from "next/link";
import { t, type Locale } from "@/src/lib/i18n";

export default function SoonPanel({
  title,
  locale,
}: {
  title: string;
  locale: Locale;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-6 py-14 text-center sm:py-20">
      <p className="font-mono text-[10px] tracking-[0.3em] text-blue">
        {t(locale, "soon.kicker")}
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-[0.2px] text-paper">
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-grey">
        {t(locale, "soon.body")}
      </p>
      <Link
        href="/community"
        className="mt-7 inline-flex min-h-9 items-center rounded-lg border border-line px-4 font-mono text-xs text-paper transition-colors hover:border-blue hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        {t(locale, "soon.back")}
      </Link>
    </div>
  );
}
