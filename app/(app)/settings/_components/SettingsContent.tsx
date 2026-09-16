/* Settings body: shared by the full page (/settings) and the modal
   (@modal/(.)settings). showTitle=false collapses the header (the
   modal has its own title bar). Layout: header eyebrow + .kb-h2; tabs
   (profile/preferences/privacy & publicity/account) + rounded-2xl
   panel cards (title + right-side fine print); row controls (title +
   description left, switch/segment/cards right) share the usage
   page's Kimi Design grammar. */
import Link from "next/link";
import { AtSign } from "lucide-react";
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import { getSessionUser } from "@/src/lib/auth/session";
import { getUserPasswordHash, isOwnAvatarUrl } from "@/src/lib/auth/users";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getLinkedAccounts, getOwnProfile } from "@/src/lib/users";
import { listSessions } from "@/src/lib/auth/session";
import { pendingEmailChange } from "@/src/lib/auth/email-verify";
import { getUiPrefs } from "@/src/lib/prefs";
import { getUsageSettings } from "@/src/lib/usage/settings";
import GithubIcon from "../../_components/GithubIcon";
import LoginGate from "../../_components/LoginGate";
import { LocaleSeg, MotionSeg, NavToggle, SidebarToggle, ThemeCards, VibeCards } from "../../_components/pref-controls";
import UsagePrivacyForm from "../../usage/_components/UsagePrivacyForm";
import AiPrefsForm from "./AiPrefsForm";
import PasswordForm from "./PasswordForm";
import DeleteAccountButton from "./DeleteAccountButton";
import AccountSecurity from "./AccountSecurity";
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
  /* Flat section, no wrapping card: settings surfaces inside the
     route modal and on the page both already provide the frame — a
     bordered panel card here stacked box-in-box. Sections are the
     heading row plus hairline-separated rows below (the rows carry
     their own border-t / divide-y). */
  return (
    <section>
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

/* The settings-page styling for the "interface layout" pair (same
   grammar as the left rail's DISPLAY group; equal form widths come
   from globals.css's .panel-pair rule). */
const layoutPairBtnCls =
  "flex min-h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue";

export default async function SettingsContent({
  showTitle = true,
  linked,
  linkError,
  linkProvider,
  verified,
  emailChanged,
  verifyFailed,
}: {
  showTitle?: boolean;
  /* OAuth link receipt: ?linked=github / ?link_error=taken&p=github
     (landing on the "account" tab). */
  linked?: string;
  linkError?: string;
  linkProvider?: string;
  /* Email verification / change receipts (?verified=1 etc. from the
     one-time link endpoints). */
  verified?: boolean;
  emailChanged?: boolean;
  verifyFailed?: boolean;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (!user) {
    /* No wrapper card: LoginGate carries its own card, and a second
       frame around header + gate stacked boxes (same de-nesting as
       Panel above). */
    return (
      <div>
        {showTitle && (
          <div>
            <p className="kb-eyebrow">{t(locale, "set.eyebrow")}</p>
            <h1 className="kb-h2 mt-3">
              {t(locale, "set.title")}
            </h1>
          </div>
        )}
        {/* Signed out: unified login-prompt card */}
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

  const [own, accounts, usageSettings, passwordHash, prefs, sessions, pendingNewEmail] = await Promise.all([
    getOwnProfile(user.id),
    getLinkedAccounts(user.id),
    getUsageSettings(user.id),
    /* Only derives the hasPassword boolean; the hash itself never
       reaches any client props. */
    getUserPasswordHash(user.id),
    /* The motion seg's SSR initial value (the kb_motion cookie). */
    getUiPrefs(),
    /* Device registry + in-flight email change (B3). */
    listSessions(user.id),
    pendingEmailChange(user.id),
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
        /* Layout alignment: the header takes eyebrow + .kb-h2; the h1
           icon is retired. */
        <div>
          <p className="kb-eyebrow">{t(locale, "set.eyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "set.title")}
          </h1>
          <p className="mt-2 text-sm text-grey">{t(locale, "set.subtitle")}</p>
        </div>
      )}

      <div className={showTitle ? "mt-6" : ""}>
        <SettingsTabs
          tabs={tabs}
          initialKey={linked || linkError || verified || emailChanged || verifyFailed ? "account" : undefined}
          ariaLabel={t(locale, "set.tabsLabel")}
        >
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
              <LocaleSeg locale={locale} />
            </div>
            {/* Motion: a manual reduce-motion opt-out; following the system stays the default */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line py-4">
              <div>
                <p className="text-sm font-medium text-paper">{t(locale, "set.motion")}</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-grey">{t(locale, "set.motionNote")}</p>
              </div>
              <MotionSeg locale={locale} initial={prefs.motion} />
            </div>
            {/* Theme/vibe/layout: the same row grammar as locale/motion —
                title + note left, picker right. The pickers are flat
                preview tiles (pref-controls), so no card-in-card. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line py-4">
              <div>
                <p className="text-sm font-medium text-paper">{t(locale, "set.theme")}</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-grey">{t(locale, "set.themeNote")}</p>
              </div>
              <ThemeCards locale={locale} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line py-4">
              <div>
                <p className="text-sm font-medium text-paper">{t(locale, "set.vibe")}</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-grey">{t(locale, "set.vibeNote")}</p>
              </div>
              <VibeCards locale={locale} />
            </div>
            {/* Layout: a second entry point for collapsing the left nav and
                hiding the right rail, improving discoverability of the two
                DISPLAY keys; the buttons reuse pref-controls' NavToggle /
                SidebarToggle (optimistic cookie flip, same switch as the
                left nav). */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line py-4">
              <div>
                <p className="text-sm font-medium text-paper">{t(locale, "set.layout")}</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-grey">{t(locale, "set.layoutNote")}</p>
              </div>
              <div className="panel-pair flex max-w-md gap-1.5">
                <NavToggle locale={locale} className={layoutPairBtnCls} />
                <SidebarToggle locale={locale} className={layoutPairBtnCls} />
              </div>
            </div>
          </Panel>

          {/* Privacy and visibility: profile display (set here) + usage data
              (shares one settings record with /usage; saving from either
              place applies site-wide) */}
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
                  uploadDeviceLabel={usageSettings.uploadDeviceLabel}
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
            {verified && (
              <p className="mb-3 rounded-lg border border-status-ok/40 bg-status-ok/10 px-3 py-2 text-xs text-status-ok">
                {t(locale, "set.verifyOkBanner")}
              </p>
            )}
            {emailChanged && (
              <p className="mb-3 rounded-lg border border-status-ok/40 bg-status-ok/10 px-3 py-2 text-xs text-status-ok">
                {t(locale, "set.emailChangedBanner")}
              </p>
            )}
            {verifyFailed && (
              <p className="mb-3 rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">
                {t(locale, "set.verifyFailBanner")}
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
            {/* Password: with an existing one, change via current + new; without one (OAuth signup) set it directly */}
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
            {/* Email verification / change + device sessions (B3). */}
            <AccountSecurity
              locale={locale}
              email={own.email}
              verified={own.emailVerified}
              hasPassword={passwordHash !== null}
              pendingNewEmail={pendingNewEmail}
              sessions={sessions.map((row) => ({
                id: row.id,
                ua: row.ua,
                createdAt: row.createdAt.toISOString(),
                lastSeenAt: row.lastSeenAt.toISOString(),
                current: row.current,
              }))}
            />
            {/* Danger zone (B3): self-service deletion lives at the very
                bottom of the account tab — present, discoverable, never
                adjacent to routine controls. */}
            <div className="mt-6 rounded-xl border border-status-danger/30 p-4">
              <h3 className="text-sm font-semibold text-paper">
                {t(locale, "set.dangerZone")}
              </h3>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-grey">
                {t(locale, "set.deleteHint")}
              </p>
              <div className="mt-3">
                <DeleteAccountButton locale={locale} handle={user.handle} />
              </div>
              <p className="mt-4 font-mono text-[11px] text-grey/70">
                {t(locale, "legal.accountNote")}{" "}
                <Link href="/privacy" className="underline decoration-line underline-offset-4 hover:text-ui-blue">
                  {t(locale, "legal.privacy")}
                </Link>
                {" · "}
                <Link href="/terms" className="underline decoration-line underline-offset-4 hover:text-ui-blue">
                  {t(locale, "legal.terms")}
                </Link>
              </p>
            </div>
          </Panel>
        </SettingsTabs>
      </div>
    </div>
  );
}
