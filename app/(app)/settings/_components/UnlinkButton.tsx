"use client";

/* Unlink button (the settings "account" tab, on each bound provider
   row): a confirm before submit; the last-login-method guard is
   re-checked in the server transaction. Success -> toast +
   router.refresh(); failure -> inline error. */
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { unlinkProviderAction, type SettingsState } from "../actions";

export default function UnlinkButton({
  locale,
  provider,
  providerName,
}: {
  locale: Locale;
  provider: "github" | "google";
  providerName: string;
}) {
  const [state, formAction, pending] = useActionState<
    SettingsState | null,
    FormData
  >(unlinkProviderAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast(t(locale, "set.unlinkedOk", { p: providerName }));
      router.refresh();
    }
  }, [state, locale, router, providerName]);

  return (
    <form
      action={formAction}
      className="ml-auto shrink-0"
      onSubmit={(e) => {
        if (!window.confirm(t(locale, "set.unlinkConfirm", { p: providerName })))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
      >
        {pending ? "…" : t(locale, "set.unlink")}
      </button>
      {state?.error && (
        <p className="mt-1 text-right text-xs text-status-danger-fg">
          {state.error}
        </p>
      )}
    </form>
  );
}
