"use client";

/* 文章封面(20260822):列表行卡/封面墙共用。payload.cover(站内路径或
   https 图片,加载失败回落自动砖);缺省 = 自动章字砖(work-cover-tile
   名称砖语汇:类型 eyebrow + serif 章字大字,letter 用「刊」)。 */
import { useState } from "react";
import type { ExploreItem } from "@/src/lib/explore";
import { findKbChapter } from "@/src/lib/kb-chapters";

export default function ArticleCover({
  item,
  zh,
}: {
  item: ExploreItem;
  zh: boolean;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const chapter = item.chapter ? findKbChapter(item.chapter) : undefined;
  const kindText =
    item.kind === "letter" ? (zh ? "月刊评鉴" : "MONTHLY") : zh ? "文章" : "ARTICLE";
  if (item.cover && !coverFailed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={item.cover}
        alt=""
        onError={() => setCoverFailed(true)}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="work-cover-tile flex h-full w-full flex-col items-center justify-center gap-1.5">
      <span className="work-cover-tile__eyebrow font-mono text-[10px] uppercase tracking-[0.14em]">
        {kindText}
      </span>
      <span className="font-human text-4xl leading-none">
        {chapter ? (zh ? chapter.zh : chapter.en[0]) : zh ? "刊" : "M"}
      </span>
    </div>
  );
}
