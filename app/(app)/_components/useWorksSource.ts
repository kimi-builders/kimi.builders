"use client";

import { useSyncExternalStore } from "react";
import {
  readWorksSourceCookie,
  type WorksSource,
} from "@/src/lib/works-view";

const subscribe = () => () => {};

function getBrowserSnapshot(): WorksSource | "" {
  return readWorksSourceCookie(document.cookie) ?? "";
}

export default function useWorksSource(
  initialSource: WorksSource | null,
): WorksSource | "" {
  return useSyncExternalStore(
    subscribe,
    getBrowserSnapshot,
    () => initialSource ?? "",
  );
}
