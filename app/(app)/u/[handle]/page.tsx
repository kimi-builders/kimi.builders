/* 个人主页 /u/[handle]:资料头(头像/显示名/handle/简介/加入时间)+ 三项统计
   (帖子/评论/获赞)+ 帖子|评论页签。本人视角多一颗「编辑资料」入口(去 /settings),
   且能看到自己的私密帖(带标);访客只统计/展示公开内容。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowBigUp, CalendarDays, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getUserComments, getUserPosts } from "@/src/lib/posts";
import { getProfileByHandle, getProfileStats } from "@/src/lib/users";

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const p = await getProfileByHandle(handle);
  if (!p) return { title: "kimi.builders" };
  return { title: `${p.name || p.handle} (@${p.handle}) — kimi.builders` };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { handle } = await params;
  const { tab } = await searchParams;
  const me = await getSessionUser();
  const locale = await getLocale(me);
  const profile = await getProfileByHandle(handle);

  if (!profile) {
    return (
      <p className="mt-16 text-center text-sm text-grey">
        {t(locale, "prof.notFound")}
      </p>
    );
  }

  const self = me?.id === profile.id;
  const showComments = tab === "comments";
  const [stats, posts, comments] = await Promise.all([
    getProfileStats(profile.id, self),
    showComments ? Promise.resolve([]) : getUserPosts(profile.id, self),
    showComments ? getUserComments(profile.id, self) : Promise.resolve([]),
  ]);

  const tabCls = (active: boolean) =>
    `pb-2 transition-colors ${
      active
        ? "text-paper underline decoration-blue underline-offset-8"
        : "text-grey hover:text-paper"
    }`;

  return (
    <div>
      {/* 资料头 */}
      <header className="border border-line bg-card p-5">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full border border-paper/15"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-paper">
              {profile.name || profile.handle}
            </h1>
            <p className="font-mono text-xs text-grey">
              @{profile.handle}
              {profile.role !== "member" && (
                <span className="ml-2 border border-blue px-1 py-px text-[9px] tracking-wider text-blue">
                  {profile.role.toUpperCase()}
                </span>
              )}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-grey">
              <CalendarDays size={12} />
              {t(locale, "prof.joined", { d: ymd(profile.createdAt) })}
            </p>
          </div>
          {self && (
            <Link
              href="/settings"
              className="shrink-0 border border-line px-3 py-1.5 font-mono text-xs text-paper transition-colors hover:border-blue hover:text-blue"
            >
              {t(locale, "prof.edit")}
            </Link>
          )}
        </div>
        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-paper/90">
            {profile.bio}
          </p>
        )}
        <div className="mt-4 flex gap-6 border-t border-line pt-3">
          {[
            { n: stats.posts, l: t(locale, "prof.posts") },
            { n: stats.comments, l: t(locale, "prof.comments") },
            { n: stats.likes, l: t(locale, "prof.likes") },
          ].map((s) => (
            <div key={s.l} className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold text-paper">
                {s.n}
              </span>
              <span className="font-mono text-[11px] text-grey">{s.l}</span>
            </div>
          ))}
        </div>
      </header>

      {/* 页签 */}
      <div className="mt-6 flex items-center gap-5 border-b border-line font-mono text-sm">
        <Link href={`/u/${profile.handle}`} className={tabCls(!showComments)}>
          {t(locale, "prof.posts")}
        </Link>
        <Link
          href={`/u/${profile.handle}?tab=comments`}
          className={tabCls(showComments)}
        >
          {t(locale, "prof.comments")}
        </Link>
      </div>

      {/* 帖子页签 */}
      {!showComments &&
        (posts.length === 0 ? (
          <p className="mt-16 text-center text-sm text-grey">
            {t(locale, "prof.noPosts")}
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {posts.map((p) => (
              <article
                key={p.id}
                className="border border-line bg-card p-4 transition-colors hover:border-paper/20"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] text-grey">
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
                  <span className="inline-flex items-center gap-1">
                    <ArrowBigUp size={14} />
                    {p.score}
                  </span>
                  <Link
                    href={`/community/${p.id}#comments`}
                    title={t(locale, "post.comments", { n: p.commentCount })}
                    className="inline-flex items-center gap-1 transition-colors hover:text-blue"
                  >
                    <MessageCircle size={13} />
                    {p.commentCount}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ))}

      {/* 评论页签 */}
      {showComments &&
        (comments.length === 0 ? (
          <p className="mt-16 text-center text-sm text-grey">
            {t(locale, "prof.noComments")}
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {comments.map((c) => (
              <article
                key={c.id}
                className="border border-line bg-card p-4 transition-colors hover:border-paper/20"
              >
                <div className="font-mono text-[11px] text-grey">
                  {t(locale, "prof.commentedOn")}{" "}
                  <Link
                    href={`/community/${c.postId}#comment-${c.id}`}
                    className="text-paper transition-colors hover:text-blue"
                  >
                    {c.postTitle}
                  </Link>
                  <span className="mx-2">·</span>
                  {relTime(c.createdAt, locale)}
                </div>
                <Link
                  href={`/community/${c.postId}#comment-${c.id}`}
                  className="mt-1.5 block text-sm leading-relaxed text-paper/90 transition-colors hover:text-blue"
                >
                  <span className="line-clamp-2">{c.excerpt}</span>
                </Link>
                <div className="mt-2 flex items-center gap-1 font-mono text-[11px] text-grey">
                  <ArrowBigUp size={13} />
                  {c.score}
                </div>
              </article>
            ))}
          </div>
        ))}
    </div>
  );
}
