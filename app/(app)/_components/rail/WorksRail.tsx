/* /works 列表右栏:作品墙说明 + 提交入口(登录可见)+ 热门作品 Top5。 */
import Link from "next/link";
import { SquarePen, ArrowBigUp } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { getTopWorks } from "@/src/lib/works";
import Widget from "./Widget";

export default async function WorksRail({
  locale,
  loggedIn,
}: {
  locale: Locale;
  loggedIn: boolean;
}) {
  const top = await getTopWorks(5);
  return (
    <>
      <Widget title={t(locale, "rail.worksAbout")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "rail.worksAboutBody")}
        </p>
        {loggedIn && (
          <Link
            href="/works/new"
            className="mt-3 flex items-center justify-center gap-2 border border-blue py-2 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
          >
            <SquarePen size={13} />
            {t(locale, "rail.worksSubmit")}
          </Link>
        )}
      </Widget>

      <Widget title={t(locale, "rail.worksTop")}>
        {top.length === 0 ? (
          <p className="text-xs text-grey">{t(locale, "rail.worksTopEmpty")}</p>
        ) : (
          <ul className="space-y-2.5">
            {top.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/works/${w.id}`}
                  className="group flex items-center justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate text-paper transition-colors group-hover:text-blue">
                    {w.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-grey">
                    <ArrowBigUp size={11} />
                    {w.voteCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    </>
  );
}
