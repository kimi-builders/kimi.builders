"use client";

import { useEffect } from "react";

export default function DeviceCodeUrlCleanup() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("code")) return;
    url.searchParams.delete("code");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return null;
}
