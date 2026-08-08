/* UI 偏好(cookie 驱动,SSR 直出目标状态:无闪烁、无 JS 也能切换)。
   kb_nav=1 → 左栏收成图标轨;kb_sidebar=0 → 右栏隐藏(留细轨可重开)。
   切换动作在 app/community/actions.ts(toggleNavAction / toggleSidebarAction)。 */
import { cookies } from "next/headers";

export interface UiPrefs {
  navCollapsed: boolean;
  sidebarHidden: boolean;
}

export async function getUiPrefs(): Promise<UiPrefs> {
  const store = await cookies();
  return {
    navCollapsed: store.get("kb_nav")?.value === "1",
    sidebarHidden: store.get("kb_sidebar")?.value === "0",
  };
}
