"use client";

/* 作品列表视图切换(20260918):list(行式,默认)/ grid(封面墙)。
   点击写 kb-works-view cookie(path=/,一年)+ router.refresh()——服务端
   重渲染列表,无闪烁。样式沿用站内 segmented 语言(SEG_* 同款观感)。
   /works 与 /awesome 共用;同一 cookie,两页偏好一致。 */
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { WORKS_VIEW_COOKIE, type WorksView } from "@/src/lib/works-view";

/* 36px 按钮 + 8px 容器边框/内边距 = 44px,与排序和筛选同高。 */
const BTN =
  "inline-flex size-9 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

/* cookie 写在组件外:组件作用域内直接给 document.cookie 赋值会触发
   react-hooks/immutability(组件被假定可并发渲染,不许有可见副作用)。
   模式同 CurrencyToggle。 */
function writeViewCookie(value: WorksView) {
  document.cookie = `${WORKS_VIEW_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export default function WorksViewToggle({
  locale,
  view,
}: {
  locale: Locale;
  view: WorksView;
}) {
  const router = useRouter();
  const pick = (next: WorksView) => {
    if (next === view) return;
    writeViewCookie(next);
    router.refresh();
  };
  const items = [
    { key: "list" as const, label: t(locale, "works.viewList"), Icon: List },
    { key: "grid" as const, label: t(locale, "works.viewGrid"), Icon: LayoutGrid },
  ];
  return (
    <div
      role="group"
      aria-label={t(locale, "works.viewToggle")}
      className="ml-auto inline-flex h-11 items-center gap-0.5 self-center rounded-lg border border-line bg-card p-[3px]"
    >
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={view === key}
          title={label}
          onClick={() => pick(key)}
          className={`${BTN} ${view === key ? "bg-blue/10 text-blue" : "text-grey hover:text-paper"}`}
        >
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
