"use client";

/* Profile form (the settings "profile" tab): display name / handle /
   bio / avatar URL. Success -> toast + router.refresh() (the top-bar
   avatar and profile update at once); failure -> inline errors (handle
   taken/format, lengths, URL validation all server-side). */
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FORM_BTN_PRIMARY,
  INPUT_CLS,
} from "@/components/form-classes";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { updateProfileAction, type SettingsState } from "../actions";
import AvatarField from "./AvatarField";

/* Control styles consolidated into the shared form-classes; aliases
   kept so call sites don't move. LABEL_CLS carries mb-1.5, so the old
   mt-1.5 on inputs was removed (same gap, not doubled). The label
   override: settings rows title their items in text-sm medium paper
   (see the Preferences tab) — the profile form's field titles match
   that grammar, with hints staying grey below. */
const inputCls = INPUT_CLS;
const labelCls = "mb-1.5 block text-sm font-medium text-paper";

export default function ProfileForm({
  initial,
  locale,
  hasCustomAvatar,
}: {
  initial: { handle: string; name: string; bio: string; avatarUrl: string };
  locale: Locale;
  /* Server-decided: an on-site uploaded avatar shows "reset to
     default". */
  hasCustomAvatar: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SettingsState | null,
    FormData
  >(updateProfileAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast(t(locale, "set.saved"));
      router.refresh();
    }
    // state is a fresh object per submit; feedback fires only on ok
  }, [state, locale, router]);

  /* max-w-2xl: the settings page runs on the wide no-rail canvas; a
     full-bleed ~1000px handle/bio input reads as a search bar. The cap
     keeps fields near the old reading-column width. */
  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {/* Identity first: the avatar anchors the profile — name/handle/
         bio read as its captions, not the other way round. */}
      <AvatarField
        locale={locale}
        handle={initial.handle}
        currentUrl={initial.avatarUrl}
        hasCustom={hasCustomAvatar}
        inputCls={inputCls}
        labelCls={labelCls}
      />
      <label className="block">
        <span className={labelCls}>
          {t(locale, "set.name")}
        </span>
        <input
          name="name"
          defaultValue={initial.name}
          maxLength={64}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className={labelCls}>Handle</span>
        <span className="flex items-center rounded-lg border border-line bg-bg focus-within:border-blue">
          <span className="pl-3 font-mono text-sm text-grey">@</span>
          <input
            name="handle"
            defaultValue={initial.handle}
            maxLength={28}
            className="w-full bg-transparent px-1.5 py-2.5 font-mono text-sm text-paper focus:outline-none"
          />
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-grey/80">
          {t(locale, "set.handleHint")}
        </span>
      </label>
      <label className="block">
        <span className={labelCls}>
          {t(locale, "set.bio")}
        </span>
        <textarea
          name="bio"
          rows={3}
          defaultValue={initial.bio}
          maxLength={300}
          className={inputCls}
        />
      </label>
      {state?.error && (
        <p className="text-xs text-status-danger-fg">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
 className={FORM_BTN_PRIMARY}
      >
        {pending ? t(locale, "set.saving") : t(locale, "set.save")}
      </button>
    </form>
  );
}
