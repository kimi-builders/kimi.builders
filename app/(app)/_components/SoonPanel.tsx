/* 「正在路上」占位页:未就绪板块(见 src/lib/upcoming.ts)的统一空态,
   代替空白功能上线。视觉沿用 panel 语法:mono kicker + 标题 + 说明 + 回社区链接。
   期望管理(20260815 评审):expect 交代第一批会上什么(把「此处无内容」
   转成「值得回来」);关注入口给一个回访钩子(GitHub Org 动态),
   站点没有newsletter,这里是诚实等效物。 */
import Link from "next/link";
import { t, type Locale } from "@/src/lib/i18n";

export default function SoonPanel({
  title,
  locale,
  expect,
}: {
  title: string;
  locale: Locale;
  /* 第一批内容方向(可选):板块页传入,管理/编辑入口不传 */
  expect?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-6 py-14 text-center sm:py-20">
      <p className="font-mono text-xs tracking-[0.08em] text-ui-blue">
        {t(locale, "soon.kicker")}
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-[0.2px] text-paper">
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-grey">
        {t(locale, "soon.body")}
      </p>
      {expect && (
        <p className="mx-auto mt-3 max-w-md border-l-2 border-blue/60 pl-3 text-left text-sm leading-relaxed text-paper/80">
          {expect}
        </p>
      )}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
        <Link
          href="/community"
          className="inline-flex min-h-9 items-center rounded-lg border border-line px-4 font-mono text-xs text-paper transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "soon.back")}
        </Link>
        <a
          href="https://github.com/kimi-builders"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center font-mono text-xs text-ui-blue transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "soon.follow")} →
        </a>
      </div>
    </div>
  );
}
