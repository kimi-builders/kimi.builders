/* 右栏注册表(docs/shell-and-ai-native.md B 节):按路由段分发右栏上下文,
   同时给出主内容列宽(usage 的 :has 加宽 hack 收编到这里,个人主页同样加宽)。
   railFor 是纯函数,单测直接测(tests/right-rail.test.ts);
   pathname 由根 proxy.ts 写进 x-kb-path 请求头,(app)/layout.tsx 在服务端树重取时读表。
   kind=none → 不渲染右栏;wide → 主列 max-w 放宽到 1000(分析画布)。
   未列出的路由(/settings、/demo-night、/community 子页等)回落
   community —— 与改版前「全站同一份 widget」的行为一致。
   未就绪板块(src/lib/upcoming.ts)的专属 rail 一并回落 community,
   避免「正在路上」占位页旁边挂着空 rail。 */
import { UPCOMING } from "@/src/lib/upcoming";

export type RailKind =
  | "community"
  | "post"
  | "work"
  | "works"
  | "awesome"
  | "explore"
  | "none";

export interface RailDecision {
  kind: RailKind;
  /* post/work 详情的路由 id;其余 kind 恒为 null(仅通知页用 0 哨兵,
     同 rail 但需强制壳重估——见 railFor 内注释) */
  id: number | null;
  /* 主列加宽(1000);目前仅 kind=none 的宽画布路由 */
  wide: boolean;
}

/* 布局需要重取的最小上下文:同一种 rail + 同一详情 id + 同一列宽时,
   pathname 改变不影响右栏或壳宽度,无需 router.refresh() 全树重取。 */
export function railDecisionKey({ kind, id, wide }: RailDecision): string {
  return `${kind}:${id ?? "-"}:${wide ? 1 : 0}`;
}

const decision = (
  kind: RailKind,
  opts: { id?: number; wide?: boolean } = {},
): RailDecision => ({ kind, id: opts.id ?? null, wide: opts.wide ?? false });

export function railFor(pathname: string): RailDecision {
  /* 去尾斜杠,空串按根处理 */
  const p = pathname.replace(/\/+$/, "") || "/";

  /* 宽画布,无右栏:用量区(含 device/leaderboard 子页)与个人主页 */
  if (p === "/usage" || p.startsWith("/usage/")) {
    return decision("none", { wide: true });
  }
  if (p.startsWith("/u/")) return decision("none", { wide: true });
  /* 管理台(20260830 治理):无右栏,宽画布 */
  if (p === "/admin" || p.startsWith("/admin/")) {
    return decision("none", { wide: true });
  }

  /* 通知页与 feed 同一份 community rail,但访问即已读(markNotificationsRead
     在页面渲染里执行):给它独立 decision key,进出各强制一次全树重取,
     布局里的未读角标随即清零;id=0 是哨兵,非详情路由 id */
  if (p === "/community/notifications") return decision("community", { id: 0 });

  /* 详情页:仅精确匹配 /community/<id>、/works/<id>(/edit 等子页不算) */
  const post = /^\/community\/(\d+)$/.exec(p);
  if (post) return decision("post", { id: Number(post[1]) });
  const work = /^\/works\/(\d+)$/.exec(p);
  if (work) return decision("work", { id: Number(work[1]) });

  /* 作品列表:/works 有专属 rail(提交入口 + 热门作品 + 声明制说明) */
  if (p === "/works") return decision("works");

  if (p === "/awesome") return decision("awesome");
  /* 探索区(20260821 月刊 × 教程合并):目录/详情/系列页同 rail;
     板块未就绪时(UPCOMING.explore)回落 community;
     旧 /blog、/learn 路由已 301,不再出 rail 分支 */
  if (!UPCOMING.explore && (p === "/explore" || p.startsWith("/explore/"))) {
    return decision("explore");
  }

  /* 回落:社区 feed 及一切未列出路由(/community/new、/settings、/demo-night …) */
  return decision("community");
}
