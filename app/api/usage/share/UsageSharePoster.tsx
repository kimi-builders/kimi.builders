import { Ecc, QrCode } from "@rc-component/qrcode/es/libs/qrcodegen";
import { generatePath } from "@rc-component/qrcode/es/utils";
import type { UsageShareSnapshot } from "@/src/lib/usage/share";

export const USAGE_SHARE_POSTER_SIZE = { width: 1080, height: 1440 } as const;

const palette = {
  background: "#050607",
  paper: "#f4f6f8",
  muted: "#8a9099",
  line: "#252a31",
  blue: "#1478ff",
  blueSoft: "#0a3977",
  green: "#20d39a",
  amber: "#f6a609",
};

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

function ActivityMain({ snapshot }: { snapshot: UsageShareSnapshot }) {
  const { main } = snapshot;
  if (main.kind === "heatmap") {
    const columns = Array.from({ length: main.columns }, (_, column) =>
      main.cells.slice(column * 7, column * 7 + 7),
    );
    return (
      <div style={{ display: "flex", width: "100%", height: 276, flexDirection: "column" }}>
        <div style={{ display: "flex", marginLeft: 46, marginBottom: 10, gap: 10 }}>
          {columns.map((_, index) => (
            <div key={`week-label-${index}`} style={{ display: "flex", flex: 1, justifyContent: "center", color: palette.muted, fontSize: 14 }}>
              W{index + 1}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1 }}>
          <div style={{ display: "flex", width: 38, marginRight: 8, flexDirection: "column", justifyContent: "space-between", color: palette.muted, fontSize: 14 }}>
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day} style={{ display: "flex" }}>周{day}</span>)}
          </div>
          <div style={{ display: "flex", flex: 1, gap: 10, alignItems: "stretch" }}>
            {columns.map((column, columnIndex) => (
              <div
                key={`week-${columnIndex}`}
                style={{ display: "flex", flex: 1, flexDirection: "column", gap: 9 }}
              >
                {column.map((cell) => {
                  const colors = ["#101318", "#0d3151", "#0a4b76", "#0b70a9", palette.blue];
                  return (
                    <div
                      key={cell.key}
                      style={{
                        display: "flex",
                        flex: 1,
                        minHeight: 18,
                        background: cell.future ? "#080a0d" : colors[cell.level],
                        border: `1px solid ${cell.future ? "#11151a" : cell.level === 0 ? "#1b2027" : "#157ee4"}`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const maximum = Math.max(1, ...main.cells.map((cell) => cell.tokens));
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: 244,
        alignItems: "flex-end",
        gap: main.kind === "hours" ? 8 : 20,
        borderBottom: `1px solid ${palette.line}`,
        padding: "0 4px",
      }}
    >
      {main.cells.map((cell, index) => (
        <div
          key={`${cell.key}-${index}`}
          style={{
            display: "flex",
            flex: 1,
            minWidth: 4,
            height: `${Math.max(5, (cell.tokens / maximum) * 100)}%`,
            background: cell.tokens > 0 ? palette.blue : "#11151a",
            borderTop: `3px solid ${cell.tokens > 0 ? "#54a3ff" : "#252a31"}`,
          }}
        />
      ))}
    </div>
  );
}

function FooterMetric({
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
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {safeMetric(value)}
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
    <svg width="112" height="112" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="kimi.builders/usage QR code">
      <path fill="#ffffff" d={`M0,0 h${size}v${size}H0z`} shapeRendering="crispEdges" />
      <path fill="#050607" d={generatePath(modules, margin)} shapeRendering="crispEdges" />
    </svg>
  );
}

export function UsageSharePoster({ snapshot }: { snapshot: UsageShareSnapshot }) {
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
        fontFamily: "monospace",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", borderBottom: `1px solid ${palette.line}`, paddingBottom: 30 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 24, fontWeight: 700, letterSpacing: 5 }}>
            kimi.builders <span style={{ display: "flex", marginLeft: 18, color: palette.muted }}>/ USAGE</span>
          </div>
          <div style={{ display: "flex", color: palette.muted, fontSize: 19, letterSpacing: 3 }}>TOKEN X-RAY</div>
        </div>
        <div style={{ display: "flex", marginTop: 28, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 142, lineHeight: 0.84, fontWeight: 800, letterSpacing: -7 }}>
              {compact(snapshot.totalTokens)}
            </div>
            <div style={{ display: "flex", marginTop: 28, color: palette.muted, fontSize: 25, fontWeight: 700, letterSpacing: 4 }}>
              {snapshot.rangeLabel} TOKEN
            </div>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", alignItems: "flex-end", paddingBottom: 2 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", color: palette.green, fontSize: 43, fontWeight: 700 }}>{dollars(snapshot.costMicros)}</div>
              <div style={{ display: "flex", marginTop: 8, color: palette.muted, fontSize: 18, letterSpacing: 2 }}>API 等价价值</div>
            </div>
            <div style={{ display: "flex", width: 1, height: 82, margin: "0 34px", background: palette.line }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", color: palette.blue, fontSize: 40, fontWeight: 700 }}>{duration(snapshot.activeSeconds)}</div>
              <div style={{ display: "flex", marginTop: 8, color: palette.muted, fontSize: 18, letterSpacing: 2 }}>活跃时长</div>
            </div>
          </div>
        </div>
      </header>

      <main style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", padding: "30px 0 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                width: 68,
                height: 68,
                borderRadius: 34,
                alignItems: "center",
                justifyContent: "center",
                background: palette.green,
                color: "#032a20",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              {snapshot.user.initials}
            </div>
            <div style={{ display: "flex", marginLeft: 20, flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 25, fontWeight: 700 }}>{safeMetric(snapshot.user.name, 32)}</div>
              <div style={{ display: "flex", marginTop: 6, color: palette.muted, fontSize: 19 }}>@{snapshot.user.handle}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", color: palette.muted, fontSize: 19, letterSpacing: 3 }}>{snapshot.main.eyebrow}</div>
            <div style={{ display: "flex", marginTop: 8, color: palette.green, fontSize: 31, fontWeight: 800 }}>{snapshot.main.headline}</div>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 25, borderTop: `1px solid ${palette.line}`, borderBottom: `1px solid ${palette.line}`, padding: "18px 0" }}>
          <FooterMetric label="LIFETIME" value={compact(snapshot.lifetimeTokens)} color={palette.paper} />
          <div style={{ display: "flex", width: 1, background: palette.line }} />
          <FooterMetric label={snapshot.peakLabel.toUpperCase()} value={compact(snapshot.peakTokens)} color={palette.blue} />
        </div>

        <div style={{ display: "flex", marginTop: 23 }}>
          <ActivityMain snapshot={snapshot} />
        </div>
        <div style={{ display: "flex", marginTop: 14, justifyContent: "space-between", color: palette.muted, fontSize: 17 }}>
          <span style={{ display: "flex" }}>{snapshot.main.subline}</span>
          <span style={{ display: "flex" }}>{snapshot.main.kind === "heatmap" ? "少  ·  构建强度  ·  多" : "时间 →"}</span>
        </div>
      </main>

      <footer style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${palette.line}`, paddingTop: 24 }}>
        <div style={{ display: "flex", paddingBottom: 24 }}>
          <FooterMetric label="TOP MODEL" value={snapshot.topModel} color={palette.blue} />
          <div style={{ display: "flex", width: 1, background: palette.line }} />
          <FooterMetric label="REASONING" value={snapshot.topEffort} color={palette.amber} />
          <div style={{ display: "flex", width: 1, background: palette.line }} />
          <FooterMetric
            label="CACHE HIT"
            value={snapshot.cacheHitRate === null ? "—" : `${(snapshot.cacheHitRate * 100).toFixed(1)}%`}
            color={palette.green}
          />
          <div style={{ display: "flex", width: 1, background: palette.line }} />
          <FooterMetric label="TOOLS" value={`${snapshot.toolCount}`} color={palette.green} />
        </div>
        <div style={{ display: "flex", borderTop: `1px solid ${palette.line}`, paddingTop: 24, alignItems: "center" }}>
          <div style={{ display: "flex", padding: 9, background: "#ffffff" }}>
            <UsageQrCode />
          </div>
          <div style={{ display: "flex", marginLeft: 26, flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>
              @{snapshot.user.handle} · {snapshot.rangeLabelEn} · {snapshot.generatedDate}
            </div>
            <div style={{ display: "flex", marginTop: 11, color: palette.blue, fontSize: 24, fontWeight: 700 }}>kimi.builders/usage</div>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", maxWidth: 310, flexDirection: "column", color: palette.muted, fontSize: 16, lineHeight: 1.55 }}>
            <span style={{ display: "flex" }}>STANDARD API PRICE ESTIMATE</span>
            <span style={{ display: "flex" }}>PRIVATE AGGREGATED SYNC</span>
            <span style={{ display: "flex" }}>NO CONVERSATION CONTENT</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
