"use client";

/* Global keyboard shortcut layer: one keydown listener + a help panel.
   Keys — global: / · Cmd+K search (GlobalSearch's own listener) / ?
   help / Esc close (native dialog) / T theme / L language / V vibe /
   [ collapse left rail / ] hide right rail / F fullscreen / N post or
   recommend (per current section) / H focus mode (collapse + hide in
   one toggle); explore: <- -> chapter cycle / prev-next (ExploreKeys,
   mounted page-level). Guards: src/lib/shortcut-guards (modifiers /
   input state / dialog state / IME), pure and unit-tested; letter
   keys additionally ignore Shift combos. Actions go through
   src/lib/prefs-client — one code path with the buttons. Panel: the
   same native <dialog> as search (native Esc close, free top-layer
   focus management); top-bar/home buttons open it via the
   kb:shortcuts event (the kb:toast event-bus pattern). */
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

/* Key caps: mono technical font + hairline + moon fill; radii ride
   the --radius-* tokens, auto-zeroed under the poster vibe (the same
   vibe-following as site-wide controls). */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-moon px-1.5 font-mono text-[11px] leading-none text-paper">
      {children}
    </kbd>
  );
}

function Row({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    /* Row geometry matches the search result rows; the key column is a
       fixed 5.5rem, descriptions truncate to one line, and both
       columns' row heights agree everywhere. */
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex w-[5.5rem] shrink-0 items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-grey">{desc}</span>
    </div>
  );
}

/* Section labels match the search list's "quick nav"; no underline,
   separation by whitespace. Margins come from the caller (stacked vs.
   side-by-side trade-offs differ). */
function Section({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <p className="px-3 pb-1 pt-2 font-mono text-xs uppercase tracking-[0.08em] text-grey">
        {label}
      </p>
      <div>{children}</div>
    </section>
  );
}

/* The top-bar/home trigger button: opens the panel through the event
   bus (KeyboardShortcuts mounts in the root layout). */
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
      /* ? toggles the panel: exempt in input state; yields while other
         dialogs are open (Esc closes them) — but with the help panel
         itself open, ? must close it. Both event shapes of ? are
         accepted: key="?" on US layouts, key="/" + shiftKey on most
         composed events and some layouts. */
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
          /* The same section awareness as the left rail's post button:
             works/Awesome goes to /works/new, everything else posts. */
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
  /* Chords render inside one cap (Cmd+K); side-by-side caps mean
     alternate keys (no more "+" joining). */
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

  /* The shell matches GlobalSearch's dialog in width, chrome, and
     header/footer grammar (36rem / px-4 / icon row + X close /
     right-aligned footnote). */
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="kbd-help-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="fixed left-1/2 top-[12vh] m-0 w-[min(92vw,50rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper shadow-2xl backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
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
      {/* 双栏(20260822):14 行收进 ~8 行高,900px 视口免内滚。全局区
          列主序填充(左栏满 6 再进右栏),左右恰好按语义分组:左 = 搜索/
          帮助/界面偏好,右 = 栏位/全屏/发帖/专注 */}
      <div className="max-h-[min(62vh,32rem)] overflow-y-auto p-2">
        <Section label={t(l, "kbd.sectionGlobal")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-flow-col sm:grid-rows-6">
            {globalRows.map(({ keys, key }) => (
              <Row key={key} keys={keys} desc={t(l, key)} />
            ))}
          </div>
        </Section>
        {/* 底部两小区不对称配比(20260822 修复):搜索区文案极短(选择结果/
            打开所选),探索区描述最长——2:3 分配让长描述在窄窗口也有余量,
            不再靠截断兜底 */}
        <div className="mt-2 grid grid-cols-1 gap-x-7 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
      </div>
      <p className="border-t border-line px-4 py-2 text-right font-mono text-xs text-grey/70">
        {t(l, "kbd.hint")}
      </p>
    </dialog>
  );
}
