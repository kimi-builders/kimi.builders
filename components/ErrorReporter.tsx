"use client";

/* Global error listener: reports window `error` and `unhandledrejection`
   to /api/error fire-and-forget. Never throws, never blocks, no state —
   the reporter must not become a second error surface. Mounted once in
   the root layout. */
import { useEffect } from "react";

const REPORT_ENDPOINT = "/api/error";

function report(source: "client", message: string, stack?: string): void {
  try {
    const body = JSON.stringify({
      source,
      message: message.slice(0, 500),
      stack: stack?.slice(0, 8000) ?? "",
      url: window.location.pathname.slice(0, 500),
      release: "",
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
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : `unhandled rejection: ${String(reason).slice(0, 200)}`;
      report("client", message, reason instanceof Error ? reason.stack : undefined);
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
