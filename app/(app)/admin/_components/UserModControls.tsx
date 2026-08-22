"use client";

/* /admin user-row moderation controls: mute (1/3/7/30 days/forever,
   with a reason prompt) / unmute / profile reset (confirm) / role
   change (admin only, member <-> mod). Chain: pending -> toast ->
   router.refresh() (the site's mutation convention). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import {
  muteUserAction,
  resetProfileAction,
  setRoleAction,
  unmuteUserAction,
} from "../actions";

export default function UserModControls({
  userId,
  role,
  muted,
  isAdmin,
  locale,
}: {
  userId: number;
  role: string;
  /* Currently muted (computed server-side as muted_until > NOW()). */
  muted: boolean;
  /* The viewer is an admin (role-management entry; admin target rows
     render no controls at all). */
  isAdmin: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState("7");

  const run = async (
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    okToast: string,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await action(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"), "error");
        return;
      }
      toast(okToast);
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const mute = () => {
    const reason = window.prompt(t(locale, "admin.mutePrompt"), "");
    if (reason === null) return;
    const fd = new FormData();
    fd.set("user_id", String(userId));
    fd.set("duration", days);
    fd.set("reason", reason);
    void run(muteUserAction, fd, t(locale, "admin.toastMuted"));
  };

  const unmute = () => {
    const fd = new FormData();
    fd.set("user_id", String(userId));
    void run(unmuteUserAction, fd, t(locale, "admin.toastUnmuted"));
  };

  const resetProfile = () => {
    if (!window.confirm(t(locale, "admin.resetConfirm"))) return;
    const fd = new FormData();
    fd.set("user_id", String(userId));
    fd.set("reason", "profile reset");
    void run(resetProfileAction, fd, t(locale, "admin.toastReset"));
  };

  const setRole = (next: "member" | "mod") => {
    if (!window.confirm(t(locale, next === "mod" ? "admin.grantConfirm" : "admin.revokeConfirm"))) return;
    const fd = new FormData();
    fd.set("user_id", String(userId));
    fd.set("role", next);
    void run(setRoleAction, fd, t(locale, "admin.toastRole"));
  };

  const btn =
    "inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40";

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select
        value={days}
        onChange={(e) => setDays(e.target.value)}
        aria-label={t(locale, "admin.muteDuration")}
        className="h-8 rounded-lg border border-line bg-bg px-2 font-mono text-xs text-paper focus:border-blue focus:outline-none"
      >
        <option value="1">{t(locale, "admin.mute1d")}</option>
        <option value="3">{t(locale, "admin.mute3d")}</option>
        <option value="7">{t(locale, "admin.mute7d")}</option>
        <option value="30">{t(locale, "admin.mute30d")}</option>
        <option value="forever">{t(locale, "admin.muteForever")}</option>
      </select>
      {muted ? (
        <button type="button" onClick={unmute} disabled={busy} className={btn}>
          {t(locale, "admin.unmute")}
        </button>
      ) : (
        <button type="button" onClick={mute} disabled={busy} className={btn}>
          {t(locale, "admin.mute")}
        </button>
      )}
      <button type="button" onClick={resetProfile} disabled={busy} className={btn}>
        {t(locale, "admin.resetProfile")}
      </button>
      {isAdmin && role === "member" && (
        <button type="button" onClick={() => setRole("mod")} disabled={busy} className={btn}>
          {t(locale, "admin.grantMod")}
        </button>
      )}
      {isAdmin && role === "mod" && (
        <button type="button" onClick={() => setRole("member")} disabled={busy} className={btn}>
          {t(locale, "admin.revokeMod")}
        </button>
      )}
    </span>
  );
}
