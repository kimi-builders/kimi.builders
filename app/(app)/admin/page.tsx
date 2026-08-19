/* 管理台 /admin(20260830 社区治理):仅 admin/mod 可访问,其他人 404。
   四个页签:内容治理(帖子/评论/作品,按状态筛选)/ 用户治理(可搜索)/
   审计日志(倒序翻页)/ 位置洞察。所有写操作在 actions.ts 逐个鉴权并写审计。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import LoadMore from "@/components/LoadMore";
import Avatar from "@/components/Avatar";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { normalizeAnalyticsPeriod } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  activeMute,
  canModerate,
  getAdminUsers,
  getModerationContent,
  getModerationLog,
  isAdmin,
  type ModContentState,
  type ModTargetType,
} from "@/src/lib/moderation";
import {
  loadMoreAdminContentAction,
  loadMoreAdminLogAction,
} from "./actions";
import { renderContentRows, renderLogRows } from "./_components/admin-lists";
import AnalyticsInsights from "./_components/AnalyticsInsights";
import UserModControls from "./_components/UserModControls";

export const metadata: Metadata = { title: "管理 — kimi.builders" };

const CONTENT_TYPES = ["post", "comment", "work"] as const;
const CONTENT_STATES = ["all", "hidden", "deleted"] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    type?: string;
    state?: string;
    q?: string;
    period?: string;
  }>;
}) {
  const user = await getSessionUser();
  /* 非管理角色一律 404(不暴露管理台存在性) */
  if (!user || !canModerate(user.role)) notFound();
  const locale = await getLocale(user);
  const admin = isAdmin(user.role);

  const { tab, type, state, q, period: rawPeriod } = await searchParams;
  const activeTab =
    tab === "users" || tab === "log" || tab === "insights" ? tab : "content";
  const period = normalizeAnalyticsPeriod(rawPeriod);
  const activeType: ModTargetType = CONTENT_TYPES.some((x) => x === type)
    ? (type as ModTargetType)
    : "post";
  const activeState: ModContentState = CONTENT_STATES.some((x) => x === state)
    ? (state as ModContentState)
    : "all";

  const tabHref = (next: string) => (next === "content" ? "/admin" : `/admin?tab=${next}`);
  const contentHref = (t2: string, s2: string) =>
    `/admin?tab=content&type=${t2}&state=${s2}`;

  return (
    <div>
      <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[0.2px] text-paper">
        <ShieldCheck size={20} aria-hidden="true" />
        {t(locale, "admin.title")}
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-grey">
        {t(locale, "admin.subtitle")}
      </p>

      <nav className={`${SEG_WRAP} mt-5 w-fit`} aria-label={t(locale, "admin.title")}>
        {(
          [
            { key: "content", label: t(locale, "admin.tabContent") },
            { key: "users", label: t(locale, "admin.tabUsers") },
            { key: "log", label: t(locale, "admin.tabLog") },
            { key: "insights", label: t(locale, "admin.tabInsights") },
          ] as const
        ).map((item) => (
          <Link
            key={item.key}
            href={tabHref(item.key)}
            scroll={false}
            aria-current={activeTab === item.key ? "page" : undefined}
            className={`${SEG_ITEM} ${activeTab === item.key ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {activeTab === "content" && (
        <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className={SEG_WRAP}>
              {CONTENT_TYPES.map((x) => (
                <Link
                  key={x}
                  href={contentHref(x, activeState)}
                  scroll={false}
                  aria-current={activeType === x ? "page" : undefined}
                  className={`${SEG_ITEM} ${activeType === x ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
                >
                  {t(
                    locale,
                    x === "post"
                      ? "admin.typePost"
                      : x === "comment"
                        ? "admin.typeComment"
                        : "admin.typeWork",
                  )}
                </Link>
              ))}
            </div>
            <div className={SEG_WRAP}>
              {CONTENT_STATES.map((x) => (
                <Link
                  key={x}
                  href={contentHref(activeType, x)}
                  scroll={false}
                  aria-current={activeState === x ? "page" : undefined}
                  className={`${SEG_ITEM} ${activeState === x ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
                >
                  {t(
                    locale,
                    x === "all"
                      ? "admin.stateAll"
                      : x === "hidden"
                        ? "admin.stateHidden"
                        : "admin.stateDeleted",
                  )}
                </Link>
              ))}
            </div>
          </div>
          <AdminContentList
            type={activeType}
            state={activeState}
            locale={locale}
            isAdmin={admin}
          />
        </section>
      )}

      {activeTab === "users" && (
        <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <form method="GET" action="/admin" className="flex items-center gap-2">
            <input type="hidden" name="tab" value="users" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder={t(locale, "admin.userSearchPh")}
              maxLength={60}
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-paper transition-colors placeholder:text-grey/50 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10"
            />
            <button
              type="submit"
              className="min-h-9 shrink-0 rounded-lg border border-line px-4 font-mono text-xs text-paper transition-colors hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {t(locale, "admin.userSearch")}
            </button>
          </form>
          <AdminUserList q={q ?? ""} locale={locale} isAdmin={admin} />
        </section>
      )}

      {activeTab === "log" && (
        <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <AdminLogList locale={locale} />
        </section>
      )}

      {activeTab === "insights" && (
        <AnalyticsInsights locale={locale} period={period} />
      )}
    </div>
  );
}

async function AdminContentList({
  type,
  state,
  locale,
  isAdmin: admin,
}: {
  type: ModTargetType;
  state: ModContentState;
  locale: "zh" | "en";
  isAdmin: boolean;
}) {
  const data = await getModerationContent({ type, state });
  if (data.rows.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-line bg-bg/40 p-4 text-sm text-grey">
        {t(locale, "admin.empty")}
      </p>
    );
  }
  return (
    <div className="mt-3">
      {renderContentRows(data.rows, locale, admin)}
      <LoadMore
        key={`mod-${type}-${state}-${data.rows.length}-${data.nextCursor ?? "end"}-${locale}`}
        initialCursor={data.nextCursor}
        load={loadMoreAdminContentAction.bind(null, { type, state })}
        locale={locale}
      />
    </div>
  );
}

async function AdminUserList({
  q,
  locale,
  isAdmin: admin,
}: {
  q: string;
  locale: "zh" | "en";
  isAdmin: boolean;
}) {
  const data = await getAdminUsers({ q: q || undefined });
  if (data.rows.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-line bg-bg/40 p-4 text-sm text-grey">
        {t(locale, "admin.empty")}
      </p>
    );
  }
  return (
    <div className="mt-3">
      {data.rows.map((u) => {
        const muted = activeMute(u.mutedUntil) !== null;
        return (
          <div
            key={u.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3 last:border-b-0"
          >
            <Avatar url={null} handle={u.handle} size={28} className="shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] text-paper">
                <Link
                  href={`/u/${u.handle}`}
                  className="transition-colors hover:text-blue"
                >
                  {u.name || u.handle}
                </Link>
                <span className="ml-2 font-mono text-[11px] text-grey">@{u.handle}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-grey">
                <span
                  className={`rounded-md px-1.5 py-px ${
                    u.role === "member" ? "bg-paper/[0.07]" : "bg-blue/10 text-blue"
                  }`}
                >
                  {u.role}
                </span>
                {muted && (
                  <span className="rounded-md border border-status-danger/60 px-1.5 py-px text-status-danger-fg">
                    {t(locale, "admin.mutedBadge")}
                  </span>
                )}
                <span>{relTime(u.createdAt, locale)}</span>
              </span>
            </span>
            {/* admin 目标不可被处置(防御:不可降/不可禁言/不可重置);action 层同样拒绝 */}
            {u.role !== "admin" && (
              <span className="ml-auto">
                <UserModControls
                  userId={u.id}
                  role={u.role}
                  muted={muted}
                  isAdmin={admin}
                  locale={locale}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

async function AdminLogList({ locale }: { locale: "zh" | "en" }) {
  const data = await getModerationLog();
  if (data.rows.length === 0) {
    return (
      <p className="mt-1 rounded-xl border border-line bg-bg/40 p-4 text-sm text-grey">
        {t(locale, "admin.emptyLog")}
      </p>
    );
  }
  return (
    <div>
      {renderLogRows(data.rows, locale)}
      <LoadMore
        key={`modlog-${data.rows.length}-${data.nextCursor ?? "end"}-${locale}`}
        initialCursor={data.nextCursor}
        load={loadMoreAdminLogAction}
        locale={locale}
      />
    </div>
  );
}
