/* 知识库 · 路径总览 v3(20260816 三轮重设计;20260921 评审修订)
   · hero 右侧 PATH STACK 卡(mac 点 + 编号行 + 档位色右边条)= /ai 的
     FIELD GUIDE STACK,一屏给出全部路径的地图;
   · 编选法四条纪律(编号条款)= RFC §2 的可视化;
   · 路径条目整行式(编号徽章 + eyebrow + 大标题 + 摘要 + 验证戳),
     路径是「旅程」,条目要有目录感、可通读。
   20260921 评审修订:资源计数与详情页同口径(只数可见:external + ref 解析
   成功,占位/失效 ref 不计入),hero 汇总同步;「全部编辑验证」改不绝对化措辞
   (待重验路径同屏存在)。数据来自 _data.ts(MOCK,顶部 MockRibbon 诚实标记);
   板块开关未就绪时整页换「正在路上」(src/lib/upcoming.ts)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import { LEARN_PATHS, isPathStale, type LearnPath } from "./_data";
import { resolvePathRefs } from "./_resolve";
import MockRibbon from "../_components/MockRibbon";
import SoonPanel from "../_components/SoonPanel";

export const metadata: Metadata = { title: "知识库 — kimi.builders" };

/* 编选法(RFC §2 纪律的可视化) */
const METHOD = [
  { zh: "一手优先", en: "First-party first", note: { zh: "只收官方与原作者出处", en: "official & original sources only" } },
  { zh: "我们先学", en: "We walk it first", note: { zh: "编辑部先走一遍再排进来", en: "editors complete it first" } },
  { zh: "笔记署名", en: "Notes are signed", note: { zh: "署名到人,含返工", en: "names on notes, reworks included" } },
  { zh: "过期即标", en: "Stale is labeled", note: { zh: "地面一动就重验", en: "re-verified on ground shifts" } },
] as const;

/* 档位 → 色条/徽章色(stale 一律琥珀,优先级最高;stale 由 isPathStale 计算) */
function tierColor(p: LearnPath): string {
  if (isPathStale(p)) return "border-amber-500/50 text-amber-400";
  return p.tier === "starter"
    ? "border-blue/60 text-blue"
    : "border-emerald-400/50 text-emerald-400";
}
function tierBar(p: LearnPath): string {
  if (isPathStale(p)) return "bg-amber-400";
  return p.tier === "starter" ? "bg-blue" : "bg-emerald-400";
}

/* PATH STACK:hero 右侧的路径地图 */
function PathStack({ zh }: { zh: boolean }) {
  return (
    <nav
      aria-label={zh ? "路径目录" : "Path index"}
      className="overflow-hidden rounded-2xl border border-line bg-card xl:hidden"
    >
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-red-400/70" />
        <span aria-hidden="true" className="size-2 rounded-full bg-amber-400/70" />
        <span aria-hidden="true" className="size-2 rounded-full bg-emerald-400/70" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-grey">
          {zh ? "路径栈" : "PATH STACK"}
        </span>
      </div>
      <ol>
        {LEARN_PATHS.map((p, i) => (
          <li key={p.slug} className="relative border-b border-line last:border-b-0">
            <Link
              href={`/learn/${p.slug}`}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-moon/60"
            >
              <span className="font-mono text-[11px] text-grey/70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-paper transition-colors group-hover:text-blue">
                  {zh ? p.title.zh : p.title.en}
                </span>
                <span className="mt-0.5 block font-mono text-[10.5px] text-grey">
                  {p.tier === "starter" ? (zh ? "入门" : "STARTER") : zh ? "进阶" : "BUILDER"}
                  {" · "}
                  {p.levels.length} {zh ? "层" : "levels"} · {zh ? `约 ${p.hours} 小时` : `~${p.hours}h`}
                  {isPathStale(p) && (zh ? " · 待重验" : " · re-verify")}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`absolute inset-y-2 right-0 w-0.5 rounded-full ${tierBar(p)}`}
              />
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default async function LearnPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (UPCOMING.learn) {
    return <SoonPanel title={t(locale, "nav.learn")} locale={locale} expect={t(locale, "soon.learnExpect")} />;
  }
  const zh = locale === "zh";
  /* 可见资源计数(与详情页同口径):ref 解析不到(占位 id/已删/不可见)不计入 */
  const viewer = user ? { id: user.id, role: user.role } : null;
  const visibleCounts = new Map(
    await Promise.all(
      LEARN_PATHS.map(async (p) => {
        const refs = await resolvePathRefs(p, viewer);
        let n = 0;
        p.levels.forEach((l, i) =>
          l.resources.forEach((r, j) => {
            if (r.external || (refs.get(`${i}:${j}`) ?? null) !== null) n++;
          }),
        );
        return [p.slug, n] as const;
      }),
    ),
  );
  const totalResources = [...visibleCounts.values()].reduce((a, b) => a + b, 0);

  return (
    <div>
      <MockRibbon zh={zh} />

      {/* hero:eyebrow + 大标题 + 导语 + 汇总 meta + CTA;右侧 PATH STACK
          (仅 lg–xl 区间挂出:≥xl 右栏 LearnRail 已有路径栈,不重复;<lg 叠在下方) */}
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10 xl:block">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
            — {zh ? "知识库" : "LEARN"} · {zh ? "策划制学习路径" : "CURATED PATHS"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            {zh ? "少而重,走过的路" : "Few paths, walked first"}
            <span className="text-blue">.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-grey">
            {zh
              ? "这里不生产教程。每条路径是编辑定夺的一手资料编排——Kimi 官方、YouTube、bilibili、X 上的原始内容,加上社区同学先走一遍的学习笔记;验证戳担保它此刻仍然有效,终点收口在真实作品。"
              : "We don't produce tutorials. Each path is an editor's arrangement of first-party material — Kimi official docs, YouTube, bilibili, X — plus notes from members who walked it first; a verification stamp warrants it still works, and every path ends at a real build."}
          </p>
          <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
            <span>{LEARN_PATHS.length} {zh ? "条路径" : "paths"}</span>
            <span aria-hidden="true">·</span>
            <span>{totalResources} {zh ? "个一手资源" : "first-party resources"}</span>
            <span aria-hidden="true">·</span>
            <span>{zh ? "验证戳逐条可见" : "verify stamp on every path"}</span>
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#paths"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "浏览路径 ↓" : "Browse paths ↓"}
            </a>
            <a
              href="#method"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 font-mono text-xs text-grey transition-colors hover:border-blue hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "编选法" : "The method"}
            </a>
          </div>
        </div>
        <PathStack zh={zh} />
      </header>

      {/* 编选法:四条纪律 */}
      <section id="method" className="mt-10 scroll-mt-20 border-y border-line py-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-grey/70">
          {zh ? "编选法 · HOW PATHS ARE MADE" : "HOW PATHS ARE MADE"}
        </p>
        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {METHOD.map((m, i) => (
            <div key={m.zh} className="flex gap-3">
              <span className="font-mono text-[11px] text-blue">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="font-mono text-xs text-paper">{zh ? m.zh : m.en}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-grey">{zh ? m.note.zh : m.note.en}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 路径条目:整行式(编号徽章 + eyebrow + 大标题 + 摘要 + 验证戳);
          资源数只报可见(与详情页同口径) */}
      <div id="paths" className="scroll-mt-20">
        {LEARN_PATHS.map((p) => (
          <article key={p.slug} className="border-b border-line last:border-b-0">
            <Link href={`/learn/${p.slug}`} className="group flex gap-5 py-7">
              <span
                aria-hidden="true"
                className={`hidden size-11 shrink-0 place-items-center rounded-xl border font-mono text-xs font-semibold sm:grid ${tierColor(p)}`}
              >
                {p.code.replace("PATH-", "P")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
                  —{" "}
                  {p.tier === "starter" ? (zh ? "入门" : "STARTER") : zh ? "进阶" : "BUILDER"}
                  {" · "}
                  {p.levels.length} {zh ? "层" : "levels"}
                  {" · "}
                  {visibleCounts.get(p.slug) ?? 0} {zh ? "个资源" : "resources"}
                  {" · "}
                  {zh ? `约 ${p.hours} 小时` : `~${p.hours}h`}
                </p>
                <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-paper transition-colors group-hover:text-blue">
                  {zh ? p.title.zh : p.title.en}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
                  {zh ? p.summary.zh : p.summary.en}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] text-grey">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck
                      size={13}
                      className={isPathStale(p) ? "text-amber-400" : "text-emerald-400"}
                      aria-hidden="true"
                    />
                    @{p.editorHandle} {zh ? "验证" : "verified"} · {p.verifiedModel} · {p.verifiedAt}
                  </span>
                  {isPathStale(p) && (
                    <span className="whitespace-nowrap rounded-md border border-amber-500/40 px-1.5 py-px text-amber-400">
                      {zh ? "待重验" : "re-verify pending"}
                    </span>
                  )}
                </p>
              </div>
              <ArrowRight
                size={16}
                aria-hidden="true"
                className="mt-2 shrink-0 self-start text-grey/50 transition-colors group-hover:text-blue"
              />
            </Link>
          </article>
        ))}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-grey/80">
        {zh
          ? "学完一条路径?把作品发上作品墙即毕业;学习笔记发到社区,被编辑部收录就会排进路径,署名归你。"
          : "Finished a path? Post your build to graduate. Publish notes in the community — curated notes enter the path under your name."}
      </p>
    </div>
  );
}
