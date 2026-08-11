import { Ecc, QrCode } from "@rc-component/qrcode/es/libs/qrcodegen";
import { generatePath } from "@rc-component/qrcode/es/utils";
import type { UsageShareFlow, UsageShareSnapshot } from "@/src/lib/usage/share";
import { TOOL_GLYPHS } from "./tool-glyphs";
import { MODEL_GLYPHS, modelGlyphId } from "./model-glyphs";

export const USAGE_SHARE_POSTER_SIZE = { width: 1080, height: 1440 } as const;

const palette = {
  background: "#050607",
  paper: "#f4f6f8",
  muted: "#8a9099",
  line: "#252a31",
  grid: "#1b2027",
  blue: "#1478ff",
  blueBright: "#54a3ff",
  green: "#20d39a",
  greenInk: "#03291f",
  amber: "#f6a609",
};

/* 堆叠四段配色:与 usage 页趋势图(TrendCore 的 FILL_*)同 hue,改色两边同步。 */
const STACK_INPUT = palette.blue;
const STACK_CACHE = "#34d399";
const STACK_OUTPUT = "rgba(244,246,248,0.72)";
const STACK_REASONING = "#fbbf24";

const CONTENT_WIDTH = 972;
/* 热图蓝阶(0=无数据 → 4=峰值),向站点热图的蓝阶观感对齐。 */
const HEAT_COLORS = ["#10141a", "#0d2f51", "#0f5385", "#0e7cc0", palette.blue];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAYS_EN = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function compact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

function dollars(micros: number): string {
  const value = micros / 1_000_000;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function safeMetric(value: string, maximum = 24): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}

function spanText(span: { from: string; to: string }, zh: boolean): string {
  const [fromYear, fromMonth] = span.from.split("-").map(Number);
  const [toYear, toMonth] = span.to.split("-").map(Number);
  /* zh 不用英文月名:2025.11 — 2026.08 */
  if (zh) {
    return `${fromYear}.${String(fromMonth).padStart(2, "0")} — ${toYear}.${String(toMonth).padStart(2, "0")}`;
  }
  const from = MONTHS[(fromMonth || 1) - 1] ?? "—";
  const to = MONTHS[(toMonth || 1) - 1] ?? "—";
  return fromYear === toYear
    ? `${fromYear} · ${from} — ${to}`
    : `${fromYear} · ${from} — ${toYear} · ${to}`;
}

/* 对数带宽:以缓存读为锚,指数 4 放大差距(纯 log 下 130M 与 3.6B 几乎同宽)。 */
function flowHeight(value: number, anchor: number, maximum: number, minimum: number): number {
  if (value <= 0 || anchor <= 0) return minimum;
  const ratio = Math.log10(1 + value) / Math.log10(1 + anchor);
  return Math.max(minimum, Math.min(maximum, Math.round(maximum * ratio ** 4)));
}

function Eyebrow({ left, right }: { left: string; right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", color: palette.muted, fontSize: 15, letterSpacing: 3 }}>{left}</div>
      {right ? (
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 1.5 }}>{right}</div>
      ) : null}
    </div>
  );
}

function FlowSankey({ flow, zh }: { flow: UsageShareFlow; zh: boolean }) {
  const height = 168;
  const anchor = Math.max(flow.cacheReadTokens, flow.inputTokens, flow.outputTokens, flow.reasoningTokens, 1);
  const inputHeight = flowHeight(flow.inputTokens, anchor, 58, 14);
  const outputHeight = flowHeight(flow.outputTokens, anchor, 34, 9);
  const reasoningHeight = flowHeight(flow.reasoningTokens, anchor, 40, 9);
  const inputTop = 108 - inputHeight;
  const green = `M 0 108 C 200 108, 290 16, 460 16 C 550 16, 610 44, 640 78 L 640 130 C 610 164, 550 168, 460 168 L 0 168 Z`;
  const output = `M 640 78 C 740 76, 780 36, 856 32 L 856 ${32 + outputHeight} C 780 ${36 + outputHeight}, 740 100, 640 100 Z`;
  const reasoning = `M 640 102 C 740 104, 780 96, 856 92 L 856 ${92 + reasoningHeight} C 780 ${96 + reasoningHeight}, 740 132, 640 132 Z`;
  return (
    <div style={{ display: "flex", position: "relative", width: CONTENT_WIDTH, height }}>
      <svg width={CONTENT_WIDTH} height={height} viewBox={`0 0 ${CONTENT_WIDTH} 168`}>
        <defs>
          <pattern id="cacheDots" width="15" height="15" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.7" fill="rgba(3,41,31,0.4)" />
          </pattern>
        </defs>
        <path d={green} fill={palette.green} />
        <path d={green} fill="url(#cacheDots)" />
        <path d={output} fill={palette.blue} />
        <path d={reasoning} fill={palette.amber} />
        <rect x="0" y={inputTop} width="40" height={inputHeight} fill="#39424e" />
        <rect x="0" y={inputTop} width="40" height="4" fill={palette.blueBright} />
      </svg>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, flexDirection: "column" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 2 }}>
          {zh ? "输入" : "INPUT"}
        </div>
        <div style={{ display: "flex", marginTop: 4, color: palette.paper, fontSize: 19, fontWeight: 700 }}>
          {compact(flow.inputTokens)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", left: 222, top: 84, flexDirection: "column" }}>
        <div style={{ display: "flex", color: palette.greenInk, fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>
          {zh ? "缓存读" : "CACHE READ"}
        </div>
        <div style={{ display: "flex", marginTop: 3, color: palette.greenInk, fontSize: 34, fontWeight: 800 }}>
          {compact(flow.cacheReadTokens)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", right: 0, top: 22, flexDirection: "column", alignItems: "flex-start" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 2 }}>
          {zh ? "输出" : "OUTPUT"}
        </div>
        <div style={{ display: "flex", marginTop: 3, color: palette.blueBright, fontSize: 19, fontWeight: 700 }}>
          {compact(flow.outputTokens)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", right: 0, top: 96, flexDirection: "column", alignItems: "flex-start" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 2 }}>
          {zh ? "推理" : "REASONING"}
        </div>
        <div style={{ display: "flex", marginTop: 3, color: palette.amber, fontSize: 19, fontWeight: 700 }}>
          {compact(flow.reasoningTokens)}
        </div>
      </div>
    </div>
  );
}

/* 中段主图(hours/days/stacked):SVG 堆叠柱 + 实线网格 + mono Y 刻度,
   语法对齐 usage 页 TrendCore;30d 堆叠加 7 日均值虚线。 */
function TrendChart({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  const zh = snapshot.zh;
  const cells = main.cells;
  const n = Math.max(1, cells.length);
  /* hours(today/24H)与 30d 同为四段堆叠;7 日均值虚线只给 30d。 */
  const stacked = main.kind === "stacked" || main.kind === "hours";
  const width = CONTENT_WIDTH;
  const padL = 46;
  const padR = 4;
  const padT = 8;
  const padB = 26;
  const plotH = 228;
  const height = padT + plotH + padB;
  const maximum = Math.max(1, ...cells.map((cell) => cell.tokens));
  const slot = (width - padL - padR) / n;
  const barW = Math.max(3, Math.round(slot * 0.62));
  const y = (value: number) => padT + plotH - (value / maximum) * plotH;
  const ticks = [0, 1, 2, 3, 4].map((step) => (maximum * step) / 4);
  /* 退化数据(max≤1)下 compact 刻度会撞车(1,1,1,0,0):相邻去重,只标首个。 */
  const tickLabels = ticks.map((tick, index) => {
    const text = compact(tick);
    return index > 0 && text === compact(ticks[index - 1]) ? null : text;
  });

  let maPath: string | null = null;
  if (main.kind === "stacked" && n > 1) {
    const points = cells.map((_, index) => {
      const from = Math.max(0, index - 6);
      const windowItems = cells.slice(from, index + 1);
      const mean = windowItems.reduce((sum, item) => sum + item.tokens, 0) / windowItems.length;
      return [padL + index * slot + slot / 2, y(mean)] as const;
    });
    maPath = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let index = 1; index < points.length; index += 1) {
      const [x1, y1] = points[index - 1];
      const [x2, y2] = points[index];
      const midX = (x1 + x2) / 2;
      maPath += ` C${midX.toFixed(1)},${y1.toFixed(1)} ${midX.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
  }

  const labelStep = Math.max(1, Math.ceil(n / 8));
  const labelOf = (cell: (typeof cells)[number], index: number): string | null => {
    /* 末格必标;其余按 step 稀疏,且与末格至少隔一个 step(防右端两签挤一起)。 */
    if (index !== n - 1 && (index % labelStep !== 0 || n - 1 - index < labelStep)) return null;
    if (main.kind === "hours") {
      /* mock 的日 key 不含小时位,退化为序号;today 只标小时,24H 带日期。 */
      if (cell.key.length <= 13) return String(index % 24).padStart(2, "0");
      return snapshot.range === "today" ? cell.key.slice(11, 13) : cell.key.slice(5);
    }
    return cell.key.slice(5);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow left={main.eyebrow} right={stacked ? main.headline : `${main.headline} · ${main.subline}`} />
      {stacked ? (
        <div style={{ display: "flex", marginTop: 10, alignItems: "center", color: palette.muted, fontSize: 12 }}>
          {[
            { label: zh ? "输入(含缓存写)" : "INPUT", color: STACK_INPUT },
            { label: zh ? "缓存读" : "CACHE", color: STACK_CACHE },
            { label: zh ? "输出" : "OUTPUT", color: STACK_OUTPUT },
            { label: zh ? "推理" : "REASONING", color: STACK_REASONING },
          ].map((item) => (
            <span key={item.label} style={{ display: "flex", alignItems: "center", marginRight: 16 }}>
              <span style={{ display: "flex", width: 10, height: 10, marginRight: 6, background: item.color }} />
              {item.label}
            </span>
          ))}
          <span style={{ display: "flex", marginLeft: "auto" }}>{main.subline}</span>
        </div>
      ) : null}
      <div style={{ display: "flex", position: "relative", width, height, marginTop: 8 }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {ticks.map((tick) => (
            <line
              key={tick}
              x1={padL}
              y1={y(tick)}
              x2={width - padR}
              y2={y(tick)}
              stroke={tick === 0 ? palette.line : palette.grid}
              strokeWidth={tick === 0 ? 1.2 : 1}
            />
          ))}
          {cells.map((cell, index) => {
            const x = padL + index * slot + (slot - barW) / 2;
            const totalH = cell.tokens > 0 ? Math.max(2, Math.round((cell.tokens / maximum) * plotH)) : 0;
            if (totalH <= 0) return null;
            const top = padT + plotH - totalH;
            if (!stacked) {
              return (
                <g key={index}>
                  <rect x={x} y={top} width={barW} height={totalH} fill={palette.blue} />
                  <rect x={x} y={top} width={barW} height={3} fill={palette.blueBright} />
                </g>
              );
            }
            const parts = [
              { value: cell.inputTokens ?? 0, color: STACK_INPUT },
              { value: cell.cacheTokens ?? 0, color: STACK_CACHE },
              { value: cell.outputTokens ?? 0, color: STACK_OUTPUT },
              { value: cell.reasoningTokens ?? 0, color: STACK_REASONING },
            ];
            const sum = Math.max(1, parts.reduce((acc, part) => acc + part.value, 0));
            let cursor = padT + plotH;
            return (
              <g key={index}>
                {parts.map((part, partIndex) => {
                  if (part.value <= 0) return null;
                  const h = Math.max(2, Math.round((part.value / sum) * totalH));
                  cursor -= h;
                  return <rect key={partIndex} x={x} y={cursor} width={barW} height={h} fill={part.color} />;
                })}
              </g>
            );
          })}
          {maPath ? (
            <path d={maPath} fill="none" stroke="rgba(244,246,248,0.5)" strokeWidth={1.6} strokeDasharray="7 6" />
          ) : null}
        </svg>
        {/* Satori 不支持 SVG <text>:刻度一律 HTML 绝对定位叠层 */}
        {ticks.map((tick, tickIndex) =>
          tickLabels[tickIndex] === null ? null : (
            <div
              key={`tick-${tickIndex}`}
              style={{
                display: "flex",
                position: "absolute",
                left: 0,
                top: y(tick) - 7,
                width: padL - 10,
                justifyContent: "flex-end",
                color: palette.muted,
                fontSize: 11,
              }}
            >
              {tickLabels[tickIndex]}
            </div>
          ),
        )}
      </div>
      <div
        style={{
          display: "flex",
          position: "relative",
          marginTop: 6,
          marginLeft: padL,
          width: width - padL - padR,
          height: 14,
        }}
      >
        {cells.map((cell, index) => {
          const label = labelOf(cell, index);
          return label ? (
            <div
              key={`label-${index}`}
              style={{
                display: "flex",
                position: "absolute",
                left: Math.round(index * slot),
                width: Math.round(slot),
                justifyContent: "center",
                color: palette.muted,
                fontSize: 11,
              }}
            >
              {label}
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}

/* 分时/贡献图共用:站点热图同一套 6 档蓝阶阈值。 */
const HEAT_STEPS = [
  "rgba(20,120,255,0.15)",
  "rgba(20,120,255,0.30)",
  "rgba(20,120,255,0.45)",
  "rgba(20,120,255,0.60)",
  "rgba(20,120,255,0.80)",
  palette.blue,
];

function heatStep(value: number, maximum: number): string | null {
  if (value <= 0 || maximum <= 0) return null;
  const ratio = value / maximum;
  if (ratio <= 0.16) return HEAT_STEPS[0];
  if (ratio <= 0.32) return HEAT_STEPS[1];
  if (ratio <= 0.48) return HEAT_STEPS[2];
  if (ratio <= 0.64) return HEAT_STEPS[3];
  if (ratio <= 0.82) return HEAT_STEPS[4];
  return HEAT_STEPS[5];
}

function HeatLegend({ colors }: { colors: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", color: palette.muted, fontSize: 12, letterSpacing: 1 }}>
      <span style={{ display: "flex" }}>LESS</span>
      {colors.map((color) => (
        <span
          key={color}
          style={{ display: "flex", width: 12, height: 12, marginLeft: 5, background: color, borderRadius: 2 }}
        />
      ))}
      <span style={{ display: "flex", marginLeft: 5 }}>MORE</span>
    </div>
  );
}

/* 7D 主图:星期×小时活跃时段热图(同个人主页/用量看板的 6 档蓝阶)。 */
function WeekHeatmap({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  const zh = snapshot.zh;
  const grid = main.heat ?? [];
  const maximum = Math.max(0, ...grid.flat());
  const names = zh ? WEEKDAYS : WEEKDAYS_EN;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow left={main.eyebrow} right={main.headline} />
      <div style={{ display: "flex", marginTop: 12, marginLeft: 52, gap: 4 }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <div
            key={hour}
            style={{ display: "flex", flex: 1, justifyContent: "center", color: palette.muted, fontSize: 11 }}
          >
            {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 6, flexDirection: "column", gap: 6 }}>
        {grid.map((row, weekday) => (
          <div key={weekday} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", width: 42, marginRight: 6, color: palette.muted, fontSize: 11 }}>
              {names[weekday]}
            </div>
            {row.map((value, hour) => {
              const step = heatStep(value, maximum);
              return (
                <div
                  key={hour}
                  style={{
                    display: "flex",
                    flex: 1,
                    height: 20,
                    borderRadius: 2,
                    background: step ?? "#10141a",
                    border: step ? "1px solid rgba(20,120,255,0.25)" : `1px solid ${palette.grid}`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13 }}>{main.subline}</div>
        <HeatLegend colors={HEAT_STEPS} />
      </div>
    </div>
  );
}

/* 90D/ALL 主图:构建足迹式贡献图(13/26 个自然周 × 7,月份随列变标注)。 */
function ContribGraph({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  const zh = snapshot.zh;
  const columns = Array.from({ length: main.columns }, (_, column) =>
    main.cells.slice(column * 7, column * 7 + 7),
  );
  const monthLabels = columns.map((column, index) => {
    const month = column[0]?.key.slice(5, 7) ?? "";
    if (index > 0 && month === columns[index - 1][0]?.key.slice(5, 7)) return null;
    return MONTHS[Number(month) - 1] ?? null;
  });
  const names = zh ? WEEKDAYS : WEEKDAYS_EN;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow left={main.eyebrow} right={main.headline} />
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
          {names.map((day, index) => (
            <span key={day} style={{ display: "flex", height: 16, alignItems: "center" }}>
              {[0, 2, 4, 6].includes(index) ? (zh ? day.slice(1) : day) : ""}
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
                    background: cell.future ? "#080a0d" : HEAT_COLORS[cell.level],
                    border: cell.future
                      ? "1px dashed #1e242c"
                      : cell.level === 0
                        ? `1px solid ${palette.grid}`
                        : "1px solid rgba(20,120,255,0.25)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13 }}>{main.subline}</div>
        <HeatLegend colors={HEAT_COLORS} />
      </div>
    </div>
  );
}

function MetricIcon({ kind, color }: { kind: string; color: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16" };
  switch (kind) {
    case "cost":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M9.8 5.6H6.9a1.5 1.5 0 000 3h2.2a1.5 1.5 0 010 3H6.2M8 4.4v7.2" fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
      );
    case "time":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M8 4.8V8l2.4 1.7" fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    case "peak":
      return (
        <svg {...common}>
          <path d="M2 13h12" fill="none" stroke={color} strokeWidth="1.4" />
          <path d="M3 11.5 L6.2 5.5 L8.8 9.5 L12.5 3" fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
      );
    case "cache":
      return (
        <svg {...common}>
          <path d="M8.9 2.2 L4.3 9h2.8l-1 4.8L11.4 7H8.4z" fill={color} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M2.8 3.2h10.4v7H8.4l-3 2.6v-2.6H2.8z" fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
      );
  }
}

function MetricCell({
  icon,
  label,
  value,
  color,
  first,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  first?: boolean;
}) {
  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", paddingLeft: first ? 0 : 20 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <MetricIcon kind={icon} color={color} />
        <div
          style={{
            display: "flex",
            marginLeft: 8,
            color: palette.muted,
            fontSize: 12,
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 10,
          color,
          fontSize: 25,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {safeMetric(value, 14)}
      </div>
    </div>
  );
}

/* 效率指标带:费用 / 活跃时长 / 峰值 / 缓存命中 / 会话 五格。 */
function MetricsBand({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const zh = snapshot.zh;
  const items = [
    { icon: "cost", label: zh ? "费用 COST" : "COST", value: dollars(snapshot.costMicros), color: palette.green },
    { icon: "time", label: zh ? "活跃时长 ACTIVE" : "ACTIVE", value: duration(snapshot.activeSeconds), color: palette.blue },
    {
      icon: "peak",
      label: zh ? `${snapshot.peakLabel} PEAK` : snapshot.peakLabel,
      value: compact(snapshot.peakTokens),
      color: palette.paper,
    },
    {
      icon: "cache",
      label: zh ? "缓存命中 HIT" : "CACHE HIT",
      value: snapshot.cacheHitRate === null ? "—" : `${(snapshot.cacheHitRate * 100).toFixed(1)}%`,
      color: palette.green,
    },
    {
      icon: "sessions",
      label: zh ? "会话 SESS" : "SESSIONS",
      value: snapshot.sessions.toLocaleString("en-US"),
      color: palette.paper,
    },
  ];
  return (
    <div style={{ display: "flex" }}>
      {items.map((item, index) => (
        <div key={item.label} style={{ display: "flex", flex: 1, minWidth: 0 }}>
          {index > 0 ? <div style={{ display: "flex", width: 1, background: palette.line }} /> : null}
          <MetricCell icon={item.icon} label={item.label} value={item.value} color={item.color} first={index === 0} />
        </div>
      ))}
    </div>
  );
}

function ToolIcon({ id, label }: { id: string; label: string }) {
  const glyph = TOOL_GLYPHS[id];
  if (glyph) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill={palette.paper} fillRule="evenodd" clipRule="evenodd">
        {glyph.paths.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </svg>
    );
  }
  const abbr = label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "AI";
  return (
    <div
      style={{
        display: "flex",
        width: 28,
        height: 28,
        border: `1px solid ${palette.line}`,
        background: "#0d1013",
        color: palette.muted,
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1,
      }}
    >
      {abbr}
    </div>
  );
}

/* 主力模型厂商字形:按型号名归族(model-glyphs.ts),未命中则不渲染图标。 */
function ModelGlyph({ label }: { label: string }) {
  const id = modelGlyphId(label);
  const glyph = id ? MODEL_GLYPHS[id] : undefined;
  if (!glyph) return null;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={palette.paper} fillRule="evenodd" clipRule="evenodd">
      {glyph.paths.map((d) => (
        <path key={d.slice(0, 24)} d={d} />
      ))}
    </svg>
  );
}

/* 武器库:eyebrow 行 / TOP 5 Agent 行 / 主力模型 + 推理强度 meta 行。 */
function ArsenalRow({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const zh = snapshot.zh;
  const tools = snapshot.topTools;
  const maximum = Math.max(1, ...tools.map((tool) => tool.tokens));
  const hasModelGlyph = modelGlyphId(snapshot.topModel) !== null;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow
        left={zh ? "常用 AGENT" : "TOP AGENTS"}
        right={zh ? `共 ${snapshot.toolCount} 个 · 按 TOKEN` : `${snapshot.toolCount} IN USE · BY TOKENS`}
      />
      <div style={{ display: "flex", marginTop: 16 }}>
        {tools.map((tool, index) => (
          <div key={tool.id} style={{ display: "flex", flex: 1, minWidth: 0 }}>
            {index > 0 ? <div style={{ display: "flex", width: 1, background: palette.line }} /> : null}
            <div
              style={{
                display: "flex",
                flex: 1,
                minWidth: 0,
                flexDirection: "column",
                paddingLeft: index === 0 ? 0 : 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <ToolIcon id={tool.id} label={tool.label} />
                <div style={{ display: "flex", marginLeft: 10, flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {safeMetric(tool.label, 12)}
                  </div>
                  <div style={{ display: "flex", marginTop: 4, color: palette.muted, fontSize: 12 }}>
                    {compact(tool.tokens)} · {(tool.share * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", marginTop: 12, height: 6, borderRadius: 2, background: "#11151a" }}>
                <div
                  style={{
                    display: "flex",
                    width: `${Math.max(4, (tool.tokens / maximum) * 100)}%`,
                    borderRadius: 2,
                    background: index === 0 ? palette.green : palette.blue,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 16,
          borderTop: `1px solid ${palette.line}`,
          paddingTop: 16,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: palette.muted, fontSize: 12, letterSpacing: 1.5 }}>
            {zh ? "主力模型" : "TOP MODEL"}
          </div>
          <div style={{ display: "flex", marginTop: 8, alignItems: "center" }}>
            {hasModelGlyph ? <ModelGlyph label={snapshot.topModel} /> : null}
            <div
              style={{
                display: "flex",
                marginLeft: hasModelGlyph ? 10 : 0,
                fontSize: 19,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {safeMetric(snapshot.topModel, 20)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", marginLeft: "auto", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", color: palette.muted, fontSize: 12, letterSpacing: 1.5 }}>
            {zh ? "模型用量" : "MODEL TOKENS"}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontSize: 19,
              fontWeight: 700,
              color: palette.paper,
              whiteSpace: "nowrap",
            }}
          >
            {`${compact(snapshot.topModelTokens)} · ${(snapshot.topModelShare * 100).toFixed(0)}%`}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageQrCode({ url }: { url: string }) {
  const margin = 1;
  const qr = QrCode.encodeText(url, Ecc.MEDIUM);
  const modules = qr.getModules();
  const size = modules.length + margin * 2;
  return (
    <svg width="104" height="104" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="poster target QR code">
      <path fill="#ffffff" d={`M0,0 h${size}v${size}H0z`} shapeRendering="crispEdges" />
      <path fill="#050607" d={generatePath(modules, margin)} shapeRendering="crispEdges" />
    </svg>
  );
}

export function UsageSharePoster({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  const zh = snapshot.zh;
  const streak = snapshot.streakWeeks.current > 0 ? snapshot.streakWeeks.current : snapshot.streakWeeks.longest;
  const streakWord = zh
    ? snapshot.streakWeeks.current > 0
      ? "周连续构建"
      : "周最长连续"
    : "WEEKS";
  const streakSub = zh
    ? "WEEK STREAK"
    : snapshot.streakWeeks.current > 0
      ? "WEEK STREAK"
      : "LONGEST STREAK";
  /* 展示地址:去协议与 query、保持小写(与顶部大写品牌区分开);QR 仍指完整 siteUrl。 */
  const siteUrlDisplay = snapshot.siteUrl.replace("https://", "").replace("?tab=usage", "");
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        background: `radial-gradient(680px 320px at 86% 0%, rgba(20,120,255,0.10), rgba(5,6,7,0) 72%), ${palette.background}`,
        color: palette.paper,
        padding: "44px 54px 36px",
        fontFamily: "monospace",
      }}
    >
      {/* 身份带:站点品牌 + 用户社交信息同区置顶;字号/色阶一套 ramp
          (品牌 22/700·名称 24/700·正文 15·标签 13 muted ls2) */}
      <div style={{ display: "flex", flexDirection: "column", borderBottom: `1px solid ${palette.line}`, paddingBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
            KIMI.BUILDERS <span style={{ display: "flex", marginLeft: 14, color: palette.blueBright }}>/ USAGE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", color: palette.muted, fontSize: 15, letterSpacing: 3 }}>TOKEN X-RAY</div>
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
              {zh ? snapshot.rangeLabel : snapshot.rangeLabelEn}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 22, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              background: palette.green,
              color: palette.greenInk,
              fontSize: 23,
              fontWeight: 800,
            }}
          >
            {snapshot.user.initials}
          </div>
          <div style={{ display: "flex", marginLeft: 18, flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{safeMetric(snapshot.user.name, 32)}</div>
            <div style={{ display: "flex", marginTop: 7, alignItems: "center" }}>
              <div style={{ display: "flex", color: palette.muted, fontSize: 15 }}>@{snapshot.user.handle}</div>
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
                {siteUrlDisplay}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <div style={{ display: "flex", color: palette.blue, fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
                  {streak}
                </div>
                <div style={{ display: "flex", marginLeft: 9, fontSize: 18 }}>{streakWord}</div>
              </div>
              <div style={{ display: "flex", marginTop: 5, color: palette.muted, fontSize: 13, letterSpacing: 2 }}>
                {streakSub}
              </div>
            </div>
            <div style={{ display: "flex", width: 1, height: 50, margin: "0 26px", background: palette.line }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
                {spanText(snapshot.span, zh)}
              </div>
              <div style={{ display: "flex", marginTop: 5, color: palette.muted, fontSize: 13, letterSpacing: 2 }}>
                {zh ? "数据起止 SPAN" : "DATA SPAN"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero 数字带 */}
      <div
        style={{
          display: "flex",
          marginTop: 20,
          alignItems: "flex-end",
          borderBottom: `1px solid ${palette.line}`,
          paddingBottom: 20,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 104, lineHeight: 0.84, fontWeight: 800, letterSpacing: -5 }}>
            {compact(snapshot.totalTokens)}
          </div>
          <div style={{ display: "flex", marginTop: 20, alignItems: "baseline" }}>
            <div style={{ display: "flex", color: palette.paper, fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
              {zh ? `${snapshot.rangeLabel} TOKEN` : `${snapshot.rangeLabelEn} TOKENS`}
            </div>
            <div style={{ display: "flex", marginLeft: 20, color: palette.muted, fontSize: 15, letterSpacing: 1 }}>
              LIFETIME {compact(snapshot.lifetimeTokens)} · {snapshot.requests.toLocaleString("en-US")} REQUESTS
            </div>
          </div>
        </div>
        <div style={{ display: "flex", marginLeft: "auto", alignItems: "flex-end", paddingBottom: 2 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", color: palette.green, fontSize: 36, fontWeight: 700 }}>
              {dollars(snapshot.costMicros)}
            </div>
            <div style={{ display: "flex", marginTop: 7, color: palette.muted, fontSize: 15, letterSpacing: 2 }}>
              {zh ? "API 等价价值" : "API-EQUIV VALUE"}
            </div>
          </div>
          <div style={{ display: "flex", width: 1, height: 70, margin: "0 28px", background: palette.line }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", color: palette.blue, fontSize: 34, fontWeight: 700 }}>
              {duration(snapshot.activeSeconds)}
            </div>
            <div style={{ display: "flex", marginTop: 7, color: palette.muted, fontSize: 15, letterSpacing: 2 }}>
              {zh ? "活跃时长" : "ACTIVE"}
            </div>
          </div>
        </div>
      </div>

      {/* TOKEN FLOW 桑基 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingBottom: 18,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        <Eyebrow
          left={zh ? "TOKEN 流向" : "TOKEN FLOW"}
          right={zh ? "对数带宽 · 输入 → 上下文 → 输出" : "LOG BANDWIDTH · INPUT → CONTEXT → OUTPUT"}
        />
        <div style={{ display: "flex", marginTop: 10 }}>
          <FlowSankey flow={snapshot.flow} zh={zh} />
        </div>
      </div>

      {/* 中段主图 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingBottom: 18,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        {main.kind === "calendar" ? (
          <ContribGraph snapshot={snapshot} />
        ) : main.kind === "weekheat" ? (
          <WeekHeatmap snapshot={snapshot} />
        ) : (
          <TrendChart snapshot={snapshot} />
        )}
      </div>

      {/* 效率指标带 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingBottom: 18,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        <MetricsBand snapshot={snapshot} />
      </div>

      {/* 武器库 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingBottom: 18,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        <ArsenalRow snapshot={snapshot} />
      </div>

      {/* 页脚:与顶部同一套 ramp(20/700 主行 · 14 muted 副行 · 13 muted 注记);
          QR 与展示地址同目标(公开成员落到个人主页用量 tab) */}
      <div style={{ display: "flex", marginTop: 20, alignItems: "center" }}>
        <div style={{ display: "flex", padding: 8, background: "#ffffff" }}>
          <UsageQrCode url={snapshot.siteUrl} />
        </div>
        <div style={{ display: "flex", marginLeft: 24, flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700 }}>
            @{snapshot.user.handle} · {zh ? snapshot.rangeLabel : snapshot.rangeLabelEn} · {snapshot.generatedDate}
          </div>
          <div style={{ display: "flex", marginTop: 10, color: palette.muted, fontSize: 14 }}>
            {zh ? "扫码看实时用量看板" : "Scan for the live dashboard"}
          </div>
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
          <span style={{ display: "flex" }}>{zh ? "标准 API 计价估算" : "STANDARD API PRICE ESTIMATE"}</span>
          <span style={{ display: "flex" }}>{zh ? "本地私密同步 · 不含对话内容" : "PRIVATE LOCAL SYNC · NO CONTENT"}</span>
          <span style={{ display: "flex" }}>
            {zh
              ? `杠杆 ×${snapshot.leverage === null ? "—" : snapshot.leverage.toFixed(1)} = 总量 ÷ 新鲜输入`
              : `LEVERAGE ×${snapshot.leverage === null ? "—" : snapshot.leverage.toFixed(1)} = TOTAL ÷ FRESH INPUT`}
          </span>
        </div>
      </div>
    </div>
  );
}
