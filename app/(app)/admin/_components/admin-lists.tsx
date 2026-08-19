/* /admin 列表行的服务端渲染(首屏 SSR 与「加载更多」action 共用,同 works-page 模式)。
   内容行:状态徽标(私密/已屏蔽/已删除)+ 标题/作者/时间 + ModToolbar 操作。
   日志行:操作者/动作/对象/原因/时间。 */
import Link from "next/link";
import type { ReactNode } from "react";
import { relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import type { ModContentRow, ModLogRow } from "@/src/lib/moderation";
import ModToolbar from "./ModToolbar";

const BADGE = "rounded-md px-1.5 py-px font-mono text-xs font-medium";

export function contentHref(row: ModContentRow): string {
  if (row.type === "post") return `/community/${row.id}`;
  if (row.type === "work") return `/works/${row.id}`;
  return `/community/${row.postId}#comment-${row.id}`;
}

export function renderContentRows(
  rows: ModContentRow[],
  locale: Locale,
  isAdmin: boolean,
): ReactNode[] {
  return rows.map((r) => (
    <div
      key={`${r.type}-${r.id}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line py-3 last:border-b-0"
    >
      <span className="flex items-center gap-1.5">
        {r.deletedAt && (
          <span className={`${BADGE} bg-paper/[0.07] text-grey`}>
            {t(locale, "admin.stateDeleted")}
          </span>
        )}
        {r.hiddenAt && (
          <span
            className={`${BADGE} border border-status-danger/60 text-status-danger-fg`}
            title={r.hiddenReason ?? undefined}
          >
            {t(locale, "mod.hiddenBadge")}
          </span>
        )}
        {r.visibility === "private" && (
          <span className={`${BADGE} border border-line text-grey`}>
            {t(locale, "post.private")}
          </span>
        )}
        {r.source === "awesome" && (
          <span className={`${BADGE} bg-blue/10 text-blue`}>Awesome</span>
        )}
      </span>
      <Link
        href={contentHref(r)}
        className="min-w-0 flex-1 truncate text-sm text-paper transition-colors hover:text-ui-blue"
      >
        {r.title || "—"}
      </Link>
      <span className="shrink-0 font-mono text-xs text-grey">
        {r.authorHandle ? `@${r.authorHandle}` : "—"}
        {" · "}
        {relTime(r.createdAt, locale)}
      </span>
      <span className="shrink-0">
        <ModToolbar
          targetType={r.type}
          targetId={r.id}
          hidden={!!r.hiddenAt}
          isAdmin={isAdmin}
          locale={locale}
        />
      </span>
    </div>
  ));
}

const ACTION_KEY: Record<string, "admin.actHide" | "admin.actUnhide" | "admin.actDelete" | "admin.actHardDelete" | "admin.actMute" | "admin.actUnmute" | "admin.actProfileReset" | "admin.actRoleGrant" | "admin.actRoleRevoke"> = {
  hide: "admin.actHide",
  unhide: "admin.actUnhide",
  delete: "admin.actDelete",
  hard_delete: "admin.actHardDelete",
  mute: "admin.actMute",
  unmute: "admin.actUnmute",
  profile_reset: "admin.actProfileReset",
  role_grant: "admin.actRoleGrant",
  role_revoke: "admin.actRoleRevoke",
};

const TARGET_KEY: Record<string, "admin.typePost" | "admin.typeComment" | "admin.typeWork" | "admin.typeUser"> = {
  post: "admin.typePost",
  comment: "admin.typeComment",
  work: "admin.typeWork",
  user: "admin.typeUser",
};

export function renderLogRows(rows: ModLogRow[], locale: Locale): ReactNode[] {
  return rows.map((r) => (
    <div
      key={r.id}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line py-2.5 font-mono text-xs last:border-b-0"
    >
      <span className="shrink-0 text-grey">{relTime(r.createdAt, locale)}</span>
      <span className="shrink-0 text-paper">
        {r.actorHandle ? `@${r.actorHandle}` : "—"}
      </span>
      <span className="shrink-0 rounded-md bg-blue/10 px-1.5 py-px text-xs font-medium text-blue">
        {t(locale, ACTION_KEY[r.action] ?? "admin.actHide")}
      </span>
      <span className="min-w-0 truncate text-grey">
        {t(locale, TARGET_KEY[r.targetType] ?? "admin.typePost")} #{r.targetId}
      </span>
      {r.reason && (
        <span className="min-w-0 flex-1 truncate text-grey/80" title={r.reason}>
          {r.reason}
        </span>
      )}
    </div>
  ));
}
