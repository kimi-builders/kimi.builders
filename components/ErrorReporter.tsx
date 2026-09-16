"use client";

/* Global error listener: reports window `error` and `unhandledrejection`
   to /api/error fire-and-forget. Never throws, never blocks, no state —
   the reporter must not become a second error surface. Mounted once in
   the root layout. */
import { useEffect } from "react";

const REPORT_ENDPOINT = "/api/error";
const reported = new Set<string>();

function report(source: "client", message: string, stack?: string): void {
  try {
    const cappedMessage = message.slice(0, 500);
    const cappedStack = stack?.slice(0, 8000) ?? "";
    const fingerprint = `${source}\0${cappedMessage}\0${cappedStack.slice(0, 240)}`;
    if (reported.has(fingerprint)) return;
    if (reported.size >= 100) reported.clear();
    reported.add(fingerprint);
    const body = JSON.stringify({
      source,
      message: cappedMessage,
      stack: cappedStack,
      url: window.location.pathname.slice(0, 500),
    });
    /* keepalive: the page may be unloading while we report. */
    void fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    /* swallow — nothing here may throw */
  }
}

export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      report("client", event.message || "window error", event.error?.stack);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : `unhandled rejection: ${String(reason).slice(0, 200)}`;
        report("client", message, reason instanceof Error ? reason.stack : undefined);
      } catch {
        report("client", "unhandled rejection");
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
