"use client";

/* 详情页大截图:无图或加载失败(onerror)时回落到 Rocket 占位(与 WorkCard 一致)。
   onerror 需要客户端态(P2-6 顺手修一半,仅详情页;列表卡片仍未带兜底)。 */
import { useState } from "react";
import { Rocket } from "lucide-react";

export default function WorkScreenshot({
  url,
  name,
}: {
  url: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex aspect-video w-full items-center justify-center border border-line text-grey/40">
        <Rocket size={40} />
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={name}
      onError={() => setFailed(true)}
      className="aspect-video w-full border border-line object-cover"
    />
  );
}
