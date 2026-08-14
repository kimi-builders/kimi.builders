"use client";

/* 计数级客户端埋点:只发送 taxonomy 白名单所需的 event/target/meta,
   不采集 URL、referrer、用户身份或任何浏览器原始信息。 */
import {
  cloneElement,
  isValidElement,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";

export type PosterSurface = "profile" | "post" | "work" | "usage";

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

/* sendBeacon 适合紧随导航/新窗口的点击;浏览器拒绝排队时回落 keepalive fetch。
   两条路径都只发固定 JSON body,失败静默,不影响原点击行为。 */
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
    /* sendBeacon 不可用/拒绝 Blob 时走 fetch fallback */
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    /* 分析失败不打扰导航或下载 */
  });
}

type TrackableProps = {
  onClick?: MouseEventHandler<HTMLElement>;
};

/* 克隆唯一子元素并合并 onClick:不新增 DOM 包裹层,原 <a>/<Link> 的语义、
   href、target、键盘行为与样式全部保持不变。
   注意守卫:RSC 边界/dev 模式下 children 运行时可能不是可直接克隆的元素
   (props 为 undefined,直接读会崩整个路由);非元素时原样渲染、放弃这次埋点。 */
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
