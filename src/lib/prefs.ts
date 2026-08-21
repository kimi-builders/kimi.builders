/* UI 偏好(cookie 驱动,SSR 直出目标状态:无闪烁、无 JS 也能切换)。
   kb_nav=1 → 左栏收成图标轨;kb_sidebar=0 → 右栏隐藏(左栏「界面」组重开);
   kb_theme=light → 亮色主题(默认暗色);
   kb_vibe=soft → 圆润经典气质(默认 poster 工程棱角,20260815 拍板);
   kb_motion=reduce → 手动减动效(20260821 评审;默认不设 = 跟随系统
   prefers-reduced-motion,切换器在设置页「偏好」)。
   切换动作在 app/(app)/community/actions.ts 与 settings/actions.ts。 */
import { cookies } from "next/headers";

export type Theme = "dark" | "light";
export type Vibe = "poster" | "soft";
export type Motion = "follow" | "reduce";

export interface UiPrefs {
  navCollapsed: boolean;
  sidebarHidden: boolean;
  theme: Theme;
  vibe: Vibe;
  motion: Motion;
}

export async function getUiPrefs(): Promise<UiPrefs> {
  const store = await cookies();
  return {
    navCollapsed: store.get("kb_nav")?.value === "1",
    sidebarHidden: store.get("kb_sidebar")?.value === "0",
    theme: store.get("kb_theme")?.value === "light" ? "light" : "dark",
    vibe: store.get("kb_vibe")?.value === "soft" ? "soft" : "poster",
    motion: store.get("kb_motion")?.value === "reduce" ? "reduce" : "follow",
  };
}
