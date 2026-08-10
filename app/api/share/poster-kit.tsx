/* 三种分享海报(S5-2)的共享视觉件:色板 / 尺寸 / QR / 品牌行 / 指标格,
   全部对齐用量海报(app/api/usage/share/UsageSharePoster.tsx)的视觉语言 ——
   深色 #050607 底、硬边细线、mono、大数字小标签、1080×1440。
   QR 用 @rc-component/qrcode 的 qrcodegen + generatePath 内联 SVG(同用量海报)。 */
import { Ecc, QrCode } from "@rc-component/qrcode/es/libs/qrcodegen";
import { generatePath } from "@rc-component/qrcode/es/utils";
import type { CSSProperties } from "react";

export const POSTER_SIZE = { width: 1080, height: 1440 } as const;

export const palette = {
  background: "#050607",
  paper: "#f4f6f8",
  muted: "#8a9099",
  line: "#252a31",
  blue: "#1478ff",
  green: "#20d39a",
  amber: "#f6a609",
};

/* 海报正文字体栈:JetBrains Mono 运行时拉取(poster-fonts.ts);拉不到时
   落回 next/og 内嵌的 geist,CJK 由 next/og 动态 Noto Sans SC 兜底。 */
export const POSTER_FONT_FAMILY = "'JetBrains Mono', geist, monospace";

/* 三种海报里全部静态中文标签,供 CJK 粗体子集抓取(漏字会回退动态 400)。 */
export const POSTER_STATIC_TEXT =
  "顶评论发布支持获赞帖子作品票共还有个选项已验证构建投入累计活跃天数加入";

/* 大数字紧凑格式(同用量海报):K/M/B,千位以下原样。 */
export function compact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

export function PosterQr({ url, size = 112 }: { url: string; size?: number }) {
  const margin = 1;
  const qr = QrCode.encodeText(url, Ecc.MEDIUM);
  const modules = qr.getModules();
  const n = modules.length + margin * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={`${url} QR code`}>
      <path fill="#ffffff" d={`M0,0 h${n}v${n}H0z`} shapeRendering="crispEdges" />
      <path fill="#050607" d={generatePath(modules, margin)} shapeRendering="crispEdges" />
    </svg>
  );
}

/* 品牌行:kimi.builders / SECTION + 右侧 eyebrow。 */
export function BrandRow({ section, right }: { section: string; right: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 24, fontWeight: 700, letterSpacing: 5 }}>
        kimi.builders <span style={{ display: "flex", marginLeft: 18, color: palette.muted }}>/ {section}</span>
      </div>
      <div style={{ display: "flex", color: palette.muted, fontSize: 19, letterSpacing: 3 }}>{right}</div>
    </div>
  );
}

/* 指标格(用量海报 FooterMetric 同款):小标签大字距 + 大数字。 */
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

/* 指标带:一行多个 Metric,中间 1px 竖分隔线(硬边细线)。
   根节点必须自带 width:100% —— 套一层 flex 行包装会塌成内容宽度。 */
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

/* 头像字母圆(用量海报同款绿底深字)。 */
export function InitialsCircle({ initials, size = 68 }: { initials: string; size?: number }) {
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
        color: "#032a20",
        fontSize: Math.round(size * 0.35),
        fontWeight: 800,
      }}
    >
      {initials}
    </div>
  );
}

/* 细线描边 mono chip(agents 名 / 域名等;lobehub 图标在 Satori 里不可依赖)。 */
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

/* 页脚:QR + 中间说明行(主行 + 蓝色 URL)+ 右侧口径小字。 */
export function PosterFooter({
  url,
  headline,
  linkLabel,
  notes,
}: {
  url: string;
  headline: string;
  linkLabel: string;
  notes: string[];
}) {
  return (
    <footer style={{ display: "flex", borderTop: `1px solid ${palette.line}`, paddingTop: 24, alignItems: "center" }}>
      <div style={{ display: "flex", padding: 9, background: "#ffffff" }}>
        <PosterQr url={url} />
      </div>
      <div style={{ display: "flex", marginLeft: 26, flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{headline}</div>
        <div style={{ display: "flex", marginTop: 11, color: palette.blue, fontSize: 24, fontWeight: 700 }}>{linkLabel}</div>
      </div>
      <div style={{ display: "flex", marginLeft: "auto", maxWidth: 310, flexDirection: "column", color: palette.muted, fontSize: 16, lineHeight: 1.55 }}>
        {notes.map((note) => (
          <span key={note} style={{ display: "flex" }}>{note}</span>
        ))}
      </div>
    </footer>
  );
}
