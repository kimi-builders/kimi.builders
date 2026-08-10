/* 设置主体:完整页(/settings)与弹窗(@modal/(.)settings)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏)。 */
import { Settings as SettingsIcon } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getLinkedAccounts, getOwnProfile } from "@/src/lib/users";
import { getUsageSettings } from "@/src/lib/usage/settings";
import { LocaleToggle, ThemeToggle } from "../../_components/pref-controls";
import UsagePrivacyForm from "../../usage/_components/UsagePrivacyForm";
import AiPrefsForm from "./AiPrefsForm";
import ProfileForm from "./ProfileForm";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-card p-4">
      <h2 className="font-mono text-[10px] tracking-[0.25em] text-grey">
        {title}
      </h2>
      {children}
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
          <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
            <SettingsIcon size={17} />
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

  const prefBtn =
    "flex items-center gap-2 border border-line px-3 py-2 font-mono text-xs text-paper transition-colors hover:border-blue hover:text-blue";

  return (
    <div>
      {showTitle && (
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <SettingsIcon size={17} />
          {t(locale, "set.title")}
        </h1>
      )}

      <div className="mt-6 space-y-5">
        <Section title={t(locale, "set.profile")}>
          <ProfileForm
            initial={{
              handle: own.handle,
              name: own.name,
              bio: own.bio,
              avatarUrl: own.avatarUrl,
            }}
            locale={locale}
          />
        </Section>

        <Section title={t(locale, "set.prefs")}>
          <AiPrefsForm
            aiMine={own.aiRepliesEnabled}
            aiShow={own.showAiReplies}
            locale={locale}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4">
            <span className="flex items-center gap-2 text-sm text-paper">
              <span className="font-mono text-[11px] text-grey">
                {t(locale, "set.locale")}
              </span>
              <LocaleToggle className={prefBtn} />
            </span>
            <span className="flex items-center gap-2 text-sm text-paper">
              <span className="font-mono text-[11px] text-grey">
                {t(locale, "set.theme")}
              </span>
              <ThemeToggle className={prefBtn} />
            </span>
          </div>
        </Section>

        {/* 隐私与公开:与 /usage 共用同一份设置,任何一处保存全站生效 */}
        <Section title={t(locale, "set.privacy")}>
          <UsagePrivacyForm
            uploadProject={usageSettings.uploadProject}
            showOnLeaderboard={usageSettings.showOnLeaderboard}
            retentionDays={usageSettings.retentionDays}
            zh={locale === "zh"}
          />
        </Section>

        <Section title={t(locale, "set.account")}>
          {own.email && (
            <p className="mt-3 font-mono text-xs text-grey">
              {t(locale, "set.email")}:{" "}
              <span className="text-paper">{own.email}</span>
            </p>
          )}
          <p className="mt-3 font-mono text-[11px] text-grey">
            {t(locale, "set.linked")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {accounts.map((a) => (
              <li
                key={a.provider}
                className="flex items-center gap-3 font-mono text-xs"
              >
                <span className="text-paper">
                  {a.provider === "github" ? "GitHub" : "Google"}
                </span>
                <span className="text-grey">
                  {t(locale, "set.linkedSince", { d: ymd(a.createdAt) })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
