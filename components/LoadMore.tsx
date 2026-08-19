"use client";

/* 通用「加载更多」(feed / 作品墙 / Awesome 共用):server action 返回服务端
   渲染好的一页(ReactNode 随 RSC 序列化),客户端直接追加;游标为 null 即到底。
   模式同 CommentSection:调用方按首屏内容给 key,首屏换新(刷新/删改)时
   remount,已追加的页作废,回到首屏第一页。
   追加的卡片直接落在父容器里(无包装节点):space-y / grid 布局都照常生效,
   按钮用 col-span-full 在网格里独占一行(块布局下该属性无副作用)。 */
import { useState, type ReactNode } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";

export interface LoadMorePage<T extends string | number = string | number> {
  nodes: ReactNode[];
  nextCursor: T | null;
}

export type LoadMoreResult<T extends string | number = string | number> =
  | ({ ok: true } & LoadMorePage<T>)
  | { ok: false };

export default function LoadMore<T extends string | number>({
  initialCursor,
  load,
  locale,
}: {
  /* 游标类型由调用方定:feed 是字符串(热门为复合游标),作品墙是数字 id */
  initialCursor: T | null;
  load: (cursor: T) => Promise<LoadMoreResult<T>>;
  locale: Locale;
}) {
  const [extra, setExtra] = useState<ReactNode[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [busy, setBusy] = useState(false);

  const more = async () => {
    if (busy || cursor === null) return;
    setBusy(true);
    try {
      const res = await load(cursor);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      setExtra((prev) => [...prev, ...res.nodes]);
      setCursor(res.nextCursor);
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {extra}
      {cursor !== null && (
        <button
          type="button"
          onClick={more}
          disabled={busy}
          className="col-span-full rounded-lg border border-line px-5 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue disabled:opacity-40"
        >
          {busy ? t(locale, "pager.loading") : t(locale, "pager.loadMore")}
        </button>
      )}
    </>
  );
}
