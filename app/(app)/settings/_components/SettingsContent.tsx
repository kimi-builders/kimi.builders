/* 设置主体:完整页(/settings)与弹窗(@modal/(.)settings)共用。
   showTitle=false 时收起 h1 与副标题(弹窗自带标题栏)。
   版式:页签(资料/偏好/隐私与公开/账号)+ rounded-2xl 面板卡(标题 + 右侧口径小字);
   行式控件(左标题说明、右开关/分段/卡片)与用量页同一套 Kimi Design 语法。 */
import { AtSign, Settings as SettingsIcon } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getLinkedAccounts, getOwnProfile } from "@/src/lib/users";
import { getUsageSettings } from "@/src/lib/usage/settings";
import GithubIcon from "../../_components/GithubIcon";
import { LocaleSeg, ThemeCards } from "../../_components/pref-controls";
import UsagePrivacyForm from "../../usage/_components/UsagePrivacyForm";
import AiPrefsForm from "./AiPrefsForm";
import ProfileForm from "./ProfileForm";
import SettingsTabs from "./SettingsTabs";

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-semibold text-paper">{title}</h2>
        <span className="font-mono text-[11px] text-grey">{note}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export default async function SettingsContent({
  showTitle = true,
}: {
  showTitle?: boolean;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (!user) {
    return (
      <div>
        {showTitle && (
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[0.2px] text-paper">
            <SettingsIcon size={20} aria-hidden="true" />
            {t(locale, "set.title")}
          </h1>
        )}
        <p className="mt-8 text-sm text-grey">
          {t(locale, "set.loginRequired")}
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
          <a
            href="/login"
            className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
          >
            {t(locale, "auth.email")}
          </a>
        </p>
      </div>
    );
  }

  const [own, accounts, usageSettings] = await Promise.all([
    getOwnProfile(user.id),
    getLinkedAccounts(user.id),
    getUsageSettings(user.id),
  ]);
  if (!own) return null;

  const tabs = [
    { key: "profile", label: t(locale, "set.profile") },
    { key: "prefs", label: t(locale, "set.prefs") },
    { key: "privacy", label: t(locale, "set.privacy") },
    { key: "account", label: t(locale, "set.account") },
  ];

  return (
    <div>
      {showTitle && (
        <>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[0.2px] text-paper">
            <SettingsIcon size={20} aria-hidden="true" />
            {t(locale, "set.title")}
          </h1>
          <p className="mt-2 text-[13px] text-grey">{t(locale, "set.subtitle")}</p>
        </>
      )}

      <div className={showTitle ? "mt-6" : ""}>
        <SettingsTabs tabs={tabs}>
          <Panel title={t(locale, "set.profile")} note={t(locale, "set.profileNote")}>
            <ProfileForm
              initial={{
                handle: own.handle,
                name: own.name,
                bio: own.bio,
                avatarUrl: own.avatarUrl,
              }}
              locale={locale}
            />
          </Panel>

          <Panel title={t(locale, "set.prefs")} note={t(locale, "set.prefsNote")}>
            <AiPrefsForm
              aiMine={own.aiRepliesEnabled}
              aiShow={own.showAiReplies}
              locale={locale}
            />
            <div className="flex items-center justify-between gap-4 border-t border-line py-4">
              <p className="text-[13px] font-medium text-paper">{t(locale, "set.locale")}</p>
              <LocaleSeg />
            </div>
            <div className="border-t border-line pt-4">
              <p className="text-[13px] font-medium text-paper">{t(locale, "set.theme")}</p>
              <div className="mt-3">
                <ThemeCards locale={locale} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-grey">{t(locale, "set.themeNote")}</p>
            </div>
          </Panel>

          {/* 隐私与公开:与 /usage 共用同一份设置,任何一处保存全站生效 */}
          <Panel title={t(locale, "set.privacy")} note={t(locale, "set.privacyNote")}>
            <UsagePrivacyForm
              uploadProject={usageSettings.uploadProject}
              showOnLeaderboard={usageSettings.showOnLeaderboard}
              retentionDays={usageSettings.retentionDays}
              zh={locale === "zh"}
            />
          </Panel>

          <Panel title={t(locale, "set.account")} note={t(locale, "set.accountNote")}>
            <div className="divide-y divide-line">
              {own.email && (
                <div className="flex items-center gap-3 py-3.5 first:pt-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper/[0.04] text-grey">
                    <AtSign size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-paper">{t(locale, "set.email")}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-grey">{own.email}</p>
                  </div>
                </div>
              )}
              {accounts.map((a) => (
                <div key={a.provider} className="flex items-center gap-3 py-3.5 last:pb-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper/[0.04] font-mono text-xs font-semibold text-grey">
                    {a.provider === "github" ? <GithubIcon size={15} /> : "G"}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-paper">
                      {a.provider === "github" ? "GitHub" : "Google"}
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                        {t(locale, "set.linkedBadge")}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-grey">
                      {t(locale, "set.linkedSince", { d: ymd(a.createdAt) })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </SettingsTabs>
      </div>
    </div>
  );
}
