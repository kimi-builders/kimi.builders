/* 消息页:关注的帖子有新评论 / 我的评论被回复 / 作品召唤被 AI 回应(20260816),
   按时间倒序;链接锚到具体评论(#comment-<id> / #work-comment-<id>)。
   打开页面即全部标记已读。actor 为空 = Kimi 小筑(AI),用 bot 头像和名字展示。 */
import type { Metadata } from "next";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { Bell } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/ai-reply";
import { relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getNotifications, markNotificationsRead } from "@/src/lib/posts";

export const metadata: Metadata = { title: "消息 — kimi.builders" };

export default async function NotificationsPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (!user) {
    /* 未登录:统一登录引导卡(20260919) */
    return (
      <div>
        <h1 className="text-2xl font-semibold text-paper">
          {t(locale, "notif.title")}
        </h1>
        <div className="mt-8">
          <LoginGate
            locale={locale}
            title={t(locale, "gate.notif")}
            next="/community/notifications"
          />
        </div>
      </div>
    );
  }

  const items = await getNotifications(user.id);
  await markNotificationsRead(user.id);

  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-paper">
        <Bell size={17} />
        {t(locale, "notif.title")}
      </h1>
      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-card p-8 text-center">
          <Bell size={22} className="mx-auto text-grey/70" aria-hidden="true" />
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-grey">{t(locale, "notif.empty")}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((n) => {
            /* work 分支(20260816 作品召唤):AI 回复作品评论,
               锚到 /works/<id>#work-comment-<cid>;其余同 post 通知 */
            const isWork = n.workId !== null;
            const href = isWork
              ? `/works/${n.workId}#work-comment-${n.workCommentId}`
              : `/community/${n.postId}#comment-${n.commentId}`;
            return (
            <li key={n.id}>
              <Link
                href={href}
                className="flex items-start gap-3 rounded-2xl border border-line bg-card p-3.5 transition-colors hover:border-paper/20"
              >
                <Avatar
                  url={n.actorHandle ? n.actorAvatar : BOT_AVATAR}
                  handle={n.actorHandle ?? BOT_NAME}
                  size={28}
                  square={!n.actorHandle}
                  className="h-7 w-7 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-paper">
                    <span className="font-medium">
                      {n.actorHandle ? `@${n.actorHandle}` : BOT_NAME}
                    </span>{" "}
                    <span className="text-grey">
                      {isWork
                        ? t(locale, "notif.workReply", { name: n.workName ?? "" })
                        : t(locale, n.type === "reply" ? "notif.reply" : "notif.comment")}
                    </span>
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-grey">
                    {isWork ? n.workName : n.postTitle}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-grey">
                  {relTime(n.createdAt, locale)}
                </span>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
