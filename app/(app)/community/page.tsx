/* 社区 feed:卡片流(头像左 + 标题/摘要 + 底部图标动作行)。
   顶部:VibeCafé 式快速发帖框(登录可见,点击进完整发帖页)+ 热门/最新/订阅页签。
   板块筛选在右栏「浏览社区」;行内顶/踩可交互(reaction 态一条 IN 批量查,避免 N+1)。
   标题非强制:无标题帖正文摘要占主链接位。登录用户的私密帖只在自己的 feed 出现(带标);
   被自己点踩的帖不再出现在自己的 feed。 */
import Link from "next/link";
import { ArrowBigUp, MessageCircle, SquarePen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getFeed, getPostReactions } from "@/src/lib/posts";
import { relTime } from "@/src/lib/format";
import VoteCluster from "./_components/VoteCluster";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; cat?: string; sub?: string }>;
}) {
  const { sort, cat, sub } = await searchParams;
  const currentSort = sort === "new" ? "new" : "hot";
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const subOnly = sub === "1" && !!user;
  const posts = await getFeed({
    sort: currentSort,
    category: cat,
    subscriberId: subOnly ? user.id : undefined,
    viewerId: user?.id,
  });
  const reacted = user
    ? await getPostReactions(user.id, posts.map((p) => p.id))
    : { up: new Set<number>(), down: new Set<number>() };

  const tabHref = (s: string) =>
    `/community?sort=${s}${cat ? `&cat=${cat}` : ""}${subOnly ? "&sub=1" : ""}`;
  const tabCls = (active: boolean) =>
    `pb-2 transition-colors ${
      active
        ? "text-paper underline decoration-blue underline-offset-8"
        : "text-grey hover:text-paper"
    }`;

  return (
    <div>
      {user && (
        <Link
          href="/community/new"
          className="mb-6 flex items-center gap-3 border border-line bg-card p-3.5 transition-colors hover:border-paper/25"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full border border-paper/10"
          />
          <span className="text-sm text-grey">{t(locale, "feed.quickPost")}</span>
          <SquarePen size={15} className="ml-auto text-grey" />
        </Link>
      )}

      <div className="flex items-center gap-5 border-b border-line font-mono text-sm">
        <Link href={tabHref("hot")} className={tabCls(currentSort === "hot" && !subOnly)}>
          {t(locale, "feed.hot")}
        </Link>
        <Link href={tabHref("new")} className={tabCls(currentSort === "new" && !subOnly)}>
          {t(locale, "feed.new")}
        </Link>
        {user && (
          <Link href="/community?sub=1" className={tabCls(subOnly)}>
            {t(locale, "feed.sub")}
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="mt-16 text-center text-sm text-grey">
          {subOnly ? t(locale, "feed.emptySub") : t(locale, "feed.empty")}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {posts.map((p) => {
            const up = reacted.up.has(p.id);
            const down = reacted.down.has(p.id);
            return (
              <article
                key={p.id}
                className="border border-line bg-card p-4 transition-colors hover:border-paper/20"
              >
                <div className="flex gap-3">
                  <Link href={`/u/${p.handle}`} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.avatarUrl}
                      alt={`@${p.handle}`}
                      className="h-9 w-9 rounded-full border border-paper/10"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-grey">
                      <Link
                        href={`/u/${p.handle}`}
                        className="text-paper transition-colors hover:text-blue"
                      >
                        @{p.handle}
                      </Link>
                      <span>·</span>
                      <span>{relTime(p.createdAt, locale)}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-2 tracking-wider">
                        {p.visibility === "private" && (
                          <span className="border border-line px-1 py-px text-[10px] text-paper">
                            {t(locale, "post.private")}
                          </span>
                        )}
                        {categoryLabel(locale, p.category)}
                      </span>
                    </div>
                    {/* 标题非强制:无标题帖用正文摘要占主链接位(X 式卡片) */}
                    {p.title ? (
                      <>
                        <Link
                          href={`/community/${p.id}`}
                          className="mt-1 block text-[15px] font-medium leading-snug text-paper transition-colors hover:text-blue"
                        >
                          {p.title}
                          {p.type !== "text" && (
                            <span className="ml-2 border border-line px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-grey">
                              {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
                            </span>
                          )}
                        </Link>
                        {p.excerpt && (
                          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
                            {p.excerpt}
                          </p>
                        )}
                      </>
                    ) : (
                      <Link
                        href={`/community/${p.id}`}
                        className="mt-1 block text-[15px] leading-relaxed text-paper transition-colors hover:text-blue"
                      >
                        <span className="line-clamp-3">{p.excerpt}</span>
                        {p.type !== "text" && (
                          <span className="ml-2 border border-line px-1.5 py-0.5 align-middle font-mono text-[10px] text-grey">
                            {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
                          </span>
                        )}
                      </Link>
                    )}
                    <div className="mt-2.5 flex items-center gap-5 font-mono text-[11px] text-grey">
                      {user ? (
                        <VoteCluster
                          target="post"
                          id={p.id}
                          score={p.score}
                          up={up}
                          down={down}
                          locale={locale}
                          size={14}
                        />
                      ) : (
                        <span
                          className="inline-flex items-center gap-1"
                          title={t(locale, "post.loginToUpvote")}
                        >
                          <ArrowBigUp size={14} />
                          {p.score}
                        </span>
                      )}
                      <Link
                        href={`/community/${p.id}#comments`}
                        title={t(locale, "post.comments", { n: p.commentCount })}
                        className="inline-flex items-center gap-1 transition-colors hover:text-blue"
                      >
                        <MessageCircle size={13} />
                        {p.commentCount}
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
