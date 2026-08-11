/* 帖子分享海报:共享身份带(作者 + 分类 chip + 类型徽章)→ 垂直居中的内容组
   (大标题 → 摘要 → 链接/投票 → 指标带)→ 共享 QR 页脚。
   版式:内容组整体垂直居中(组内固定间距),多内容(摘要/投票)自然撑满,
   少内容(短文本帖)上下留白对称 —— 不用 space-between 摊开。
   稀疏情形(无摘要且非投票/链接帖):标题按长度分档放大(同作品海报思路),
   并加大号低透明引号 + 蓝方块细线两件克制装饰填视觉(硬边细线语言)。 */
import type { PostShareSnapshot } from "@/src/lib/share-posters";
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

function PollBlock({ snapshot }: { snapshot: PostShareSnapshot }) {
  const poll = snapshot.poll;
  if (!poll) return null;
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
                {o.votes} 票 · {pct}%
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 9, height: 8, background: "#11151a" }}>
              <div style={{ display: "flex", width: `${Math.max(2, (o.votes / max) * 100)}%`, background: palette.blue }} />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", fontSize: 19, color: palette.muted, letterSpacing: 2 }}>
        共 {compact(poll.totalVotes)} 票{poll.more > 0 ? ` · 还有 ${poll.more} 个选项` : ""}
      </div>
    </div>
  );
}

export function PostSharePoster({ snapshot }: { snapshot: PostShareSnapshot }) {
  const s = snapshot;
  /* 稀疏 = 只有标题的纯文本短帖 */
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
          <div style={{ display: "flex", fontSize: 150, fontWeight: 800, lineHeight: 0.75, color: "#10151b" }}>
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
        <PollBlock snapshot={s} />

        <MetricBand
          style={{ marginTop: 40 }}
          items={[
            { label: "顶", value: compact(s.score), color: palette.blue },
            { label: "评论", value: compact(s.commentCount), color: palette.green },
            { label: "发布", value: s.publishedAt, color: palette.paper },
          ]}
        />
      </main>

      <PosterFooter
        url={s.url}
        headline={`@${s.author.handle} · ${s.publishedAt}`}
        scanHint="扫码阅读全文"
        notes={["公开帖子快照", "数据为渲染时口径"]}
      />
    </div>
  );
}
