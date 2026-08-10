/* 个人主页分享海报:品牌行 → 大头像字母圆 + 显示名 + @handle + 加入时间
   → 简介摘要 → (opt-in)用量行 → 统计带(帖子/评论/获赞/作品)→ QR 页脚。 */
import type { ProfileShareSnapshot } from "@/src/lib/share-posters";
import {
  BrandRow,
  InitialsCircle,
  MetricBand,
  POSTER_FONT_FAMILY,
  PosterFooter,
  compact,
  palette,
} from "../../poster-kit";

/* 近 26 周活跃热力图(GitHub 式:列=周,周日在上;UTC 日界,公共快照不随浏览者时区)。
   仅当本人 opt-in 公开用量时渲染(数据由 snapshot 门禁保证)。 */
function ActivityHeatmap({ activity }: { activity: Record<string, number> }) {
  const WEEKS = 26;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  // 起点:26 周窗口最早的周日
  const start = new Date(todayUtc - (WEEKS * 7 - 1) * 86_400_000);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const columns: { key: string; value: number }[][] = [];
  for (let week = 0; week < WEEKS + 1; week += 1) {
    const column: { key: string; value: number }[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = new Date(start.getTime() + (week * 7 + weekday) * 86_400_000);
      const key = day.toISOString().slice(0, 10);
      column.push({ key, value: day.getTime() > todayUtc ? -1 : (activity[key] ?? 0) });
    }
    columns.push(column);
  }
  const max = Math.max(1, ...Object.values(activity));
  const levelOf = (value: number): number => {
    if (value < 0) return -1; // 未来格
    if (value <= 0) return 0;
    const ratio = value / max;
    if (ratio < 0.05) return 1;
    if (ratio < 0.2) return 2;
    if (ratio < 0.45) return 3;
    if (ratio < 0.75) return 4;
    return 5;
  };
  const CELL = 26;
  const GAP = 5;
  const levelBg = ["#161a1f", "#0e2f5e", "#1250a8", "#1478ff", "#5ca6ff", "#a9d1ff"];
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>
          近 26 周活跃
        </div>
        <div style={{ display: "flex", marginLeft: "auto", color: palette.muted, fontSize: 17, letterSpacing: 2 }}>
          UTC
        </div>
      </div>
      <div style={{ display: "flex" }}>
        {columns.map((column, week) => (
          <div key={week} style={{ display: "flex", flexDirection: "column", marginRight: GAP }}>
            {column.map((cell) => {
              const level = levelOf(cell.value);
              return (
                <div
                  key={cell.key}
                  style={{
                    width: CELL,
                    height: CELL,
                    marginBottom: GAP,
                    background: level < 0 ? "transparent" : levelBg[level],
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

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
        padding: "52px 58px 46px",
        fontFamily: POSTER_FONT_FAMILY,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", borderBottom: `1px solid ${palette.line}`, paddingBottom: 30 }}>
        <BrandRow section="BUILDER" right="MAKER CARD" />
        <div style={{ display: "flex", marginTop: 40, alignItems: "center" }}>
          <InitialsCircle initials={s.initials} size={150} />
          <div style={{ display: "flex", marginLeft: 34, flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 800, lineHeight: 1.2 }}>{s.name}</div>
            <div style={{ display: "flex", marginTop: 12, color: palette.muted, fontSize: 28 }}>@{s.handle}</div>
            <div style={{ display: "flex", marginTop: 12, color: palette.muted, fontSize: 21, letterSpacing: 2 }}>
              {s.joinedAt} 加入
            </div>
          </div>
        </div>
        {s.bio && (
          <div style={{ display: "flex", marginTop: 32, fontSize: 30, lineHeight: 1.75, color: palette.muted }}>
            {s.bio}
          </div>
        )}
        {s.usage && (
          <div style={{ display: "flex", marginTop: 36, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 96, lineHeight: 0.9, fontWeight: 800, letterSpacing: -3, color: palette.blue }}>
                {compact(s.usage.totalTokens)}
              </div>
              <div style={{ display: "flex", marginTop: 16, color: palette.muted, fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>
                累计 TOKENS
              </div>
            </div>
            <div style={{ display: "flex", marginLeft: "auto", flexDirection: "column", paddingBottom: 4 }}>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>
                {s.usage.activeDays} 天
              </div>
              <div style={{ display: "flex", marginTop: 10, color: palette.muted, fontSize: 18, letterSpacing: 2 }}>
                活跃天数
              </div>
            </div>
          </div>
        )}
      </header>

      <main style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", justifyContent: "center", padding: "30px 0 28px" }}>
        {s.usage && s.usage.activity && (
          <ActivityHeatmap activity={s.usage.activity} />
        )}
        <MetricBand
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
        linkLabel={s.url.replace("https://", "")}
        notes={["PUBLIC PROFILE SNAPSHOT", "SCAN TO VISIT"]}
      />
    </div>
  );
}
