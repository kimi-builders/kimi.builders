/* 作品分享海报:品牌行 → 作品名 → tagline → agents 细线 chip
   → (opt-in)已验证构建投入 → 作者行 → 指标带(支持/评论/发布)→ QR 页脚。
   lobehub 图标在 Satori 里不可依赖,agents 统一细线描边 mono chip(名字即可)。 */
import type { WorkShareSnapshot } from "@/src/lib/share-posters";
import {
  BrandRow,
  InitialsCircle,
  MetricBand,
  OutlineChip,
  POSTER_FONT_FAMILY,
  PosterFooter,
  compact,
  palette,
} from "../../poster-kit";

export function WorkSharePoster({ snapshot }: { snapshot: WorkShareSnapshot }) {
  const s = snapshot;
  /* 作品名是 hero:按长度降档放大(短名字给足视觉重量,对齐用量海报大数字) */
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
        padding: "52px 58px 46px",
        fontFamily: POSTER_FONT_FAMILY,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", borderBottom: `1px solid ${palette.line}`, paddingBottom: 34 }}>
        <BrandRow section="WORKS" right="BUILDER MADE" />
        <div style={{ display: "flex", marginTop: 38, fontSize: nameSize, fontWeight: 800, lineHeight: 1.2 }}>
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
        {s.verifiedTokens !== null && (
          <div style={{ display: "flex", marginTop: 36, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 96, lineHeight: 0.9, fontWeight: 800, letterSpacing: -3, color: palette.green }}>
                {compact(s.verifiedTokens)}
              </div>
              <div style={{ display: "flex", marginTop: 16, color: palette.muted, fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>
                已验证构建投入 TOKENS
              </div>
            </div>
          </div>
        )}
      </header>

      <main style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", justifyContent: "center", padding: "30px 0 28px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <InitialsCircle initials={s.author.initials} />
          <div style={{ display: "flex", marginLeft: 20, flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 25, fontWeight: 700 }}>{s.author.name}</div>
            {s.author.handle && (
              <div style={{ display: "flex", marginTop: 6, color: palette.muted, fontSize: 19 }}>@{s.author.handle}</div>
            )}
          </div>
        </div>
        <MetricBand
          style={{ marginTop: 25 }}
          items={[
            { label: "支持", value: compact(s.voteCount), color: palette.blue },
            { label: "评论", value: compact(s.commentCount), color: palette.green },
            { label: "发布", value: s.publishedAt, color: palette.paper },
          ]}
        />
      </main>

      <PosterFooter
        url={s.url}
        headline={s.author.handle ? `@${s.author.handle} · ${s.publishedAt}` : s.publishedAt}
        linkLabel={s.url.replace("https://", "")}
        notes={["SCAN TO VIEW THE WORK", "METRICS AT RENDER TIME"]}
      />
    </div>
  );
}
