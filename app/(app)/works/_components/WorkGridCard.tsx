/* Work card (grid variant): the "cover wall" view on /works and
   /awesome — cover on top (fixed 16:9), content below, two columns at
   sm / three at lg. A sibling of the row WorkCard (not a variant
   branch): deliberately lower information density — tagline relaxes to
   two lines, meta compresses to one (kind/status/first two agents; the
   featured star and claimed effort stay blue), scope is omitted by
   convention (the detail page shows it), and the bottom row reuses
   WorkCardFooter (compact: links reduced to icons). Hover language
   matches the row card: brighter border + slight cover zoom + blue
   title (group). The card-spanning link + z-10 interactive elements
   pattern matches the row card. */
import Link from "next/link";
import { agentName } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { mediaUrl } from "@/src/lib/storage";
import { workKindLabel } from "@/src/lib/work-kinds";
import type { WorkRow } from "@/src/lib/works";
import AgentIcon from "@/components/AgentIcon";
import WorkFeaturedToggle from "./WorkFeaturedToggle";
import WorkCardFooter from "./WorkCardFooter";
import { statusLabelOf, WorkMetaChips } from "./WorkCard";
import WorkScreenshot from "./WorkScreenshot";

export default function WorkGridCard({
  work: w,
  locale,
  meId,
  canFeature = false,
  claimBadge = null,
  claimPaused = false,
}: {
  work: WorkRow;
  locale: Locale;
  meId: number | null;
  canFeature?: boolean;
  claimBadge?: number | null;
  claimPaused?: boolean;
}) {
  const kindLabel = workKindLabel(w.kind, locale === "zh");
  const statusLabel = statusLabelOf(w.status, locale);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,translate] duration-base ease-standard hover:-translate-y-0.5 hover:border-paper/30">
      {/* Whole card links to the detail page; interactive elements below lift z-10 to keep their own navigation */}
      <Link
        href={`/works/${w.id}`}
        aria-label={w.name}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <div className="border-b border-line">
        <WorkScreenshot
          url={w.coverKey ? mediaUrl(w.coverKey) : w.screenshotUrl}
          name={w.name}
          logoUrl={w.logoKey ? mediaUrl(w.logoKey) : ""}
          kindLabel={kindLabel}
          kindId={w.kind}
          tone={w.coverTone}
          fit={w.coverFit}
          embedded
          variant="grid"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h2 className="truncate text-base font-semibold leading-snug text-paper transition-colors group-hover:text-ui-blue">
          {w.name}
        </h2>
        {w.tagline && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
            {w.tagline}
          </p>
        )}
        {/* Meta compressed to one row: status/agents/declaration/featured;
           blue reserved for declared effort and featured. The category is
           not repeated — the cover's name tile already carries the type
           eyebrow. Agents are icons only in grid view (max 3 + "+N", full
           names in the title tooltip) — card width is finite and names
           would blow out the meta row; full names stay visible on the
           detail page and row cards. */}
        <div className="mb-3 mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-grey">
          <WorkMetaChips
            w={w}
            locale={locale}
            statusLabel={statusLabel}
            kindLabel={kindLabel}
            showKind={false}
          />
          {w.agents.length > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1"
              title={w.agents.map((a) => agentName(a)).join(", ")}
            >
              {w.agents.slice(0, 3).map((a) => (
                <AgentIcon key={a} id={a} size={12} />
              ))}
              {w.agents.length > 3 && <span>+{w.agents.length - 3}</span>}
            </span>
          )}
          {claimBadge !== null && claimBadge > 0 && (
            <span className="shrink-0 text-ui-blue" title={t(locale, "works.badgeTitle")}>
              {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
            </span>
          )}
          {w.featuredAt && (
            <span className="shrink-0 text-ui-blue" title={w.featuredReason ?? undefined}>
              ★
            </span>
          )}
        </div>
        <WorkCardFooter work={w} locale={locale} meId={meId} compact />
        {claimPaused && meId !== null && w.userId === meId && (
          <p className="relative z-10 mt-2 rounded-lg bg-moon px-2 py-1.5 font-mono text-xs leading-relaxed text-grey">
            {t(locale, "works.claimPaused")}
          </p>
        )}
        {canFeature && (
          <div className="relative z-10 mt-2">
            <WorkFeaturedToggle
              workId={w.id}
              featuredReason={w.featuredAt ? (w.featuredReason ?? "") : null}
              locale={locale}
            />
          </div>
        )}
      </div>
    </article>
  );
}
