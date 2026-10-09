"use client";

/* Shelf search box: URL-state search (?q=) — results stay SSR and
   linkable, same channel as the lens params. Enter commits; the clear
   button (shown only when a q is active) removes the param. Other lens
   params survive via baseQuery, so search composes with the toolbar. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function ExploreSearch({
  q,
  baseQuery,
  locale,
}: {
  q?: string;
  /* The page's current lens params (chapter/product/role/tag/year/type),
     serialized without q. */
  baseQuery?: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q ?? "");
  const push = (next: string) => {
    const params = new URLSearchParams(baseQuery ?? "");
    const trimmed = next.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.push(qs ? `/explore?${qs}` : "/explore");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    push(value);
  };
  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex min-h-11 w-full max-w-xs items-center gap-2 rounded-full border border-line bg-card pl-4 pr-1 transition-colors focus-within:border-paper/40"
    >
      <Search size={14} className="shrink-0 text-grey" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(locale, "explore.searchPlaceholder")}
        aria-label={t(locale, "explore.searchAria")}
        className="min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-grey/70"
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            push("");
          }}
          aria-label={t(locale, "explore.clearSearch")}
          data-tip={t(locale, "explore.clearSearch")}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-ui-blue"
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
