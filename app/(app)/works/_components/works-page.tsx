/* 作品列表一页的服务端组装:游标分页 + 声明徽章数据(批量两条 IN 查询,避免 N+1)
   + 卡片渲染。/works、/awesome 首屏与「加载更多」server action 共用,
   保证两种入口输出一致(同 comment-page.tsx 的模式)。
   徽章(声明制,20260822_work_claims):只在 /works 成员作品墙带;/awesome 不查不带。
   口径:本作品 claimed_tokens,且作者全部作品 Σ声明 ≤ 作者可验证总量
   (usage/verifiable.ts 内部查询,不做 opt-in 门禁;总量数字不公开展示)。
   不变式被破坏(总量缩水)→ 该作者所有卡片无徽章,作者本人多看到一行
   重新分配提示(claimPaused,仅作者可见,无负面标记对外)。 */
import type { ReactNode } from "react";
import type { SessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import type { Locale } from "@/src/lib/i18n";
import { getPublicWorksFirstPage } from "@/src/lib/public-works-cache";
import { publicWorksCacheScope } from "@/src/lib/public-works";
import { getVerifiableTokenTotals } from "@/src/lib/usage/verifiable";
import {
  claimBadgeOf,
  claimsPaused,
  getAwesomeWorksPage,
  getWorkClaimSums,
  getWorksPage,
} from "@/src/lib/works";
import WorkCard from "./WorkCard";

export interface WorksPageData {
  nodes: ReactNode[];
  nextCursor: string | null;
}

export async function loadWorksCards(
  scope: {
    awesome: boolean;
    sort?: "hot" | "new";
    agents?: string[];
    kinds?: string[];
    scope_?: string;
  },
  user: SessionUser | null,
  locale: Locale,
  after?: string,
): Promise<WorksPageData> {
  const queryOpts = {
    sort: scope.sort,
    agents: scope.agents,
    kinds: scope.kinds,
    after,
    viewerId: user?.id,
  };
  const publicScope = publicWorksCacheScope({
    awesome: scope.awesome,
    ...queryOpts,
    scope_: scope.scope_,
  });
  const page = publicScope
    ? await getPublicWorksFirstPage(publicScope)
    : scope.awesome
      ? await getAwesomeWorksPage({ ...queryOpts, scope: scope.scope_ })
      : await getWorksPage(queryOpts);
  const authorIds = page.works.map((w) => w.userId);
  const [totals, claimSums] = scope.awesome
    ? [new Map<number, number>(), new Map<number, number>()]
    : await Promise.all([
        getVerifiableTokenTotals(authorIds),
        getWorkClaimSums(authorIds),
      ]);
  /* admin/mod 在 /works 卡片上看到设/撤精选入口(每周精选 v0);/awesome 原口径不带 */
  const canFeature = !scope.awesome && !!user && canModerate(user.role);
  /* 作者本人的声明超额态(仅作者可见的重新分配提示;徽章隐藏由 claimBadgeOf 保证) */
  const myPaused = user
    ? claimsPaused(totals.get(user.id) ?? 0, claimSums.get(user.id) ?? 0)
    : false;
  return {
    nodes: page.works.map((w) => (
      <WorkCard
        key={w.id}
        work={w}
        locale={locale}
        meId={user?.id ?? null}
        canFeature={canFeature}
        claimBadge={claimBadgeOf(w, totals, claimSums)}
        claimPaused={myPaused}
      />
    )),
    nextCursor: page.nextCursor,
  };
}
