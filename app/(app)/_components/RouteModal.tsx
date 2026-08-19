"use client";

/* 路由弹窗壳(拦截路由用):挂载即 showModal;关闭(X / 背板点击 / ESC)
   统一 router.back() 回到来源页;若背景页已被 action 的 redirect 转走
   (URL 偏离挂载点),则静默关窗不回退。外壳用 overflow-clip 明确禁止焦点滚动,
   只有正文容器负责滚动,避免长表单的隐藏控件把整个 dialog 推出视口。
   dirtyGuard(2026-08-14):传入即启用「已填写内容」守卫——表单有过输入后,
   X / 背板 / ESC 不再直接关,先出底部确认条(继续填写 / 放弃并关闭);
   提交进行时(onSubmit)不再拦截,正常跳转。 */
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function RouteModal({
  title,
  closeLabel,
  dirtyGuard,
  widthCls = "w-[min(94vw,46rem)]",
  children,
}: {
  title: string;
  closeLabel: string;
  dirtyGuard?: { title: string; keep: string; discard: string };
  /* 弹窗宽度(20260919):默认 46rem;宽表单(作品发布/编辑)传 56rem */
  widthCls?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /* 挂载时的 URL(弹窗开着 = URL 停在拦截路由上);silent 标记「程序化关闭,
     不要再 router.back()——背景已经跳过转了」 */
  const openedAt = useRef(pathname);
  const silent = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  /* 兜底关窗(2026-08-14):server action 里的 redirect() 只转背景页,拦截路由的
     @modal 插槽不会随之卸载(表单弹窗保存后仍盖在详情页上)。URL 偏离挂载点
     即说明背景已导航,此时静默关窗——不回退,URL 已经是对的地方。 */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (pathname !== openedAt.current && dialog?.open) {
      silent.current = true;
      dialog.close();
    }
  }, [pathname]);

  /* 守卫开启且表单已填写:关闭动作改道确认条;确认条出现时 ESC = 继续填写 */
  const requestClose = () => {
    if (dirtyGuard && dirty && !confirming) {
      setConfirming(true);
      return;
    }
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={() => {
        /* 程序化静默关闭(背景已导航)不回退;其余(X/背板/ESC)统一回来源页 */
        if (silent.current) {
          silent.current = false;
          return;
        }
        router.back();
      }}
      onCancel={(event) => {
        if (dirtyGuard && dirty) {
          event.preventDefault();
          setConfirming(!confirming);
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className={`fixed inset-0 m-auto max-h-[86vh] ${widthCls} overflow-clip rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75`}
    >
      <div className="flex items-center justify-between border-b border-line bg-card px-5 py-4">
        <h2 className="font-mono text-sm font-semibold tracking-[0.06em]">{title}</h2>
        <button
          type="button"
          onClick={requestClose}
          aria-label={closeLabel}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <X size={17} />
        </button>
      </div>
      <div
        className="max-h-[calc(86vh-64px)] overscroll-contain overflow-y-auto px-5 py-5 [scrollbar-gutter:stable]"
        onInput={() => {
          if (dirtyGuard && !dirty) setDirty(true);
        }}
        onChange={() => {
          if (dirtyGuard && !dirty) setDirty(true);
        }}
        onSubmit={() => {
          if (dirtyGuard) setDirty(false);
        }}
      >
        {children}
      </div>
      {confirming && dirtyGuard && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-card px-5 py-3">
          <span className="text-xs text-paper">{dirtyGuard.title}</span>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {dirtyGuard.keep}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex min-h-9 items-center rounded-lg border border-status-danger/50 px-3 font-mono text-xs text-status-danger-fg transition-colors hover:bg-status-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-danger"
            >
              {dirtyGuard.discard}
            </button>
          </span>
        </div>
      )}
    </dialog>
  );
}
