"use client";

/* Root-cause boundary: renders when the root layout itself fails. Must
   render its own <html>/<body>. Kept dependency-free (no i18n, no
   tokens — globals may not have loaded); inline hex colors instead of
   Tailwind classes are the deliberate exception, CSS may be gone too. */
import { useEffect } from "react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* Report in an effect, never during render; fire-and-forget and
       fully swallowed — this page must not grow a second failure. */
    try {
      void fetch("/api/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "global",
          message: error.message || "global error",
          stack: error.digest ? `digest: ${error.digest}` : (error.stack ?? ""),
          url: window.location.pathname.slice(0, 500),
        }),
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => undefined);
    } catch {
      /* swallow */
    }
  }, [error]);
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#101014", color: "#e8e8e4", fontFamily: "ui-monospace, monospace" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "96px 24px" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a8e94" }}>
            kimi.builders
          </p>
          <h1 style={{ fontSize: 22, marginTop: 12 }}>页面发生严重错误 / Something broke badly</h1>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#b9bcc2" }}>
            刷新通常可以恢复。/ A retry usually recovers.
          </p>
          {error.digest && <p style={{ fontSize: 11, color: "#8a8e94" }}>Ref: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 24, padding: "10px 18px", fontSize: 12, background: "#2456d6", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" }}
          >
            重试 / Retry
          </button>
        </main>
      </body>
    </html>
  );
}
