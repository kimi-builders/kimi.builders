/* Work card bottom row (shared by row/grid cards): author (awesome
   entries link the GitHub original author externally; member works link
   @handle internally) + support/visit/source + owner actions.
   compact = grid card: visit/source keep icons only (title tooltips) to
   save vertical space. Interactive elements carry relative z-10 above
   the card's overlay link. */
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
      className={`mt-auto flex items-center border-t border-line pt-3 text-xs text-grey ${
        compact ? "gap-2" : "gap-3"
      }`}
    >
      {w.source === "awesome" && w.authorLabel ? (
        <span className="min-w-0 truncate">
          {/* Original author = GitHub author/org: handle-shaped values link
              to the GitHub profile, free-form text degrades to plain text.
              The recommender is deliberately not shown here. */}
          {/^[A-Za-z0-9-]{1,39}$/.test(w.authorLabel) ? (
            <a
              href={`https://github.com/${w.authorLabel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 inline-flex min-h-9 items-center rounded-lg px-2 transition-colors hover:bg-moon hover:text-ui-blue"
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
          className="relative z-10 flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg px-2 text-grey transition-colors hover:bg-moon hover:text-ui-blue"
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
        {/* Support count: read-only here; voting happens on the detail page */}
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
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 transition-colors hover:bg-moon hover:text-ui-blue"
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
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 transition-colors hover:bg-moon hover:text-ui-blue"
          >
            {/* Compact grid-card mode: the repo link uses a GitBranch icon to stand apart from the "visit" external link */}
            {compact ? <Code size={12} /> : null}
            {!compact && t(locale, "works.repo")}
          </a>
        )}
        {meId !== null && w.userId === meId && (
          <WorkOwnerActions
            workId={w.id}
            locale={locale}
            compact={compact}
            openUp
          />
        )}
      </span>
    </div>
  );
}
