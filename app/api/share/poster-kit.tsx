/* Shared visual parts of the four share posters (single source):
   palette / font stacks / margins / identity band / footer /
   contribution grid / metric band — all matching the usage poster
   (app/api/usage/share/UsageSharePoster.tsx) v3 language: dark ink
   #121212 base, hard edges and hairlines, mono, big numbers with small
   labels, 1080 wide (content-tiered height, see poster-sizes.ts),
   identity band (uppercase brand + blue accent + avatar + lowercase blue
   address + right slot) + QR footer. The QR uses @rc-component/qrcode's
   qrcodegen + generatePath inlined as SVG (same as the usage poster). */
import { Ecc, QrCode } from "@rc-component/qrcode/es/libs/qrcodegen";
import { generatePath } from "@rc-component/qrcode/es/utils";
import type { CSSProperties, ReactNode } from "react";
import { POSTER_ALPHA, POSTER_HEAT_SCALE, POSTER_PALETTE } from "@/src/lib/brand-palette";

/* Shared margins across all four (usage poster v3 values). */
export const POSTER_PADDING = "44px 54px 36px";

/* Palette source of truth: src/lib/brand-palette.ts (inlined official
   tokens; Satori has no CSS variables). Keeps the original export name
   `palette` — usage/post/work/profile posters share the same role
   colors. */
export const palette = POSTER_PALETTE;

/* Poster body font stack: JetBrains Mono fetched at runtime
   (poster-fonts.ts); on failure it falls back to next/og's embedded
   Geist, with CJK covered by next/og's dynamic Noto Sans SC. */
export const POSTER_FONT_FAMILY = "'JetBrains Mono', geist, monospace";

/* Every static Chinese label on the posters, for CJK bold-subset
   fetching (a missing glyph falls back to a dynamic weight). Covers all
   four: usage (flow/pulse/mix/footprint/arsenal/notes) + post/work/
   profile (votes/claims etc.). */
export const POSTER_STATIC_TEXT =
  "顶评论发布支持获赞帖子作品票共还有个选项已验证构建投入累计活跃天数加入声明者按可总量封近周" +
  "输入含缓存写输出推理读流向对数带宽上下文脉冲今日小时峰期值段命中每柱堆叠长连每格代表一单数据起止等价费用会话主力模型用量扫码看实时板标准计价估算本地私密同步不对话内容杠杆新鲜乘除未记录足迹半年九三二一四五六日构成公开快照身份阅读全文访问主页指标为渲染时数值查看";

/* Compact big numbers (same as the usage poster): K/M/B; below a
   thousand stays as-is. */
export function compact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

export function PosterQr({ url, size = 104 }: { url: string; size?: number }) {
  const margin = 1;
  const qr = QrCode.encodeText(url, Ecc.MEDIUM);
  const modules = qr.getModules();
  const n = modules.length + margin * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={`${url} QR code`}>
      <path fill={palette.paper} d={`M0,0 h${n}v${n}H0z`} shapeRendering="crispEdges" />
      <path fill={palette.background} d={generatePath(modules, margin)} shapeRendering="crispEdges" />
    </svg>
  );
}

/* Avatar initial circle (mint fill, ink text — same as the usage
   poster's identity band). */
export function InitialsCircle({ initials, size = 64 }: { initials: string; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        background: palette.green,
        color: palette.greenInk,
        fontSize: Math.round(size * 0.36),
        fontWeight: 800,
      }}
    >
      {initials}
    </div>
  );
}

/* Hairline-outlined mono chips (agent names / domains; lobehub icons
   can't be trusted under Satori). */
export function OutlineChip({ text, color = palette.muted }: { text: string; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        border: `1px solid ${palette.line}`,
        padding: "8px 16px",
        color,
        fontSize: 21,
        letterSpacing: 2,
      }}
    >
      {text}
    </div>
  );
}

/* Section eyebrow: large left, small right, all muted (same as the
   usage poster's Eyebrow). */
export function Eyebrow({ left, right }: { left: string; right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", color: palette.muted, fontSize: 15, letterSpacing: 3 }}>{left}</div>
      {right ? (
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 1.5 }}>{right}</div>
      ) : null}
    </div>
  );
}

/* Identity band (shared header of all four): brand row KIMI.BUILDERS /
   SECTION + right eyebrow + optional chip; identity row = avatar circle
   + name + @handle + blue lowercase address chip + a free right slot
   (aside). */
export function PosterHeader({
  section,
  eyebrow,
  chip,
  initials,
  name,
  handle,
  linkLabel,
  aside,
}: {
  section: string;
  eyebrow?: string;
  chip?: string;
  initials: string;
  name: string;
  /* No leading @; empty = external author (no handle/address
     rendered). */
  handle: string;
  linkLabel?: string;
  aside?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderBottom: `1px solid ${palette.line}`,
        paddingBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
          KIMI.BUILDERS{" "}
          <span style={{ display: "flex", marginLeft: 14, color: palette.blueBright }}>/ {section}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {eyebrow ? (
            <div style={{ display: "flex", color: palette.muted, fontSize: 15, letterSpacing: 3 }}>{eyebrow}</div>
          ) : null}
          {chip ? (
            <div
              style={{
                display: "flex",
                marginLeft: 18,
                border: `1px solid ${palette.line}`,
                padding: "6px 14px",
                fontSize: 14,
                letterSpacing: 2,
              }}
            >
              {chip}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 22, alignItems: "center" }}>
        <InitialsCircle initials={initials} size={64} />
        <div style={{ display: "flex", marginLeft: 18, flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{name}</div>
          {handle ? (
            <div style={{ display: "flex", marginTop: 7, alignItems: "center" }}>
              <div style={{ display: "flex", color: palette.muted, fontSize: 15 }}>@{handle}</div>
              {linkLabel ? (
                <div
                  style={{
                    display: "flex",
                    marginLeft: 14,
                    color: palette.blueBright,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  {linkLabel}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {aside ? (
          <div style={{ display: "flex", marginLeft: "auto", alignItems: "center" }}>{aside}</div>
        ) : null}
      </div>
    </div>
  );
}

/* Footer (shared): QR + main row (20/700) + scan-hint subrow (14
   muted) + right note (13 muted/ls1/lh1.8). */
export function PosterFooter({
  url,
  headline,
  scanHint,
  notes,
}: {
  url: string;
  headline: string;
  scanHint: string;
  notes: string[];
}) {
  return (
    <footer style={{ display: "flex", marginTop: 20, alignItems: "center" }}>
      <div style={{ display: "flex", padding: 8, background: palette.paper }}>
        <PosterQr url={url} />
      </div>
      <div style={{ display: "flex", marginLeft: 24, flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 20, fontWeight: 700 }}>{headline}</div>
        <div style={{ display: "flex", marginTop: 10, color: palette.muted, fontSize: 14 }}>{scanHint}</div>
      </div>
      <div
        style={{
          display: "flex",
          marginLeft: "auto",
          flexDirection: "column",
          alignItems: "flex-end",
          color: palette.muted,
          fontSize: 13,
          letterSpacing: 1,
          lineHeight: 1.8,
        }}
      >
        {notes.map((note) => (
          <span key={note} style={{ display: "flex" }}>
            {note}
          </span>
        ))}
      </div>
    </footer>
  );
}

/* Metric cell (same as the usage poster's FooterMetric): small
   wide-tracked label + big number. */
export function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", padding: "0 25px" }}>
      <div style={{ display: "flex", color: palette.muted, fontSize: 20, letterSpacing: 2 }}>{label}</div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          color,
          fontSize: 30,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* Metric band: several Metrics in one row separated by 1px vertical
   hairlines. The root must carry its own width:100% — wrapping it in a
   flex row collapses to content width. */
export function MetricBand({
  items,
  style,
}: {
  items: { label: string; value: string; color: string }[];
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", width: "100%", borderTop: `1px solid ${palette.line}`, borderBottom: `1px solid ${palette.line}`, padding: "18px 0", ...style }}>
      {items.map((item, index) => (
        <div key={item.label} style={{ display: "flex", flex: 1, minWidth: 0 }}>
          {index > 0 && <div style={{ display: "flex", width: 1, background: palette.line }} />}
          <Metric label={item.label} value={item.value} color={item.color} />
        </div>
      ))}
    </div>
  );
}

/* ---- Contribution grid (shared version of the usage poster's
   ContribGraph): month labels change with columns, Monday-anchored, 2px
   rounded cells, the official sequential blue ramp (#002F5B -> #00F6FF
   by intensity); the profile's 26-week activity map also renders here.
   ---- */
export const HEAT_COLORS = POSTER_HEAT_SCALE;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface ContribCell {
  key: string;
  level: number;
  future: boolean;
}

export function activityLevel(tokens: number, maximum: number): number {
  if (tokens <= 0 || maximum <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((Math.log1p(tokens) / Math.log1p(maximum)) * 4)));
}

/* A "last N weeks active" record -> contribution columns
   (Monday-anchored; future cells flagged future=true). */
export function contribColumns(activity: Record<string, number>, weeks: number): ContribCell[][] {
  const DAY = 86_400_000;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const startUtc = todayUtc - mondayOffset * DAY - (weeks - 1) * 7 * DAY;
  const maximum = Math.max(0, ...Object.values(activity));
  const columns: ContribCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const column: ContribCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const at = startUtc + (week * 7 + weekday) * DAY;
      const key = new Date(at).toISOString().slice(0, 10);
      column.push({
        key,
        level: activityLevel(activity[key] ?? 0, maximum),
        future: at > todayUtc,
      });
    }
    columns.push(column);
  }
  return columns;
}

export function ContribGrid({
  columns,
  eyebrow,
  headline,
  subline,
}: {
  columns: ContribCell[][];
  eyebrow: string;
  headline?: string;
  subline?: string;
}) {
  const monthLabels = columns.map((column, index) => {
    const month = column[0]?.key.slice(5, 7) ?? "";
    if (index > 0 && month === columns[index - 1][0]?.key.slice(5, 7)) return null;
    return MONTHS[Number(month) - 1] ?? null;
  });
  const weekdayNames = ["一", "", "三", "", "五", "", "日"];
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow left={eyebrow} right={headline} />
      <div style={{ display: "flex", marginTop: 12, marginLeft: 52, gap: 6 }}>
        {columns.map((_, index) => (
          <div key={`month-${index}`} style={{ display: "flex", flex: 1, color: palette.muted, fontSize: 11 }}>
            {monthLabels[index] ?? ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 6 }}>
        <div
          style={{
            display: "flex",
            width: 42,
            marginRight: 10,
            flexDirection: "column",
            gap: 5,
            color: palette.muted,
            fontSize: 11,
          }}
        >
          {weekdayNames.map((day, index) => (
            <span key={index} style={{ display: "flex", height: 16, alignItems: "center" }}>
              {day}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1, gap: 6 }}>
          {columns.map((column, columnIndex) => (
            <div key={`week-${columnIndex}`} style={{ display: "flex", flex: 1, flexDirection: "column", gap: 5 }}>
              {column.map((cell) => (
                <div
                  key={cell.key}
                  style={{
                    display: "flex",
                    height: 16,
                    borderRadius: 2,
                    background: cell.future ? palette.background : HEAT_COLORS[cell.level],
                    border: cell.future
                      ? `1px dashed ${palette.grid}`
                      : cell.level === 0
                        ? `1px solid ${palette.grid}`
                        : `1px solid ${POSTER_ALPHA.focusBorder25}`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13 }}>{subline ?? ""}</div>
        <div style={{ display: "flex", alignItems: "center", color: palette.muted, fontSize: 12, letterSpacing: 1 }}>
          <span style={{ display: "flex" }}>LESS</span>
          {HEAT_COLORS.map((color) => (
            <span
              key={color}
              style={{ display: "flex", width: 12, height: 12, marginLeft: 5, background: color, borderRadius: 2 }}
            />
          ))}
          <span style={{ display: "flex", marginLeft: 5 }}>MORE</span>
        </div>
      </div>
    </div>
  );
}
