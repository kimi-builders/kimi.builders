"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  parseWorksSource,
  readWorksSourceCookie,
  WORKS_SRC_COOKIE,
  type WorksSource,
} from "@/src/lib/works-view";

const subscribe = () => () => {};

function getBrowserSnapshot(): WorksSource | "" {
  return readWorksSourceCookie(document.cookie) ?? "";
}

export default function useWorksSource(
  initialSource: WorksSource | null,
): WorksSource | "" {
  const pathname = usePathname();
  const params = useSearchParams();
  const remembered = useSyncExternalStore(
    subscribe,
    getBrowserSnapshot,
    () => initialSource ?? "",
  );
  const active = pathname === "/works" ? "works"
    : pathname === "/awesome" ? "awesome"
    : pathname.startsWith("/works/") ? parseWorksSource(params.get("from"))
    : null;
  useEffect(() => {
    if (active) {
      document.cookie = `${WORKS_SRC_COOKIE}=${active}; Path=/; SameSite=Lax`;
    }
  }, [active]);
  return active ?? remembered;
}
