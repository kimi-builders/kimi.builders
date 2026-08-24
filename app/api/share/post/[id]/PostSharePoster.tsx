/* Post share poster: shared identity band (author + category chip + type
   badge) -> a vertically centered content group (headline -> excerpt ->
   link/poll -> metric band) -> the shared QR footer. Layout: the content
   group centers vertically with fixed inner gaps — rich content
   (excerpt/poll) fills naturally, sparse content (short text posts)
   leaves symmetric whitespace; never stretched apart with
   space-between. Sparse case (no excerpt, not a poll/link post): the
   headline scales up by length tier (same idea as the work poster) plus
   two restrained ornaments — a large low-opacity quote mark and a
   blue-square hairline — to fill the visual field in the hard-edge
   hairline language. */
import type { PostShareSnapshot } from "@/src/lib/share-posters";
import type { Locale } from "@/src/lib/i18n";
import {
  MetricBand,
  OutlineChip,
  POSTER_FONT_FAMILY,
  POSTER_PADDING,
  PosterFooter,
  PosterHeader,
  compact,
  palette,
} from "../../poster-kit";

function PollBlock({
  snapshot,
  locale,
}: {
  snapshot: PostShareSnapshot;
  locale: Locale;
}) {
  const poll = snapshot.poll;
  if (!poll) return null;
  const zh = locale === "zh";
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  return (
    <div style={{ display: "flex", marginTop: 30, flexDirection: "column", border: `1px solid ${palette.line}`, padding: "22px 26px" }}>
      {poll.options.map((o) => {
        const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
        return (
          <div key={o.label} style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div style={{ display: "flex", fontSize: 24, color: palette.paper }}>{o.label}</div>
              <div style={{ display: "flex", marginLeft: 20, fontSize: 20, color: palette.muted, whiteSpace: "nowrap" }}>
                {zh ? `${o.votes} 票` : `${o.votes} votes`} · {pct}%
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 9, height: 8, background: palette.surface }}>
              <div style={{ display: "flex", width: `${Math.max(2, (o.votes / max) * 100)}%`, background: palette.blue }} />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", fontSize: 19, color: palette.muted, letterSpacing: 2 }}>
        {zh
          ? `共 ${compact(poll.totalVotes)} 票${poll.more > 0 ? ` · 还有 ${poll.more} 个选项` : ""}`
          : `${compact(poll.totalVotes)} votes${poll.more > 0 ? ` · ${poll.more} more options` : ""}`}
      </div>
    </div>
  );
}

export function PostSharePoster({
  snapshot,
  locale,
}: {
  snapshot: PostShareSnapshot;
  locale: Locale;
}) {
  const s = snapshot;
  const zh = locale === "zh";
  /* Sparse = a short text post with only a title. */
  const sparse = !s.excerpt && !s.poll && !s.linkDomain;
  const titleSize = !sparse
    ? 56
    : s.title.length <= 20
      ? 84
      : s.title.length <= 40
        ? 72
        : 60;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        background: palette.background,
        color: palette.paper,
        padding: POSTER_PADDING,
        fontFamily: POSTER_FONT_FAMILY,
      }}
    >
      <PosterHeader
        section="COMMUNITY"
        eyebrow={s.type === "poll" ? "POLL" : s.type === "link" ? "LINK" : "THREAD"}
        chip={s.categoryLabel}
        initials={s.author.initials}
        name={s.author.name}
        handle={s.author.handle}
        linkLabel={`kimi.builders/u/${s.author.handle}`}
      />

      <main style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", justifyContent: "center", padding: "30px 0 28px" }}>
        {sparse && (
          <div style={{ display: "flex", fontSize: 150, fontWeight: 800, lineHeight: 0.75, color: palette.grid }}>
            “
          </div>
        )}
        {s.title && (
          <div style={{ display: "flex", marginTop: sparse ? 16 : 0, fontSize: titleSize, fontWeight: 800, lineHeight: 1.3 }}>
            {s.title}
          </div>
        )}
        {sparse && (
          <div style={{ display: "flex", marginTop: 34, alignItems: "center" }}>
            <div style={{ display: "flex", width: 10, height: 10, background: palette.blue }} />
            <div style={{ display: "flex", marginLeft: 14, flex: 1, height: 1, background: palette.line }} />
          </div>
        )}
        {s.excerpt && (
          <div style={{ display: "flex", marginTop: 24, fontSize: 28, lineHeight: 1.7, color: palette.muted }}>
            {s.excerpt}
          </div>
        )}
        {s.linkDomain && (
          <div style={{ display: "flex", marginTop: 26 }}>
            <OutlineChip text={s.linkDomain} color={palette.blue} />
          </div>
        )}
        <PollBlock snapshot={s} locale={locale} />

        <MetricBand
          style={{ marginTop: 40 }}
          items={[
            { label: zh ? "顶" : "UPVOTES", value: compact(s.score), color: palette.blue },
            { label: zh ? "评论" : "COMMENTS", value: compact(s.commentCount), color: palette.green },
            { label: zh ? "发布" : "PUBLISHED", value: s.publishedAt, color: palette.paper },
          ]}
        />
      </main>

      <PosterFooter
        url={s.url}
        headline={`@${s.author.handle} · ${s.publishedAt}`}
        scanHint={zh ? "扫码阅读全文" : "Scan to read the thread"}
        notes={zh ? ["公开帖子快照", "数据为渲染时口径"] : ["PUBLIC THREAD SNAPSHOT", "METRICS AT RENDER TIME"]}
      />
    </div>
  );
}
