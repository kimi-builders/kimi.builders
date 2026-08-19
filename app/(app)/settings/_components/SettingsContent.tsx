/* 设置主体:完整页(/settings)与弹窗(@modal/(.)settings)共用。
   showTitle=false 时收起页头(弹窗自带标题栏)。
   版式:页头 eyebrow + .kb-h2(20260819 版式对齐,H1 图标下线);页签
   (资料/偏好/隐私与公开/账号)+ rounded-2xl 面板卡(标题 + 右侧口径小字);
   行式控件(左标题说明、右开关/分段/卡片)与用量页同一套 Kimi Design 语法。 */
import { AtSign } from "lucide-react";
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import { getSessionUser } from "@/src/lib/auth/session";
import { getUserPasswordHash, isOwnAvatarUrl } from "@/src/lib/auth/users";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getLinkedAccounts, getOwnProfile } from "@/src/lib/users";
import { getUsageSettings } from "@/src/lib/usage/settings";
import GithubIcon from "../../_components/GithubIcon";
import LoginGate from "../../_components/LoginGate";
import { LocaleSeg, ThemeCards, VibeCards } from "../../_components/pref-controls";
import UsagePrivacyForm from "../../usage/_components/UsagePrivacyForm";
import AiPrefsForm from "./AiPrefsForm";
import PasswordForm from "./PasswordForm";
import ProfileForm from "./ProfileForm";
import ProfilePrivacyForm from "./ProfilePrivacyForm";
import SettingsTabs from "./SettingsTabs";
import UnlinkButton from "./UnlinkButton";

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
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-paper">{title}</h2>
        <span className="font-mono text-xs text-grey">{note}</span>
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
  linked,
  linkError,
  linkProvider,
}: {
  showTitle?: boolean;
  /* OAuth 绑定回执:?linked=github / ?link_error=taken&p=github(落在「账号」页签) */
  linked?: string;
  linkError?: string;
  linkProvider?: string;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (!user) {
    return (
      <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
        {showTitle && (
          <div>
            <p className="kb-eyebrow">{t(locale, "set.eyebrow")}</p>
            <h1 className="kb-h2 mt-3">
              {t(locale, "set.title")}
            </h1>
          </div>
        )}
        {/* 未登录:统一登录引导卡(20260919) */}
        <div className={showTitle ? "mt-6" : ""}>
          <LoginGate
            locale={locale}
            title={t(locale, "gate.settings")}
            next="/settings"
          />
        </div>
      </div>
    );
  }

  const [own, accounts, usageSettings, passwordHash] = await Promise.all([
    getOwnProfile(user.id),
    getLinkedAccounts(user.id),
    getUsageSettings(user.id),
    /* 只用来推导 hasPassword 布尔;哈希本身不下发任何客户端 props */
    getUserPasswordHash(user.id),
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
        /* 20260819 版式对齐:页头接入 eyebrow + .kb-h2,H1 图标下线 */
        <div>
          <p className="kb-eyebrow">{t(locale, "set.eyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "set.title")}
          </h1>
          <p className="mt-2 text-sm text-grey">{t(locale, "set.subtitle")}</p>
        </div>
      )}

      <div className={showTitle ? "mt-6" : ""}>
        <SettingsTabs tabs={tabs} initialKey={linked || linkError ? "account" : undefined}>
          <Panel title={t(locale, "set.profile")} note={t(locale, "set.profileNote")}>
            <ProfileForm
              initial={{
                handle: own.handle,
                name: own.name,
                bio: own.bio,
                avatarUrl: own.avatarUrl,
              }}
              locale={locale}
              hasCustomAvatar={isOwnAvatarUrl(own.avatarUrl)}
            />
          </Panel>

          <Panel title={t(locale, "set.prefs")} note={t(locale, "set.prefsNote")}>
            <AiPrefsForm
              aiMine={own.aiRepliesEnabled}
              aiShow={own.showAiReplies}
              locale={locale}
            />
            <div className="flex items-center justify-between gap-4 border-t border-line py-4">
              <p className="text-sm font-medium text-paper">{t(locale, "set.locale")}</p>
              <LocaleSeg />
            </div>
            <div className="border-t border-line pt-4">
              <p className="text-sm font-medium text-paper">{t(locale, "set.theme")}</p>
              <div className="mt-3">
                <ThemeCards locale={locale} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-grey">{t(locale, "set.themeNote")}</p>
            </div>
            <div className="border-t border-line pt-4">
              <p className="text-sm font-medium text-paper">{t(locale, "set.vibe")}</p>
              <div className="mt-3">
                <VibeCards locale={locale} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-grey">{t(locale, "set.vibeNote")}</p>
            </div>
          </Panel>

          {/* 隐私与公开:资料展示(本页设置)+ 用量数据(与 /usage 共用同一份设置,
              任何一处保存全站生效) */}
          <Panel title={t(locale, "set.privacy")} note={t(locale, "set.privacyNote")}>
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-semibold text-paper">
                  {t(locale, "set.pdTitle")}
                </h3>
              </div>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-grey">
                {t(locale, "set.pdHint")}
              </p>
              <div className="mt-2">
                <ProfilePrivacyForm
                  showAvatar={own.showAvatar}
                  showName={own.showName}
                  showBio={own.showBio}
                  locale={locale}
                />
              </div>
            </div>
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-paper">
                {t(locale, "set.usageDataTitle")}
              </h3>
              <div className="mt-2">
                <UsagePrivacyForm
                  uploadProject={usageSettings.uploadProject}
                  showOnLeaderboard={usageSettings.showOnLeaderboard}
                  retentionDays={usageSettings.retentionDays}
                  zh={locale === "zh"}
                />
              </div>
            </div>
          </Panel>

          <Panel title={t(locale, "set.account")} note={t(locale, "set.accountNote")}>
            {linked && (
              <p className="mb-3 rounded-lg border border-blue/30 bg-blue/10 px-3 py-2 text-xs text-blue">
                {t(locale, "set.linkedOk", { p: linked === "github" ? "GitHub" : "Google" })}
              </p>
            )}
            {linkError && (
              <p className="mb-3 rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">
                {t(
                  locale,
                  linkError === "taken"
                    ? "set.linkTaken"
                    : linkError === "no_session"
                      ? "set.linkNoSession"
                      : "set.linkFailed",
                  { p: linkProvider === "github" ? "GitHub" : "Google" },
                )}
              </p>
            )}
            <div className="divide-y divide-line">
              {own.email && (
                <div className="flex items-center gap-3 py-4 first:pt-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper/[0.04] text-grey">
                    <AtSign size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-paper">{t(locale, "set.email")}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-grey">{own.email}</p>
                  </div>
                </div>
              )}
              {(["github", "google"] as const).map((p) => {
                const linkedAccount = accounts.find((a) => a.provider === p);
                return (
                  <div key={p} className="flex items-center gap-3 py-4 last:pb-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper/[0.04] font-mono text-xs font-semibold text-grey">
                      {p === "github" ? <GithubIcon size={15} /> : <GoogleColor size={15} />}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-paper">
                        {p === "github" ? "GitHub" : "Google"}
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                            linkedAccount
                              ? "border-blue/30 bg-blue/10 text-blue"
                              : "border-line text-grey"
                          }`}
                        >
                          {t(locale, linkedAccount ? "set.linkedBadge" : "set.notLinked")}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-grey">
                        {linkedAccount
                          ? t(locale, "set.linkedSince", { d: ymd(linkedAccount.createdAt) })
                          : t(locale, "set.linkHint")}
                      </p>
                    </div>
                    {!linkedAccount && (
                      <a
                        href={`/api/auth/${p}?link=1`}
                        className="ml-auto inline-flex min-h-9 shrink-0 items-center rounded-lg border border-line px-3 font-mono text-xs text-paper transition-colors hover:border-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                      >
                        {t(locale, "set.link")}
                      </a>
                    )}
                    {linkedAccount && (
                      <UnlinkButton
                        locale={locale}
                        provider={p}
                        providerName={p === "github" ? "GitHub" : "Google"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {/* 密码:有密码走「当前 + 新密码」改密;无密码(OAuth 注册)直接设置 */}
            <div className="mt-2 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-paper">
                {t(locale, "set.pwTitle")}
              </h3>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-grey">
                {t(locale, passwordHash !== null ? "set.pwHint" : "set.pwSetHint")}
              </p>
              <div className="mt-3 max-w-sm">
                <PasswordForm locale={locale} hasPassword={passwordHash !== null} />
              </div>
            </div>
          </Panel>
        </SettingsTabs>
      </div>
    </div>
  );
}
