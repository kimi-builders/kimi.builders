/* 作品库 /works:成员作品墙(截图卡片,双列网格)+ 提交入口。
   只展示 source=site 的成员作品;推荐的站外项目在 /awesome。
   卡片渲染与 /awesome 共用 _components/WorkCard。 */
import type { Metadata } from "next";
import Link from "next/link";
import { Rocket, SquarePen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getWorks } from "@/src/lib/works";
import WorkCard from "./_components/WorkCard";

export const metadata: Metadata = { title: "作品库 — kimi.builders" };

export default async function WorksPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const works = await getWorks();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <Rocket size={17} />
          {t(locale, "nav.works")}
        </h1>
        {user && (
          <Link
            href="/works/new"
            className="flex items-center gap-2 border border-blue px-4 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
          >
            <SquarePen size={13} />
            {t(locale, "works.submit")}
          </Link>
        )}
      </div>

      {works.length === 0 ? (
        <p className="mt-16 text-center text-sm leading-relaxed text-grey">
          {t(locale, "works.empty")}
          {!user && (
            <>
              <br />
              {t(locale, "works.loginRequired")}
              <a
                href="/api/auth/github"
                className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
              >
                GitHub
              </a>
              <a
                href="/api/auth/google"
                className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
              >
                Google
              </a>
            </>
          )}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {works.map((w) => (
            <WorkCard key={w.id} work={w} locale={locale} meId={user?.id ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
