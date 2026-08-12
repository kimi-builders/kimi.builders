/* 右栏注册表(docs/shell-and-ai-native.md B 节):按路由段分发右栏上下文,
   同时给出主内容列宽(usage 的 :has 加宽 hack 收编到这里,个人主页同样加宽)。
   railFor 是纯函数,单测直接测(tests/right-rail.test.ts);
   pathname 由根 proxy.ts 写进 x-kb-path 请求头,(app)/template.tsx 读表渲染(每次导航重估)。
   kind=none → 不渲染右栏;wide → 主列 max-w 放宽到 1120(分析画布)。
   未列出的路由(/settings、/demo-night、/community 子页等)回落
   community —— 与改版前「全站同一份 widget」的行为一致。 */
export type RailKind =
  | "community"
  | "post"
  | "work"
  | "works"
  | "awesome"
  | "blog"
  | "learn"
  | "none";

export interface RailDecision {
  kind: RailKind;
  /* post/work 详情的路由 id,其余 kind 恒为 null */
  id: number | null;
  /* 主列加宽(1120);目前仅 kind=none 的宽画布路由 */
  wide: boolean;
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

  /* 详情页:仅精确匹配 /community/<id>、/works/<id>(/edit 等子页不算) */
  const post = /^\/community\/(\d+)$/.exec(p);
  if (post) return decision("post", { id: Number(post[1]) });
  const work = /^\/works\/(\d+)$/.exec(p);
  if (work) return decision("work", { id: Number(work[1]) });

  /* 作品列表:/works 有专属 rail(提交入口 + 热门作品 + 声明制说明) */
  if (p === "/works") return decision("works");

  if (p === "/awesome") return decision("awesome");
  /* 月刊区:列表与文章详情同 rail;admin 编辑页回落默认 */
  if (p === "/blog" || (p.startsWith("/blog/") && !p.startsWith("/blog/admin"))) {
    return decision("blog");
  }
  /* 知识库:列表与文章详情同 rail */
  if (p === "/learn" || p.startsWith("/learn/")) return decision("learn");

  /* 回落:社区 feed 及一切未列出路由(/community/new、/works、/settings …) */
  return decision("community");
}
