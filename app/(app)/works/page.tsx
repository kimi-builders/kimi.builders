/* 作品库 /works:成员作品墙(截图卡片,双列网格)+ 提交入口。
   只展示 source=site 的成员作品;推荐的站外项目在 /awesome。
   卡片渲染与 /awesome 共用 _components/WorkCard,首屏与「加载更多」共用
   _components/works-page(游标分页,P1-4)。
   作者已 opt-in 公开用量时,卡片带「已验证构建投入」徽章(见 works-page)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { Rocket, SquarePen } from "lucide-react";
import LoadMore from "@/components/LoadMore";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { loadMoreWorksAction } from "./actions";
import { loadWorksCards } from "./_components/works-page";

export const metadata: Metadata = { title: "作品库 — kimi.builders" };

export default async function WorksPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const page = await loadWorksCards({ awesome: false }, user, locale);

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

      {page.nodes.length === 0 ? (
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
          {page.nodes}
          {/* key 带首屏规模与游标:卡片行内删除触发 refresh 后首屏一变即 remount,
              已追加的页作废(同 CommentSection 语义) */}
          <LoadMore
            key={`works-${page.nodes.length}-${page.nextCursor ?? "end"}-${locale}`}
            initialCursor={page.nextCursor}
            load={loadMoreWorksAction.bind(null, { awesome: false, agent: null })}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
