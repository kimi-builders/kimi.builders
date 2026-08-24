/* Work share poster: shared identity band (author) -> work name hero ->
   tagline -> agent hairline chips -> (claimed and invariant holding)
   declared-token hero -> metric band (supports/comments/published) ->
   the shared QR footer. The number is Builder-reported and capped by
   synced aggregate usage; it is not precise per-project usage.
   Unclaimed or over-cap values are never rendered. lobehub
   icons can't be trusted under Satori, so agents are uniformly
   hairline mono chips (names suffice). */
import type { WorkShareSnapshot } from "@/src/lib/share-posters";
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

export function WorkSharePoster({
  snapshot,
  locale,
}: {
  snapshot: WorkShareSnapshot;
  locale: Locale;
}) {
  const s = snapshot;
  const zh = locale === "zh";
  /* The work name is the hero: scale up by shorter length tiers (short
     names get full visual weight, like the usage poster's big numbers). */
  const nameSize = s.name.length <= 12 ? 88 : s.name.length <= 24 ? 72 : 58;
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
        section="WORKS"
        eyebrow="MEMBER WORK"
        initials={s.author.initials}
        name={s.author.name}
        handle={s.author.handle}
        linkLabel={s.author.handle ? `kimi.builders/u/${s.author.handle}` : undefined}
      />

      <main style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", justifyContent: "center", padding: "30px 0 28px" }}>
        <div style={{ display: "flex", fontSize: nameSize, fontWeight: 800, lineHeight: 1.2 }}>
          {s.name}
        </div>
        {s.tagline && (
          <div style={{ display: "flex", marginTop: 26, fontSize: 30, lineHeight: 1.7, color: palette.muted }}>
            {s.tagline}
          </div>
        )}
        {s.agents.length > 0 && (
          <div style={{ display: "flex", marginTop: 30, flexWrap: "wrap", gap: 12 }}>
            {s.agents.map((name) => (
              <OutlineChip key={name} text={name} />
            ))}
            {s.agentsMore > 0 && <OutlineChip text={`+${s.agentsMore}`} />}
          </div>
        )}
        {s.claimedTokens !== null && (
          <div style={{ display: "flex", marginTop: 36, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 96, lineHeight: 0.9, fontWeight: 800, letterSpacing: -3, color: palette.green }}>
                {compact(s.claimedTokens)}
              </div>
              <div style={{ display: "flex", marginTop: 16, color: palette.muted, fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>
                {zh
                  ? "作者声明 TOKEN · 按已同步总用量封顶 · 非单作品精确用量"
                  : "AUTHOR-DECLARED TOKENS · CAPPED BY SYNCED TOTAL · NOT EXACT PROJECT USAGE"}
              </div>
            </div>
          </div>
        )}
        <MetricBand
          style={{ marginTop: 40 }}
          items={[
            { label: zh ? "支持" : "SUPPORT", value: compact(s.voteCount), color: palette.blue },
            { label: zh ? "评论" : "COMMENTS", value: compact(s.commentCount), color: palette.green },
            { label: zh ? "发布" : "PUBLISHED", value: s.publishedAt, color: palette.paper },
          ]}
        />
      </main>

      <PosterFooter
        url={s.url}
        headline={s.author.handle ? `@${s.author.handle} · ${s.publishedAt}` : s.publishedAt}
        scanHint={zh ? "扫码查看作品" : "Scan to open the project"}
        notes={zh ? ["公开作品快照", "指标为渲染时数值"] : ["PUBLIC PROJECT SNAPSHOT", "METRICS AT RENDER TIME"]}
      />
    </div>
  );
}
