/* Profile share poster: shared identity band (the person + address chip
   + joined-date right slot) -> lifetime TOKENS hero (opt-in) -> bio ->
   26-week activity contribution grid (shared ContribGrid — same blue
   ramp / Monday anchoring / month labels as the usage poster) -> stats
   band (posts/comments/ups/works) -> the shared QR footer. The usage
   block renders only when the owner opted in (guaranteed by the
   snapshot gate). */
import type { ProfileShareSnapshot } from "@/src/lib/share-posters";
import {
  ContribGrid,
  MetricBand,
  POSTER_FONT_FAMILY,
  POSTER_PADDING,
  PosterFooter,
  PosterHeader,
  compact,
  contribColumns,
  palette,
} from "../../poster-kit";

export function ProfileSharePoster({ snapshot }: { snapshot: ProfileShareSnapshot }) {
  const s = snapshot;
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
        section="BUILDER"
        eyebrow="MAKER CARD"
        initials={s.initials}
        name={s.name}
        handle={s.handle}
        linkLabel={`kimi.builders/u/${s.handle}`}
        aside={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{s.joinedAt}</div>
            <div style={{ display: "flex", marginTop: 5, color: palette.muted, fontSize: 13, letterSpacing: 2 }}>
              加入时间 JOINED
            </div>
          </div>
        }
      />

      <main style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", justifyContent: "center", padding: "30px 0 28px" }}>
        {s.usage && (
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 96, lineHeight: 0.9, fontWeight: 800, letterSpacing: -3, color: palette.blue }}>
                {compact(s.usage.totalTokens)}
              </div>
              <div style={{ display: "flex", marginTop: 16, color: palette.muted, fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>
                累计 TOKENS
              </div>
            </div>
            <div style={{ display: "flex", marginLeft: "auto", flexDirection: "column", paddingBottom: 4 }}>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>{s.usage.activeDays} 天</div>
              <div style={{ display: "flex", marginTop: 10, color: palette.muted, fontSize: 18, letterSpacing: 2 }}>
                活跃天数
              </div>
            </div>
          </div>
        )}
        {s.bio && (
          <div style={{ display: "flex", marginTop: 32, fontSize: 28, lineHeight: 1.7, color: palette.muted }}>
            {s.bio}
          </div>
        )}
        {s.usage && (
          <div style={{ display: "flex", marginTop: 36, flexDirection: "column" }}>
            <ContribGrid
              columns={contribColumns(s.usage.activity, 26)}
              eyebrow="近 26 周活跃"
              subline="每格代表一天 · UTC 日界"
            />
          </div>
        )}
        <MetricBand
          style={{ marginTop: 36 }}
          items={[
            { label: "帖子", value: compact(s.stats.posts), color: palette.paper },
            { label: "评论", value: compact(s.stats.comments), color: palette.blue },
            { label: "获赞", value: compact(s.stats.likes), color: palette.green },
            { label: "作品", value: compact(s.stats.works), color: palette.amber },
          ]}
        />
      </main>

      <PosterFooter
        url={s.url}
        headline={`@${s.handle} · ${s.joinedAt} 加入`}
        scanHint="扫码访问主页"
        notes={["公开身份快照", "数据为渲染时口径"]}
      />
    </div>
  );
}
