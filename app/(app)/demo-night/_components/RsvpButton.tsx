"use client";

/* Demo Night RSVP button: optimistic flip (copy + icon); success
   toasts and router.refresh()es the attendance list, failure rolls
   back. The "RSVPing is public" hint beside it renders statically on
   the page. */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { cancelDemoNightRsvpAction, rsvpDemoNightAction } from "../actions";

export default function RsvpButton({
  eventId,
  rsvped: initial,
  locale,
}: {
  eventId: number;
  rsvped: boolean;
  locale: Locale;
}) {
  const [rsvped, setRsvped] = useState(initial);
  const busy = useRef(false);
  const router = useRouter();

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !rsvped;
    setRsvped(next);
    try {
      const fd = new FormData();
      fd.set("event_id", String(eventId));
      const r = next
        ? await rsvpDemoNightAction(fd)
        : await cancelDemoNightRsvpAction(fd);
      if (!r.ok) throw new Error("rsvp failed");
      toast(t(locale, next ? "toast.rsvped" : "toast.rsvpCancelled"));
      router.refresh();
    } catch {
      setRsvped(!next);
      toast(t(locale, "toast.failed"), "error");
    } finally {
      busy.current = false;
    }
  };

  const Icon = rsvped ? CalendarCheck : CalendarPlus;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={rsvped}
      aria-label={t(locale, rsvped ? "dn.cancelRsvp" : "dn.rsvp")}
      title={t(locale, rsvped ? "dn.cancelRsvp" : "dn.rsvp")}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-5 font-mono text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
        rsvped
          ? "border border-blue bg-transparent text-blue hover:bg-blue/10"
 : "bg-blue text-white hover:opacity-90"
      }`}
    >
      <Icon size={14} aria-hidden="true" />
      {t(locale, rsvped ? "dn.rsvped" : "dn.rsvp")}
    </button>
  );
}
