"use client";

/* Global toast outlet: listens for the kb:toast events dispatched by
   toast(), stacked bottom-center. Mounted in the root layout, it
   survives client navigation; at most 3 at a time. Grading: error =
   red border + warning icon + 5.2s (error causes must be readable);
   info stays 2.6s; both close on click. detail tolerates the legacy
   string payload. */
import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

interface Item {
  id: number;
  message: string;
  kind: "info" | "error";
}

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let seq = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const on = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const message = String(
        (typeof detail === "string" ? detail : detail?.message) ?? "",
      ).trim();
      if (!message) return;
      const kind: Item["kind"] =
        typeof detail === "object" && detail?.kind === "error" ? "error" : "info";
      const id = ++seq;
      setItems((cur) => [...cur.slice(-2), { id, message, kind }]);
      const timer = setTimeout(() => {
        setItems((cur) => cur.filter((i) => i.id !== id));
        timers.delete(timer);
      }, kind === "error" ? 5200 : 2600);
      timers.add(timer);
    };
    window.addEventListener("kb:toast", on);
    return () => {
      window.removeEventListener("kb:toast", on);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-max max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6"
    >
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))}
          className={`kb-toast pointer-events-auto flex max-w-full items-start gap-2 border bg-bg px-4 py-2 text-left font-mono text-xs text-paper shadow-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
            i.kind === "error" ? "border-status-danger/50" : "border-line"
          }`}
        >
          {i.kind === "error" && (
            <CircleAlert size={13} className="mt-0.5 shrink-0 text-status-danger-fg" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words">{i.message}</span>
        </button>
      ))}
    </div>
  );
}
