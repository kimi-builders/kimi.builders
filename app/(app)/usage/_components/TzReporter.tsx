"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/* Writes the browser's timezone into the kb_tz cookie (minutes, east
   of UTC positive, Beijing +480); the server does local day boundaries
   and hourly aggregation by it. Writes + one refresh only when missing
   or changed; after the refresh the cookie matches and the condition
   fails — no refresh loop. */
export default function TzReporter() {
  const router = useRouter();
  useEffect(() => {
    const tz = -new Date().getTimezoneOffset();
    const match = /(?:^|;\s*)kb_tz=(-?\d{1,4})/.exec(document.cookie);
    if (match && Number(match[1]) === tz) return;
    document.cookie = `kb_tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
