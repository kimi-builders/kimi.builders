/* 消息页:关注的帖子有新评论 / 我的评论被回复,按时间倒序;
   链接锚到具体评论(#comment-<id>)。打开页面即全部标记已读。
   actor 为空 = Kimi 小筑(AI),用 bot 头像和名字展示。 */
import type { Metadata } from "next";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { Bell } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
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
    return (
      <div>
        <h1 className="font-mono text-lg font-semibold">
          {t(locale, "notif.title")}
        </h1>
        <p className="mt-8 text-sm text-grey">
          {t(locale, "notif.loginRequired")}
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
        </p>
      </div>
    );
  }

  const items = await getNotifications(user.id);
  await markNotificationsRead(user.id);

  return (
    <div>
      <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
        <Bell size={17} />
        {t(locale, "notif.title")}
      </h1>
      {items.length === 0 ? (
        <p className="mt-16 text-center text-sm text-grey">
          {t(locale, "notif.empty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={`/community/${n.postId}#comment-${n.commentId}`}
                className="flex items-start gap-3 border border-line bg-card p-3.5 transition-colors hover:border-paper/20"
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
                      {t(locale, n.type === "reply" ? "notif.reply" : "notif.comment")}
                    </span>
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-grey">
                    {n.postTitle}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-grey">
                  {relTime(n.createdAt, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
