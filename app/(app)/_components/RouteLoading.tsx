"use client";

/* 应用内路由加载态(20260815 评审):挂在 (app) 组的 loading 边界上,
   三栏壳(顶栏/左栏/右栏)在软导航时不换脸,只有主列进加载态——
   取代此前根级 BrandLoading 整页置换造成的"闪一下全屏 logo"。
   形态与 BrandLoading 同源(小号瓷砖标 + LOADING.),密度降为列内组件;
   首次进站/直开 URL 的外层边界仍走根级 BrandLoading 海报。
   慢加载自救:>5s 出现「重试」(router.refresh 重取本路由),
   加载态不再是无出口的黑洞。 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function RouteLoading({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-tile.svg"
        alt="kimi.builders"
        className="h-12 w-12 rounded-lg"
      />
      <p className="mt-5 font-mono text-xs tracking-[0.08em] text-grey">
        LOADING<span className="text-ui-blue">.</span>
      </p>
      {slow && (
        <div className="mt-6 flex flex-col items-center gap-2.5">
          <p className="text-xs leading-relaxed text-grey">{t(locale, "load.slow")}</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 font-mono text-xs text-paper transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <RefreshCw size={13} aria-hidden="true" />
            {t(locale, "state.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
