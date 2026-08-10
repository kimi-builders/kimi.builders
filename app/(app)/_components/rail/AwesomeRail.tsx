/* /awesome 右栏:收录说明 + 提交入口(登录后可见,与页面头 CTA 同口径)
   + 来源统计(站内作品 / 站外收录条目数)。 */
import Link from "next/link";
import { SquarePen } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { getAwesomeSourceStats } from "@/src/lib/works";
import Widget from "./Widget";

export default async function AwesomeRail({
  locale,
  loggedIn,
}: {
  locale: Locale;
  loggedIn: boolean;
}) {
  const stats = await getAwesomeSourceStats();
  return (
    <>
      <Widget title={t(locale, "rail.awesomeAbout")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "awesome.intro")}
        </p>
        {loggedIn && (
          <Link
            href="/works/new"
            className="mt-3 flex items-center justify-center gap-2 border border-blue py-2 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
          >
            <SquarePen size={13} />
            {t(locale, "awesome.recommend")}
          </Link>
        )}
      </Widget>

      <Widget title={t(locale, "rail.awesomeStats")}>
        <div className="flex justify-between">
          {[
            { n: stats.site, l: t(locale, "rail.sourceSite") },
            { n: stats.awesome, l: t(locale, "rail.sourceAwesome") },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-mono text-lg font-semibold text-paper">
                {s.n}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-grey">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </Widget>
    </>
  );
}
