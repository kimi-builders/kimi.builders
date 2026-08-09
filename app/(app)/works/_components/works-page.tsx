/* 作品列表一页的服务端组装:游标分页 + 徽章总量(批量一条 IN 查询,避免 N+1)
   + 卡片渲染。/works、/awesome 首屏与「加载更多」server action 共用,
   保证两种入口输出一致(同 comment-page.tsx 的模式)。
   徽章(S2-2):只在 /works 成员作品墙带;/awesome 不查不带。
   门禁钉在 SQL 里(JOIN usage_settings show_on_leaderboard = 1):
   未 opt-in 的作者不进结果集,badgeTokensOf 得 null → 完全不渲染(无负面标记)。 */
import type { ReactNode } from "react";
import type { SessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import type { Locale } from "@/src/lib/i18n";
import { getPublicTokenTotals } from "@/src/lib/usage/social";
import {
  badgeTokensOf,
  getAwesomeWorksPage,
  getWorksPage,
} from "@/src/lib/works";
import WorkCard from "./WorkCard";

export interface WorksPageData {
  nodes: ReactNode[];
  nextCursor: number | null;
}

export async function loadWorksCards(
  scope: { awesome: boolean; agent?: string },
  user: SessionUser | null,
  locale: Locale,
  after?: number,
): Promise<WorksPageData> {
  const page = scope.awesome
    ? await getAwesomeWorksPage(scope.agent, after)
    : await getWorksPage(after);
  const totals = scope.awesome
    ? new Map<number, number>()
    : await getPublicTokenTotals(page.works.map((w) => w.userId));
  /* admin/mod 在 /works 卡片上看到设/撤精选入口(每周精选 v0);/awesome 原口径不带 */
  const canFeature = !scope.awesome && !!user && canModerate(user.role);
  return {
    nodes: page.works.map((w) => (
      <WorkCard
        key={w.id}
        work={w}
        locale={locale}
        meId={user?.id ?? null}
        canFeature={canFeature}
        badgeTokens={badgeTokensOf(w, totals)}
      />
    )),
    nextCursor: page.nextCursor,
  };
}
