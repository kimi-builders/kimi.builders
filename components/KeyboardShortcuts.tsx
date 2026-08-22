"use client";

/* 全局键盘快捷键层(20260822 方案定稿):单一 keydown 监听 + 帮助面板。
   键位:
   全局 — / ·⌘K 搜索(归 GlobalSearch 自己的监听)/ ? 帮助 / Esc 关闭(原生
   dialog)/ T 主题 / L 语言 / V 气质 / [ 收左栏 / ] 藏右栏 / F 全屏 /
   N 发帖或推荐(按当前分区)/ H 专注模式(收左栏 + 藏右栏一键切换);
   探索 — ←→ 章切换/上下篇(ExploreKeys,页面级挂载)。
   守卫:src/lib/shortcut-guards(修饰键/输入态/弹窗态/IME),纯函数有单测;
   字母键额外不吃 Shift 组合。动作走 src/lib/prefs-client,与按钮同一代码路径。
   面板:与搜索同款原生 <dialog>(Esc 原生关闭、top-layer 焦点管理免费);
   顶栏/首页按钮经 kb:shortcuts 事件呼出(kb:toast 同款事件总线模式)。 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";
import {
  applyLocale,
  flipNav,
  flipSidebar,
  flipTheme,
  flipVibe,
  setNavCollapsed,
  setSidebarHidden,
} from "@/src/lib/prefs-client";
import { isEditableTarget, isPlainShortcutContext } from "@/src/lib/shortcut-guards";
import { saveLocaleAction } from "@/app/(app)/community/actions";

/* 键帽:mono 技术字体 + 细线 + moon 底;圆角走 --radius-* 令牌,
   poster 气质自动归零成硬边(与全站控件同一气质跟随) */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-moon px-1.5 font-mono text-[11px] leading-none text-paper">
      {children}
    </kbd>
  );
}

function Row({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    /* 与搜索结果行同一几何(px-3 py-2.5):键列定宽对齐,描述单行截断,
       行高处处一致(20260822 排版收紧:去掉行内换行与「+」连接符) */
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex w-[6.5rem] shrink-0 items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-grey">{desc}</span>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    /* 分区标 = 搜索列表「快速前往」同款;无下划线——分隔靠留白,
       全面板只有 header/footer 两条线(与搜索弹窗同一节奏) */
    <section className="mt-2 first:mt-0">
      <p className="px-3 pb-1 pt-2 font-mono text-xs uppercase tracking-[0.08em] text-grey">
        {label}
      </p>
      <div>{children}</div>
    </section>
  );
}

/* 顶栏/首页的呼出按钮:经事件总线开面板(KeyboardShortcuts 挂根布局) */
export function ShortcutsButton({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("kb:shortcuts"))}
      data-tip={t(locale, "topbar.shortcuts")}
      data-tip-side="bottom"
      data-tip-align="right"
      aria-label={t(locale, "topbar.shortcuts")}
      className={className}
    >
      <Keyboard size={15} aria-hidden="true" />
    </button>
  );
}

export default function KeyboardShortcuts({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      const help = dialogRef.current;
      /* ? 呼出/收起:输入态豁免;其他弹窗开着时让位(Esc 负责关它们),
         但帮助面板自身开着时 ? 要能收起。
         ? 的两种事件形态都认:美式键盘 key="?",多数合成事件/部分布局
         是 key="/" + shiftKey */
      const isHelpKey =
        event.key === "?" || (event.key === "/" && event.shiftKey);
      if (isHelpKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing) {
        if (isEditableTarget(target)) return;
        const openDialogs = document.querySelectorAll("dialog[open]");
        const onlyHelp =
          openDialogs.length === 0 || (openDialogs.length === 1 && openDialogs[0] === help);
        if (!onlyHelp) return;
        event.preventDefault();
        if (help?.open) help.close();
        else help?.showModal();
        return;
      }
      if (event.shiftKey) return;
      if (
        !isPlainShortcutContext(
          event,
          target,
          document.querySelector("dialog[open]") !== null,
        )
      ) {
        return;
      }
      switch (event.key.toLowerCase()) {
        case "t":
          event.preventDefault();
          flipTheme();
          return;
        case "l": {
          event.preventDefault();
          const next = document.documentElement.lang === "zh-CN" ? "en" : "zh";
          applyLocale(next);
          void saveLocaleAction(next);
          router.refresh();
          return;
        }
        case "v":
          event.preventDefault();
          flipVibe(locale);
          return;
        case "[":
          event.preventDefault();
          flipNav();
          return;
        case "]":
          event.preventDefault();
          flipSidebar();
          return;
        case "f":
          event.preventDefault();
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else {
            void document.documentElement.requestFullscreen().catch(() => {});
          }
          return;
        case "n": {
          event.preventDefault();
          /* 与左栏发帖按钮同一分区感知:作品/Awesome 去 /works/new,其余发帖 */
          const compose =
            pathname.startsWith("/works") || pathname.startsWith("/awesome")
              ? "/works/new"
              : "/community/new";
          router.push(compose);
          return;
        }
        case "h": {
          event.preventDefault();
          const el = document.documentElement;
          const focused = el.dataset.nav === "1" && el.dataset.sidebar === "0";
          setNavCollapsed(!focused);
          setSidebarHidden(!focused);
          return;
        }
      }
    };
    const onOpen = () => dialogRef.current?.showModal();
    window.addEventListener("keydown", onKey);
    window.addEventListener("kb:shortcuts", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kb:shortcuts", onOpen);
    };
  }, [router, pathname, locale]);

  const l = locale;
  /* 和弦写进单枚键帽(⌘K),并列键帽 = 备选键位(不再用「+」连接) */
  const globalRows: Array<{ keys: string[]; key: I18nKey }> = [
    { keys: ["/", "⌘K"], key: "kbd.search" },
    { keys: ["?"], key: "kbd.help" },
    { keys: ["Esc"], key: "kbd.esc" },
    { keys: ["T"], key: "kbd.theme" },
    { keys: ["L"], key: "kbd.lang" },
    { keys: ["V"], key: "kbd.vibe" },
    { keys: ["["], key: "kbd.navCollapse" },
    { keys: ["]"], key: "kbd.sidebar" },
    { keys: ["F"], key: "kbd.fullscreen" },
    { keys: ["N"], key: "kbd.newPost" },
    { keys: ["H"], key: "kbd.focus" },
  ];
  const searchRows: Array<{ keys: string[]; key: I18nKey }> = [
    { keys: ["↑", "↓"], key: "kbd.pick" },
    { keys: ["↵"], key: "kbd.open" },
  ];
  const exploreRows: Array<{ keys: string[]; key: I18nKey }> = [
    { keys: ["←", "→"], key: "kbd.arrows" },
  ];

  /* 外壳与 GlobalSearch 的弹窗同宽同壳同 header/footer 语法
     (20260822 排版一致性:36rem / px-4 / 图标行 + X 关闭 / 右对齐脚注) */
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="kbd-help-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="fixed left-1/2 top-[12vh] m-0 w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper shadow-2xl backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Keyboard size={18} className="shrink-0 text-ui-blue" aria-hidden="true" />
        <h2 id="kbd-help-title" className="min-w-0 flex-1 font-mono text-sm font-semibold text-paper">
          {t(l, "kbd.title")}
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t(l, "modal.close")}
          className="flex size-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[min(62vh,32rem)] overflow-y-auto p-2">
        <Section label={t(l, "kbd.sectionGlobal")}>
          {globalRows.map(({ keys, key }) => (
            <Row key={key} keys={keys} desc={t(l, key)} />
          ))}
        </Section>
        <Section label={t(l, "kbd.sectionSearch")}>
          {searchRows.map(({ keys, key }) => (
            <Row key={key} keys={keys} desc={t(l, key)} />
          ))}
        </Section>
        <Section label={t(l, "kbd.sectionExplore")}>
          {exploreRows.map(({ keys, key }) => (
            <Row key={key} keys={keys} desc={t(l, key)} />
          ))}
        </Section>
      </div>
      <p className="border-t border-line px-4 py-2 text-right font-mono text-xs text-grey/70">
        {t(l, "kbd.hint")}
      </p>
    </dialog>
  );
}
