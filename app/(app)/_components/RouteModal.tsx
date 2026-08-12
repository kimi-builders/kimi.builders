"use client";

/* 路由弹窗壳(拦截路由用):挂载即 showModal;关闭(X / 背板点击 / ESC)
   统一 router.back() 回到来源页。外壳用 overflow-clip 明确禁止焦点滚动,
   只有正文容器负责滚动,避免长表单的隐藏控件把整个 dialog 推出视口。 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function RouteModal({
  title,
  closeLabel,
  children,
}: {
  title: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={() => router.back()}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="fixed inset-0 m-auto max-h-[86vh] w-[min(94vw,46rem)] overflow-clip rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex items-center justify-between border-b border-line bg-card px-5 py-4">
        <h2 className="font-mono text-sm font-semibold tracking-[0.06em]">{title}</h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={closeLabel}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <X size={17} />
        </button>
      </div>
      <div className="max-h-[calc(86vh-64px)] overscroll-contain overflow-y-auto px-5 py-5 [scrollbar-gutter:stable]">
        {children}
      </div>
    </dialog>
  );
}
