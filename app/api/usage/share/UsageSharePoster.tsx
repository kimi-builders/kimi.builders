import { Ecc, QrCode } from "@rc-component/qrcode/es/libs/qrcodegen";
import { generatePath } from "@rc-component/qrcode/es/utils";
import type { ReactNode } from "react";
import type { UsageShareFlow, UsageShareSnapshot, UsageShareTool } from "@/src/lib/usage/share";
import { TOOL_GLYPHS } from "./tool-glyphs";

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
  segmentGray: "#7a828c",
};

const CONTENT_WIDTH = 972;
const HEAT_COLORS = ["#101318", "#0d3151", "#0a4b76", "#0b70a9", palette.blue];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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

function spanText(span: { from: string; to: string }): string {
  const [fromYear, fromMonth] = span.from.split("-").map(Number);
  const [toYear, toMonth] = span.to.split("-").map(Number);
  const from = MONTHS[(fromMonth || 1) - 1] ?? "—";
  const to = MONTHS[(toMonth || 1) - 1] ?? "—";
  return fromYear === toYear
    ? `${fromYear} · ${from} — ${to}`
    : `${fromYear} · ${from} — ${toYear} · ${to}`;
}

function effortShort(value: string): string {
  if (!value || value === "未记录") return "—";
  return value.replace("EXTRA ", "X").replaceAll(" ", "");
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

function FlowSankey({ flow }: { flow: UsageShareFlow }) {
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
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 2 }}>INPUT</div>
        <div style={{ display: "flex", marginTop: 4, color: palette.paper, fontSize: 19, fontWeight: 700 }}>
          {compact(flow.inputTokens)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", left: 222, top: 84, flexDirection: "column" }}>
        <div style={{ display: "flex", color: palette.greenInk, fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>
          CACHE READ
        </div>
        <div style={{ display: "flex", marginTop: 3, color: palette.greenInk, fontSize: 34, fontWeight: 800 }}>
          {compact(flow.cacheReadTokens)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", right: 0, top: 22, flexDirection: "column", alignItems: "flex-start" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 2 }}>OUTPUT</div>
        <div style={{ display: "flex", marginTop: 3, color: palette.blueBright, fontSize: 19, fontWeight: 700 }}>
          {compact(flow.outputTokens)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", right: 0, top: 96, flexDirection: "column", alignItems: "flex-start" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13, letterSpacing: 2 }}>REASONING</div>
        <div style={{ display: "flex", marginTop: 3, color: palette.amber, fontSize: 19, fontWeight: 700 }}>
          {compact(flow.reasoningTokens)}
        </div>
      </div>
    </div>
  );
}

function PlotGrid({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div style={{ display: "flex", position: "relative", flex: 1, height }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, right: 0, bottom: 0, flexDirection: "column" }}>
        {[0, 1, 2].map((line) => (
          <div key={line} style={{ display: "flex", flex: 1, borderTop: `1px dashed ${palette.grid}` }} />
        ))}
      </div>
      {children}
    </div>
  );
}

function AxisLabels({ labels }: { labels: (string | null)[] }) {
  return (
    <div style={{ display: "flex", marginTop: 8 }}>
      {labels.map((label, index) => (
        <div
          key={index}
          style={{ display: "flex", flex: 1, justifyContent: "center", color: palette.muted, fontSize: 12 }}
        >
          {label ?? ""}
        </div>
      ))}
    </div>
  );
}

function VelocityChart({ weeks }: { weeks: UsageShareSnapshot["weeks"] }) {
  const maximum = Math.max(1, ...weeks.map((week) => week.tokens));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow left="12-WEEK VELOCITY" right="自然周 · 周一起" />
      <div style={{ display: "flex", marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            width: 42,
            marginRight: 10,
            flexDirection: "column",
            justifyContent: "space-between",
            color: palette.muted,
            fontSize: 12,
          }}
        >
          <span style={{ display: "flex" }}>{compact(maximum)}</span>
          <span style={{ display: "flex" }}>{compact(maximum / 2)}</span>
          <span style={{ display: "flex" }}>0</span>
        </div>
        <PlotGrid height={104}>
          <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 12, borderBottom: `1px solid ${palette.line}` }}>
            {weeks.map((week) => (
              <div
                key={week.key}
                style={{
                  display: "flex",
                  flex: 1,
                  height: `${Math.max(3, (week.tokens / maximum) * 100)}%`,
                  background: week.tokens > 0 ? palette.blue : "#11151a",
                  borderTop: `3px solid ${week.tokens > 0 ? palette.blueBright : palette.line}`,
                }}
              />
            ))}
          </div>
        </PlotGrid>
      </div>
      <div style={{ display: "flex", marginTop: 8, marginLeft: 52 }}>
        {weeks.map((week, index) => (
          <div
            key={week.key}
            style={{ display: "flex", flex: 1, justifyContent: "center", color: palette.muted, fontSize: 12 }}
          >
            W-{weeks.length - index}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarChart({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  const columns = Array.from({ length: main.columns }, (_, column) =>
    main.cells.slice(column * 7, column * 7 + 7),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow left={`${main.columns}-WEEK ACTIVITY`} right={main.headline} />
      <div style={{ display: "flex", marginTop: 12, marginLeft: 52, gap: 8 }}>
        {columns.map((_, index) => (
          <div
            key={`week-label-${index}`}
            style={{ display: "flex", flex: 1, justifyContent: "center", color: palette.muted, fontSize: 12 }}
          >
            W{index + 1}
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
            justifyContent: "space-between",
            color: palette.muted,
            fontSize: 12,
          }}
        >
          {WEEKDAYS.map((day) => (
            <span key={day} style={{ display: "flex", height: 18, alignItems: "center" }}>
              {day}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1, gap: 8 }}>
          {columns.map((column, columnIndex) => (
            <div key={`week-${columnIndex}`} style={{ display: "flex", flex: 1, flexDirection: "column", gap: 7 }}>
              {column.map((cell) => (
                <div
                  key={cell.key}
                  style={{
                    display: "flex",
                    height: 18,
                    background: cell.future ? "#080a0d" : HEAT_COLORS[cell.level],
                    border: `1px solid ${cell.future ? "#11151a" : cell.level === 0 ? "#1b2027" : "#157ee4"}`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", color: palette.muted, fontSize: 13 }}>{main.subline}</div>
        <div style={{ display: "flex", alignItems: "center", color: palette.muted, fontSize: 12, letterSpacing: 1 }}>
          <span style={{ display: "flex" }}>LESS</span>
          {HEAT_COLORS.map((color) => (
            <span key={color} style={{ display: "flex", width: 12, height: 12, marginLeft: 5, background: color }} />
          ))}
          <span style={{ display: "flex", marginLeft: 5 }}>MORE</span>
        </div>
      </div>
    </div>
  );
}

function BarsChart({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  const plot = 336;
  const maximum = Math.max(1, ...main.cells.map((cell) => cell.tokens));
  const stacked = main.kind === "stacked";
  const labels = main.cells.map((cell, index) => {
    if (main.kind === "hours") {
      const hour = cell.key.length > 13 ? cell.key.slice(11, 13) : String(index % 24).padStart(2, "0");
      return index % 6 === 0 || index === main.cells.length - 1 ? hour : null;
    }
    if (main.kind === "days") return `${cell.key.slice(5)} ${WEEKDAYS[(new Date(`${cell.key}T00:00:00Z`).getUTCDay() + 6) % 7].slice(1)}`;
    return index % 6 === 0 || index === main.cells.length - 1 ? cell.key.slice(5) : null;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow
        left={main.eyebrow}
        right={stacked ? main.headline : `${main.headline} · ${main.subline}`}
      />
      {stacked ? (
        <div style={{ display: "flex", marginTop: 8, alignItems: "center", color: palette.muted, fontSize: 13 }}>
          <span style={{ display: "flex", alignItems: "center" }}>
            <span style={{ display: "flex", width: 10, height: 10, marginRight: 6, background: palette.blue }} />
            输入(含缓存写)
          </span>
          <span style={{ display: "flex", alignItems: "center", marginLeft: 18 }}>
            <span style={{ display: "flex", width: 10, height: 10, marginRight: 6, background: palette.green }} />
            缓存命中
          </span>
          <span style={{ display: "flex", alignItems: "center", marginLeft: 18 }}>
            <span style={{ display: "flex", width: 10, height: 10, marginRight: 6, background: palette.segmentGray }} />
            输出(含推理)
          </span>
          <span style={{ display: "flex", marginLeft: "auto" }}>{main.subline}</span>
        </div>
      ) : null}
      <div style={{ display: "flex", marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            width: 42,
            marginRight: 10,
            flexDirection: "column",
            justifyContent: "space-between",
            color: palette.muted,
            fontSize: 12,
          }}
        >
          <span style={{ display: "flex" }}>{compact(maximum)}</span>
          <span style={{ display: "flex" }}>{compact(maximum / 2)}</span>
          <span style={{ display: "flex" }}>0</span>
        </div>
        <PlotGrid height={plot}>
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "flex-end",
              gap: main.kind === "hours" ? 7 : main.kind === "days" ? 22 : 5,
              borderBottom: `1px solid ${palette.line}`,
            }}
          >
            {main.cells.map((cell, index) => {
              const totalHeight = Math.max(2, Math.round((cell.tokens / maximum) * plot));
              if (!stacked) {
                return (
                  <div
                    key={`${cell.key}-${index}`}
                    style={{
                      display: "flex",
                      flex: 1,
                      height: totalHeight,
                      background: cell.tokens > 0 ? palette.blue : "#11151a",
                      borderTop: `3px solid ${cell.tokens > 0 ? palette.blueBright : palette.line}`,
                    }}
                  />
                );
              }
              const input = cell.inputTokens ?? 0;
              const cache = cell.cacheTokens ?? 0;
              const output = cell.outputTokens ?? 0;
              const sum = Math.max(1, input + cache + output);
              const parts = [
                { value: input, color: palette.blue },
                { value: cache, color: palette.green },
                { value: output, color: palette.segmentGray },
              ];
              return (
                <div
                  key={`${cell.key}-${index}`}
                  style={{ display: "flex", flex: 1, height: totalHeight, flexDirection: "column-reverse", background: "#11151a" }}
                >
                  {parts.map((part, partIndex) => (
                    <div
                      key={partIndex}
                      style={{
                        display: "flex",
                        height: part.value > 0 ? Math.max(3, Math.round((part.value / sum) * totalHeight)) : 0,
                        background: part.color,
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </PlotGrid>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 52 }}>
        <AxisLabels labels={labels} />
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
    case "sessions":
      return (
        <svg {...common}>
          <path d="M2.8 3.2h10.4v7H8.4l-3 2.6v-2.6H2.8z" fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
      );
    case "tools":
      return (
        <svg {...common}>
          <rect x="2.4" y="3.2" width="11.2" height="9.6" fill="none" stroke={color} strokeWidth="1.4" />
          <path d="M4.8 6.2l2.2 1.8-2.2 1.8M8.2 10.2h3" fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M8 2 L9.8 6.2 L14 8 L9.8 9.8 L8 14 L6.2 9.8 L2 8 L6.2 6.2 Z" fill={color} />
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
    <div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", paddingLeft: first ? 0 : 16 }}>
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
          fontSize: 23,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {safeMetric(value, 14)}
      </div>
    </div>
  );
}

function MetricsBand({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const items = [
    { icon: "cost", label: "费用 COST", value: dollars(snapshot.costMicros), color: palette.green },
    { icon: "time", label: "活跃时长 ACTIVE", value: duration(snapshot.activeSeconds), color: palette.blue },
    { icon: "peak", label: `${snapshot.peakLabel} PEAK`, value: compact(snapshot.peakTokens), color: palette.paper },
    {
      icon: "cache",
      label: "缓存命中 HIT",
      value: snapshot.cacheHitRate === null ? "—" : `${(snapshot.cacheHitRate * 100).toFixed(1)}%`,
      color: palette.green,
    },
    { icon: "sessions", label: "会话 SESS", value: snapshot.sessions.toLocaleString("en-US"), color: palette.paper },
    { icon: "tools", label: "AI 工具 TOOLS", value: `${snapshot.toolCount}`, color: palette.green },
    { icon: "effort", label: "推理强度 EFFORT", value: effortShort(snapshot.topEffort), color: palette.amber },
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

function ToolsRow({ tools }: { tools: UsageShareTool[] }) {
  const maximum = Math.max(1, ...tools.map((tool) => tool.tokens));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Eyebrow left="TOP AI TOOLS" right="BY TOKENS · TOP 5" />
      <div style={{ display: "flex", marginTop: 16 }}>
        {tools.map((tool, index) => (
          <div key={tool.id} style={{ display: "flex", flex: 1, minWidth: 0 }}>
            {index > 0 ? <div style={{ display: "flex", width: 1, background: palette.line }} /> : null}
            <div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", paddingLeft: index === 0 ? 0 : 18 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <ToolIcon id={tool.id} label={tool.label} />
                <div style={{ display: "flex", marginLeft: 12, flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 17, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {safeMetric(tool.label, 14)}
                  </div>
                  <div style={{ display: "flex", marginTop: 4, color: palette.muted, fontSize: 13 }}>
                    {compact(tool.tokens)} · {(tool.share * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", marginTop: 10, height: 3, background: "#11151a" }}>
                <div
                  style={{
                    display: "flex",
                    width: `${Math.max(4, (tool.tokens / maximum) * 100)}%`,
                    background: index === 0 ? palette.green : palette.blue,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageQrCode() {
  const margin = 1;
  const qr = QrCode.encodeText("https://kimi.builders/usage", Ecc.MEDIUM);
  const modules = qr.getModules();
  const size = modules.length + margin * 2;
  return (
    <svg width="104" height="104" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="kimi.builders/usage QR code">
      <path fill="#ffffff" d={`M0,0 h${size}v${size}H0z`} shapeRendering="crispEdges" />
      <path fill="#050607" d={generatePath(modules, margin)} shapeRendering="crispEdges" />
    </svg>
  );
}

export function UsageSharePoster({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  const streak = snapshot.streakWeeks.current > 0 ? snapshot.streakWeeks.current : snapshot.streakWeeks.longest;
  const streakLabel = snapshot.streakWeeks.current > 0 ? "周连续构建" : "周最长连续";
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        background: palette.background,
        color: palette.paper,
        padding: "44px 54px 36px",
        fontFamily: "monospace",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", borderBottom: `1px solid ${palette.line}`, paddingBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 700, letterSpacing: 5 }}>
            kimi.builders <span style={{ display: "flex", marginLeft: 16, color: palette.muted }}>/ USAGE</span>
          </div>
          <div style={{ display: "flex", color: palette.muted, fontSize: 16, letterSpacing: 3 }}>TOKEN X-RAY</div>
        </div>
        <div style={{ display: "flex", marginTop: 20, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 112, lineHeight: 0.84, fontWeight: 800, letterSpacing: -5 }}>
              {compact(snapshot.totalTokens)}
            </div>
            <div style={{ display: "flex", marginTop: 22, alignItems: "baseline" }}>
              <div style={{ display: "flex", color: palette.paper, fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
                {snapshot.rangeLabel} TOKEN
              </div>
              <div style={{ display: "flex", marginLeft: 20, color: palette.muted, fontSize: 15, letterSpacing: 1 }}>
                LIFETIME {compact(snapshot.lifetimeTokens)} · {snapshot.requests.toLocaleString("en-US")} REQUESTS
              </div>
            </div>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", alignItems: "flex-end", paddingBottom: 2 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", color: palette.green, fontSize: 38, fontWeight: 700 }}>{dollars(snapshot.costMicros)}</div>
              <div style={{ display: "flex", marginTop: 7, color: palette.muted, fontSize: 15, letterSpacing: 2 }}>API 等价价值</div>
            </div>
            <div style={{ display: "flex", width: 1, height: 74, margin: "0 30px", background: palette.line }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", color: palette.blue, fontSize: 36, fontWeight: 700 }}>{duration(snapshot.activeSeconds)}</div>
              <div style={{ display: "flex", marginTop: 7, color: palette.muted, fontSize: 15, letterSpacing: 2 }}>活跃时长</div>
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: 20,
          paddingBottom: 18,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            background: palette.green,
            color: palette.greenInk,
            fontSize: 21,
            fontWeight: 800,
          }}
        >
          {snapshot.user.initials}
        </div>
        <div style={{ display: "flex", marginLeft: 18, flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700 }}>{safeMetric(snapshot.user.name, 32)}</div>
          <div style={{ display: "flex", marginTop: 5, color: palette.muted, fontSize: 16 }}>@{snapshot.user.handle}</div>
        </div>
        <div style={{ display: "flex", marginLeft: "auto", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <div style={{ display: "flex", color: palette.blue, fontSize: 42, fontWeight: 800, lineHeight: 1 }}>{streak}</div>
              <div style={{ display: "flex", marginLeft: 9, fontSize: 19 }}>{streakLabel}</div>
            </div>
            <div style={{ display: "flex", marginTop: 5, color: palette.muted, fontSize: 13, letterSpacing: 2 }}>
              WEEK STREAK
            </div>
          </div>
          <div style={{ display: "flex", width: 1, height: 52, margin: "0 28px", background: palette.line }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>{spanText(snapshot.span)}</div>
            <div style={{ display: "flex", marginTop: 5, color: palette.muted, fontSize: 13, letterSpacing: 2 }}>数据起止 SPAN</div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingBottom: 20,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        <Eyebrow left="TOKEN FLOW" right="对数带宽 · 输入 → 上下文 → 输出" />
        <div style={{ display: "flex", marginTop: 10 }}>
          <FlowSankey flow={snapshot.flow} />
        </div>
      </div>

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingBottom: 20,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        {main.kind === "calendar" ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <VelocityChart weeks={snapshot.weeks} />
            <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
              <CalendarChart snapshot={snapshot} />
            </div>
          </div>
        ) : (
          <BarsChart snapshot={snapshot} />
        )}
      </main>

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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingBottom: 18,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        <ToolsRow tools={snapshot.topTools} />
      </div>

      <footer style={{ display: "flex", marginTop: 22, alignItems: "center" }}>
        <div style={{ display: "flex", padding: 8, background: "#ffffff" }}>
          <UsageQrCode />
        </div>
        <div style={{ display: "flex", marginLeft: 24, flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 21, fontWeight: 700 }}>
            @{snapshot.user.handle} · {snapshot.rangeLabelEn} · {snapshot.generatedDate}
          </div>
          <div style={{ display: "flex", marginTop: 10, color: palette.blue, fontSize: 21, fontWeight: 700 }}>
            kimi.builders/usage
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginLeft: "auto",
            flexDirection: "column",
            alignItems: "flex-end",
            color: palette.muted,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <span style={{ display: "flex" }}>STANDARD API PRICE ESTIMATE</span>
          <span style={{ display: "flex" }}>PRIVATE LOCAL SYNC · NO CONTENT</span>
          <span style={{ display: "flex" }}>
            LEVERAGE ×{snapshot.leverage === null ? "—" : snapshot.leverage.toFixed(1)} = TOTAL ÷ FRESH INPUT
          </span>
        </div>
      </footer>
    </div>
  );
}
