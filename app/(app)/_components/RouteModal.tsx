"use client";

/* 路由弹窗壳(拦截路由用):挂载即 showModal;关闭(X / 背板点击 / ESC)
   统一 router.back() 回到来源页。外壳用 overflow-clip 明确禁止焦点滚动,
   只有正文容器负责滚动,避免长表单的隐藏控件把整个 dialog 推出视口。
   dirtyGuard(2026-08-14):传入即启用「已填写内容」守卫——表单有过输入后,
   X / 背板 / ESC 不再直接关,先出底部确认条(继续填写 / 放弃并关闭);
   提交进行时(onSubmit)不再拦截,正常跳转。 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function RouteModal({
  title,
  closeLabel,
  dirtyGuard,
  children,
}: {
  title: string;
  closeLabel: string;
  dirtyGuard?: { title: string; keep: string; discard: string };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

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
      onClose={() => router.back()}
      onCancel={(event) => {
        if (dirtyGuard && dirty) {
          event.preventDefault();
          setConfirming(!confirming);
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className="fixed inset-0 m-auto max-h-[86vh] w-[min(94vw,46rem)] overflow-clip rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75"
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
          <span className="text-[12.5px] text-paper">{dirtyGuard.title}</span>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {dirtyGuard.keep}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex min-h-9 items-center rounded-lg border border-red-400/50 px-3 font-mono text-[11px] text-red-400 transition-colors hover:bg-red-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
            >
              {dirtyGuard.discard}
            </button>
          </span>
        </div>
      )}
    </dialog>
  );
}
