"use client";

/* Count-level client analytics: sends only the event/target/meta the
   taxonomy allowlist requires — never URLs, referrers, user identity,
   or any raw browser information. */
import {
  cloneElement,
  isValidElement,
  type MouseEventHandler,
  type ReactNode,
} from "react";

export type PosterSurface = "profile" | "post" | "work" | "usage" | "letter";

export type AnalyticsBeaconPayload =
  | {
      event: "featured_click";
      target_kind: "post" | "work";
      target_id: string;
      meta: { position: "home" | "rail" };
    }
  | {
      event: "poster_download";
      target_kind: "surface";
      target_id: PosterSurface;
      meta: { surface: PosterSurface };
    }
  | {
      event: "join_click";
      target_kind: "slot";
      target_id: "org" | "awesome" | "mail";
      meta: { slot: "org" | "awesome" | "mail" };
    };

const ENDPOINT = "/api/analytics/event";

/* sendBeacon suits clicks immediately followed by navigation/new
   windows; when the browser refuses the queue, fall back to a
   keepalive fetch. Both paths send a fixed JSON body, fail silently,
   and never touch the click behavior. */
export function trackBeacon(payload: AnalyticsBeaconPayload): void {
  const body = JSON.stringify(payload);
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.sendBeacon(
        ENDPOINT,
        new Blob([body], { type: "application/json" }),
      )
    ) {
      return;
    }
  } catch {
    /* fetch fallback when sendBeacon is unavailable or rejects the
       Blob. */
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    /* Analytics failures never disturb navigation or downloads. */
  });
}

type TrackableProps = {
  onClick?: MouseEventHandler<HTMLElement>;
};

/* Clone the single child and merge onClick: no extra DOM wrapper — the
   original <a>/<Link> semantics, href, target, keyboard behavior, and
   styles all survive. Guard note: at RSC boundaries/in dev, children
   may not be a cloneable element at runtime (props undefined — reading
   it directly crashes the route); non-elements render as-is and this
   one analytics pass is abandoned. */
export function TrackClick({
  payload,
  children,
}: {
  payload: AnalyticsBeaconPayload;
  children: ReactNode;
}) {
  if (!isValidElement<TrackableProps>(children)) return <>{children}</>;
  const originalClick = children.props.onClick;
  return cloneElement(children, {
    onClick: (event) => {
      originalClick?.(event);
      if (!event.defaultPrevented) trackBeacon(payload);
    },
  });
}
