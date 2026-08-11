/* 作品分享海报:共享身份带(作者)→ 作品名 hero → tagline → agents 细线 chip
   → (已声明且不变式满足)声明构建投入 hero → 指标带(支持/评论/发布)→ 共享 QR 页脚。
   hero 为声明制(20260822_work_claims):数字 = 作者声明的本作品构建投入,
   小字口径 = 作者声明、系统按可验证总量封顶;未声明/超额 = 不渲染。
   lobehub 图标在 Satori 里不可依赖,agents 统一细线描边 mono chip(名字即可)。 */
import type { WorkShareSnapshot } from "@/src/lib/share-posters";
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
        padding: POSTER_PADDING,
        fontFamily: POSTER_FONT_FAMILY,
      }}
    >
      <PosterHeader
        section="WORKS"
        eyebrow="BUILDER MADE"
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
                声明构建投入 TOKENS · 作者声明按可验证总量封顶
              </div>
            </div>
          </div>
        )}
        <MetricBand
          style={{ marginTop: 40 }}
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
        scanHint="扫码查看作品"
        notes={["公开作品快照", "指标为渲染时数值"]}
      />
    </div>
  );
}
