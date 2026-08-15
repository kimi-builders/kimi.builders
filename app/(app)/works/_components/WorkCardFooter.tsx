/* 作品卡片底行(行式/网格卡共用,20260918 抽取):作者(awesome 条目=GitHub
   原作者外链,成员作品=@handle 内链)+ 支持/访问/源码 + 作者操作。
   compact=网格卡:访问/源码只留图标(title 提示),节省纵向空间。
   交互元素自带 relative z-10,浮在整卡覆盖链接(P1-2)之上。 */
import Link from "next/link";
import { Code, ExternalLink, Heart } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import type { WorkRow } from "@/src/lib/works";
import Avatar from "@/components/Avatar";
import WorkOwnerActions from "./WorkOwnerActions";

export default function WorkCardFooter({
  work: w,
  locale,
  meId,
  compact = false,
}: {
  work: WorkRow;
  locale: Locale;
  meId: number | null;
  compact?: boolean;
}) {
  return (
    <div
      className={`mt-auto flex items-center border-t border-line pt-3 font-mono text-[11px] text-grey ${
        compact ? "gap-2" : "gap-3"
      }`}
    >
      {w.source === "awesome" && w.authorLabel ? (
        <span className="min-w-0 truncate">
          {/* 原作者 = GitHub 作者/团队,可点跳到 GitHub 主页(句柄形状校验,
              非句柄的自由文本降级为纯文本);推荐人按 2026-08-14 决定暂不展示 */}
          {/^[A-Za-z0-9-]{1,39}$/.test(w.authorLabel) ? (
            <a
              href={`https://github.com/${w.authorLabel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 transition-colors hover:text-blue"
            >
              {t(locale, "awesome.by", { name: w.authorLabel })}
            </a>
          ) : (
            t(locale, "awesome.by", { name: w.authorLabel })
          )}
        </span>
      ) : w.handle ? (
        <Link
          href={`/u/${w.handle}`}
          className="relative z-10 flex min-w-0 items-center gap-1.5 text-grey transition-colors hover:text-blue"
        >
          <Avatar url={w.avatarUrl} handle={w.handle} size={16} />
          <span className="truncate text-paper">@{w.handle}</span>
        </Link>
      ) : (
        <span className="truncate">
          {t(locale, "awesome.by", { name: w.authorLabel })}
        </span>
      )}
      <span
        className={`relative z-10 ml-auto flex shrink-0 items-center ${
          compact ? "gap-2" : "gap-3"
        }`}
      >
        {/* 支持数(P1-2):只读展示,投票在详情页 */}
        <span
          className="inline-flex items-center gap-1"
          title={t(locale, "works.support")}
        >
          <Heart size={12} />
          {w.voteCount}
        </span>
        {w.url && (
          <a
            href={w.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t(locale, "works.visit")}
            className="inline-flex items-center gap-1 transition-colors hover:text-blue"
          >
            <ExternalLink size={12} />
            {!compact && t(locale, "works.visit")}
          </a>
        )}
        {w.repoUrl && (
          <a
            href={w.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t(locale, "works.repo")}
            className="inline-flex items-center gap-1 transition-colors hover:text-blue"
          >
            {/* 网格卡紧凑态:仓库链接用 GitBranch 图标与「访问」外链区分 */}
            {compact ? <Code size={12} /> : null}
            {!compact && t(locale, "works.repo")}
          </a>
        )}
        {meId !== null && w.userId === meId && (
          <WorkOwnerActions workId={w.id} locale={locale} compact={compact} />
        )}
      </span>
    </div>
  );
}
