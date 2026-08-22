"use client";

/* Shared "load more" (feed / works wall / Awesome): the server action
   returns a server-rendered page (ReactNode serialized over RSC) the
   client appends directly; a null cursor means the end. Same pattern
   as CommentSection: the caller keys by the first page's content, so a
   fresh first page (refresh/delete) remounts, dropping appended pages
   back to page one. Appended cards drop straight into the parent
   container (no wrapper node): space-y / grid layouts keep working,
   and the button takes col-span-full for a full grid row (harmless in
   block layout). */
import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";

export interface LoadMorePage<T extends string | number = string | number> {
  nodes: ReactNode[];
  nextCursor: T | null;
}

export type LoadMoreResult<T extends string | number = string | number> =
  | ({ ok: true } & LoadMorePage<T>)
  | { ok: false };

export default function LoadMore<T extends string | number>({
  initialCursor,
  load,
  locale,
}: {
  /* The cursor type is the caller's: a string for the feed (hot uses a
     composite cursor), a numeric id for the works wall. */
  initialCursor: T | null;
  load: (cursor: T) => Promise<LoadMoreResult<T>>;
  locale: Locale;
}) {
  const [extra, setExtra] = useState<ReactNode[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [busy, setBusy] = useState(false);

  const more = async () => {
    if (busy || cursor === null) return;
    setBusy(true);
    try {
      const res = await load(cursor);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      setExtra((prev) => [...prev, ...res.nodes]);
      setCursor(res.nextCursor);
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {extra}
      {cursor !== null && (
        <button
          type="button"
          onClick={more}
          disabled={busy}
          aria-busy={busy}
          className="col-span-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-5 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue disabled:opacity-40"
        >
          {busy && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}
          {busy ? t(locale, "pager.loading") : t(locale, "pager.loadMore")}
        </button>
      )}
    </>
  );
}
