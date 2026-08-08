/* 用量看板 /usage:登录后查看已有的 legacy Kimi Code 日汇总。
   v1 共享密钥同步已停用;v2 将使用每用户、每设备授权的多工具 Collector。
   Phase 0 保留已有数据的只读展示,不再向页面输出任何同步凭据。 */
import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getUsageDays, getUsageLastSync, type UsageDay } from "@/src/lib/usage";

export const metadata: Metadata = { title: "用量 — kimi.builders" };

/* 1.2k / 3.4M 式的 token 计数 */
function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function fmtHours(sec: number, locale: "zh" | "en"): string {
  const h = sec / 3600;
  if (h >= 1) return locale === "en" ? `${h.toFixed(1)}h` : `${h.toFixed(1)} 小时`;
  const m = Math.round(sec / 60);
  return locale === "en" ? `${m}m` : `${m} 分钟`;
}

function Chart({ days, locale }: { days: UsageDay[]; locale: "zh" | "en" }) {
  const shown = days.slice(-30);
  const max = Math.max(1, ...shown.map((d) => d.tokensIn + d.tokensOut));
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {shown.map((d) => {
          const total = d.tokensIn + d.tokensOut;
          const pct = Math.max(2, Math.round((total / max) * 100));
          return (
            <div
              key={d.day}
              title={`${d.day} · ${fmtTokens(total)} ${t(locale, "usage.tokensUnit")}`}
              className="flex-1 bg-blue/70 transition-colors hover:bg-blue"
              style={{ height: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-grey">
        <span>{shown[0]?.day.slice(5)}</span>
        <span>{shown[shown.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

export default async function UsagePage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (!user) {
    return (
      <div>
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <BarChart3 size={17} />
          {t(locale, "nav.usage")}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-grey">
          {t(locale, "usage.intro")}
        </p>
        <p className="mt-8 text-sm text-grey">
          {t(locale, "usage.loginRequired")}
          <a
            href="/api/auth/github"
            className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
          >
            GitHub
          </a>
          <a
            href="/api/auth/google"
            className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
          >
            Google
          </a>
        </p>
      </div>
    );
  }

  const [days, lastSync] = await Promise.all([
    getUsageDays(user.id),
    getUsageLastSync(user.id),
  ]);
  const last30 = days.slice(-30);
  const sum = (k: keyof UsageDay) =>
    last30.reduce((s, d) => s + (typeof d[k] === "number" ? (d[k] as number) : 0), 0);

  return (
    <div>
      <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
        <BarChart3 size={17} />
        {t(locale, "nav.usage")}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-grey">
        {t(locale, "usage.intro")}
      </p>

      {days.length > 0 && (
        <>
          <section className="mt-6 border border-line bg-card p-4">
            <h2 className="font-mono text-[10px] tracking-[0.25em] text-grey">
              {t(locale, "usage.last30")}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                { n: fmtTokens(sum("tokensIn")), l: t(locale, "usage.tokensIn") },
                { n: fmtTokens(sum("tokensOut")), l: t(locale, "usage.tokensOut") },
                { n: fmtTokens(sum("tokensCached")), l: t(locale, "usage.cached") },
                { n: fmtTokens(sum("messages")), l: t(locale, "usage.calls") },
                { n: fmtHours(sum("activeSeconds"), locale), l: t(locale, "usage.active") },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-mono text-lg font-semibold text-paper">
                    {s.n}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-grey">{s.l}</div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <Chart days={days} locale={locale} />
            </div>
            {lastSync && (
              <p className="mt-3 font-mono text-[10px] text-grey">
                {t(locale, "usage.lastSync", { t: relTime(lastSync, locale) })}
              </p>
            )}
          </section>
        </>
      )}

      <section className="mt-6 border border-line bg-card p-4">
        <h2 className="font-mono text-[10px] tracking-[0.25em] text-grey">
          {t(locale, "usage.syncStatus")}
        </h2>
        {days.length === 0 && (
          <p className="mt-3 text-sm text-grey">{t(locale, "usage.noData")}</p>
        )}
        <div className="mt-3 border-l-2 border-blue bg-blue/5 px-3 py-2.5">
          <p className="text-sm leading-relaxed text-paper">
            {t(locale, "usage.migrationNotice")}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-grey">
            {t(locale, "usage.migrationDetail")}
          </p>
        </div>
      </section>
    </div>
  );
}
