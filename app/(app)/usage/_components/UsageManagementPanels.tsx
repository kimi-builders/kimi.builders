import { Clock3 } from "lucide-react";
import { relTime } from "@/src/lib/format";
import type { Locale } from "@/src/lib/i18n";
import type { UsageDeviceSummary } from "@/src/lib/usage/device";
import { usageDeviceDetail, usageDeviceDisplayName } from "@/src/lib/usage/device-label";
import { usageSourceLabel } from "@/src/lib/usage/labels";
import { USAGE_STALE_AFTER_HOURS } from "@/src/lib/usage/presentation";
import type { UsageSettings } from "@/src/lib/usage/settings";
import DeleteAllUsageDialog from "./DeleteAllUsageDialog";
import DeviceManagementDialog from "./DeviceManagementDialog";
import UsageLoadErrorCard from "./UsageLoadErrorCard";
import UsagePrivacyForm from "./UsagePrivacyForm";

function hoursSince(value: Date | string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 3_600_000;
}

export default function UsageManagementPanels({
  devices,
  deviceErrorReference,
  settings,
  locale,
}: {
  devices: UsageDeviceSummary[] | null;
  deviceErrorReference?: string;
  settings: UsageSettings;
  locale: Locale;
}) {
  const zh = locale === "zh";
  const bucketCount = devices?.reduce((sum, device) => sum + device.bucketCount, 0) ?? 0;
  const sessionCount = devices?.reduce((sum, device) => sum + device.sessionCount, 0) ?? 0;

  return (
    <div id="usage-management" className="mt-4 grid scroll-mt-4 gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby="usage-devices-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="usage-devices-title" className="text-sm font-semibold text-paper">
            {zh ? "设备与 Key" : "Devices & keys"}
          </h2>
          <a
            href="/usage/device"
            className="inline-flex min-h-11 items-center px-2 font-mono text-xs text-ui-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            + {zh ? "连接" : "Connect"}
          </a>
        </div>
        {devices === null && deviceErrorReference ? (
          <div className="mt-4">
            <UsageLoadErrorCard reference={deviceErrorReference} zh={zh} compact />
          </div>
        ) : devices?.length === 0 ? (
          <p className="mt-5 text-xs text-grey">{zh ? "还没有已授权设备。" : "No authorized devices yet."}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {devices?.map((device) => {
              const stale = hoursSince(device.lastSeenAt) > USAGE_STALE_AFTER_HOURS;
              const displayName = usageDeviceDisplayName(device);
              const detail = usageDeviceDetail(device);
              const agentVersions = Object.entries(device.agentVersions);
              return (
                <li key={device.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-paper">{displayName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-grey">
                        <span title={detail}>
                          {detail}{device.lastSeenAt ? ` · ${relTime(device.lastSeenAt, locale)}` : ""}
                        </span>
                        {stale && (
                          <span className="inline-flex items-center gap-1 text-grey">
                            <Clock3 size={11} aria-hidden="true" />
                            {zh
                              ? `>${USAGE_STALE_AFTER_HOURS}h 未同步`
                              : `stale >${USAGE_STALE_AFTER_HOURS}h`}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 font-mono text-xs text-grey/80">
                        {device.bucketCount.toLocaleString()} buckets · {device.sessionCount.toLocaleString()} sessions
                      </div>
                      {agentVersions.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-grey/80">
                          {agentVersions.map(([source, version]) => (
                            <span key={source}>{usageSourceLabel(source)} v{version.replace(/^v/i, "")}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {device.revokedAt ? (
                        <span className="rounded-md border border-line px-2 py-1 font-mono text-xs text-grey">
                          {zh ? "已撤销" : "Revoked"}
                        </span>
                      ) : null}
                      <DeviceManagementDialog
                        key={`${device.id}:${device.revokedAt ? "revoked" : "active"}`}
                        deviceId={device.id}
                        deviceName={displayName}
                        bucketCount={device.bucketCount}
                        sessionCount={device.sessionCount}
                        revoked={Boolean(device.revokedAt)}
                        zh={zh}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby="usage-privacy-title">
        <h2 id="usage-privacy-title" className="text-sm font-semibold text-paper">
          {zh ? "隐私设置" : "Privacy"}
        </h2>
        <UsagePrivacyForm
          uploadProject={settings.uploadProject}
          showOnLeaderboard={settings.showOnLeaderboard}
          retentionDays={settings.retentionDays}
          zh={zh}
        />
        {(bucketCount > 0 || sessionCount > 0 || devices === null) && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-3 text-xs leading-relaxed text-grey">
              {zh
                ? "危险操作会保留设备授权；如需停止同步，请先在设备管理中撤销对应 Key。"
                : "Dangerous data operations keep device authorizations. Revoke the corresponding key first if you also want syncing to stop."}
            </p>
            {devices ? (
              <DeleteAllUsageDialog bucketCount={bucketCount} sessionCount={sessionCount} zh={zh} />
            ) : (
              <p className="text-xs text-grey">
                {zh ? "设备数据加载成功后才可执行全量删除。" : "Load device data before deleting all usage."}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
