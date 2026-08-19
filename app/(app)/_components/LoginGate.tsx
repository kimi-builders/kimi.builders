/* 登录引导卡(20260919):受限页面未登录时的统一门面——全站唯一的登录 UI
   在 /login(拦截弹窗/完整页),这里只做引导:一句上下文文案 + 蓝色主按钮
   进登录弹窗(带 next 回跳),下方 OAuth 快捷入口(与登录页同源的
   OAuthButtons)。此前 /usage、/community/new、/works/new 等各自造登录门,
   三种样式三种能力(发帖页甚至没有邮箱入口),统一后直开 URL 也是同一张脸。
   侧栏入口在未登录时直链 /login(应用内即弹窗),本卡是直开/刷新的兜底。 */
import Link from "next/link";
import { LogIn } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import OAuthButtons from "@/components/OAuthButtons";

export default function LoginGate({
  locale,
  title,
  next,
}: {
  locale: Locale;
  /* 上下文文案:登录后能干什么(调用方传 t() 结果) */
  title: string;
  /* 回跳路径(当前页) */
  next: string;
}) {
  const query = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="rounded-2xl border border-line bg-card p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-moon text-blue">
        <LogIn size={22} aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm leading-relaxed text-paper">{title}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-grey">
        {t(locale, "gate.hint")}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {/* Link 软导航(20260919):应用内点击走拦截路由弹出登录弹窗;
            原生 <a> 会硬导航成完整页,形态跳变 */}
        <Link
          href={`/login${query}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "gate.login")}
        </Link>
        <OAuthButtons next={next} />
      </div>
    </div>
  );
}
