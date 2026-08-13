"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { Download, LoaderCircle, Share2, ShieldCheck, X } from "lucide-react";
import { trackBeacon } from "@/app/(app)/_components/track";
import {
  USAGE_SHARE_RANGES,
  type UsageShareRange,
} from "@/src/lib/usage/share-contract";

const labels: Record<UsageShareRange, { zh: string; en: string }> = {
  today: { zh: "今天", en: "Today" },
  "24h": { zh: "24H", en: "24H" },
  "7d": { zh: "7D", en: "7D" },
  "30d": { zh: "30D", en: "30D" },
  "90d": { zh: "90D", en: "90D" },
  all: { zh: "ALL", en: "All" },
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function UsageShareDialog({
  zh,
  tzOffsetMinutes,
}: {
  zh: boolean;
  tzOffsetMinutes: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [range, setRange] = useState<UsageShareRange>("30d");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const imageHref = useMemo(
    () => `/api/usage/share?range=${range}&tz=${tzOffsetMinutes}`,
    [range, tzOffsetMinutes],
  );
  const filename = `kimi-builders-usage-${range}.png`;

  async function fetchPoster(): Promise<Blob> {
    const response = await fetch(imageHref, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Poster request failed: ${response.status}`);
    return response.blob();
  }

  async function downloadPoster() {
    trackBeacon({
      event: "poster_download",
      target_kind: "surface",
      target_id: "usage",
      meta: { surface: "usage" },
    });
    setSharing(true);
    setError(false);
    try {
      saveBlob(await fetchPoster(), filename);
    } catch {
      setError(true);
    } finally {
      setSharing(false);
    }
  }

  async function sharePoster() {
    setSharing(true);
    setError(false);
    try {
      const blob = await fetchPoster();
      const file = new File([blob], filename, { type: "image/png" });
      const payload: ShareData = {
        title: zh ? "我的 AI 编程用量" : "My AI coding usage",
        text: zh ? "来自 kimi.builders 的私人用量统计" : "Private usage stats from kimi.builders",
        files: [file],
      };
      if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
        await navigator.share(payload);
      } else {
        saveBlob(blob, filename);
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(true);
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto"
      >
        <Share2 size={13} aria-hidden="true" /> {zh ? "分享战绩" : "Share stats"}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="usage-share-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[92vh] w-[min(95vw,68rem)] overflow-hidden rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/80"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-moon px-4 py-4 sm:px-5">
          <div>
            <h3 id="usage-share-title" className="font-mono text-sm font-semibold">
              {zh ? "生成用量战绩海报" : "Create a usage share card"}
            </h3>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-grey">
              {zh
                ? "范围独立于当前看板筛选。头尾保持统一，中段会按小时、天或周自动选择最有表现力的视图。"
                : "The range is independent of dashboard filters. The middle adapts to hourly, daily, or weekly activity."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={zh ? "关闭" : "Close"}
            className="flex size-11 shrink-0 items-center justify-center text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-76px)] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="flex min-h-[28rem] items-center justify-center bg-black p-4 sm:p-6">
            <div className="relative aspect-[3/4] max-h-[68vh] w-full max-w-[32rem] overflow-hidden border border-white/15 bg-black shadow-2xl">
              {!loaded && !error && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black text-xs text-grey">
                  <LoaderCircle size={18} className="mr-2 animate-spin" aria-hidden="true" />
                  {zh ? "正在生成真实数据海报…" : "Generating your poster…"}
                </div>
              )}
              {error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-xs leading-relaxed text-grey">
                  <span>{zh ? "海报生成失败，请稍后重试。" : "Could not generate the poster. Please try again."}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(false);
                      setLoaded(false);
                    }}
                    className="mt-4 min-h-11 rounded-lg border border-line px-4 text-paper hover:border-blue"
                  >
                    {zh ? "重试" : "Retry"}
                  </button>
                </div>
              ) : (
                <Image
                  key={imageHref}
                  unoptimized
                  src={imageHref}
                  alt={zh ? `${labels[range].zh}用量战绩海报预览` : `${labels[range].en} usage share card preview`}
                  width={1080}
                  height={1440}
                  className="h-full w-full object-contain"
                  onLoad={() => setLoaded(true)}
                  onError={() => setError(true)}
                  loading="lazy"
                />
              )}
            </div>
          </div>

          <aside className="flex flex-col border-t border-line bg-bg p-4 lg:border-l lg:border-t-0 lg:p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-grey">
              {zh ? "分享范围" : "Share range"}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={zh ? "分享范围" : "Share range"}>
              {USAGE_SHARE_RANGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={range === value}
                  onClick={() => {
                    setRange(value);
                    setLoaded(false);
                    setError(false);
                  }}
                  className={`min-h-11 border px-2 font-mono text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                    range === value
                      ? "border-blue bg-blue text-white"
                      : "border-line text-grey hover:border-blue hover:text-paper"
                  }`}
                >
                  {zh ? labels[value].zh : labels[value].en}
                </button>
              ))}
            </div>

            <div className="mt-5 border border-line bg-card p-4 text-[11px] leading-relaxed text-grey">
              <p className="flex items-start gap-2">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>
                  {zh
                    ? "海报只包含聚合后的 Token、费用估算、活跃节奏和公开账号名；不包含项目名、设备、路径或对话内容。"
                    : "The card only includes aggregate usage and your public handle—never projects, devices, paths, or conversations."}
                </span>
              </p>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-xs leading-relaxed text-red-400">
                {zh ? "操作失败，请检查网络后重试。" : "That did not work. Check your connection and try again."}
              </p>
            )}

            <div className="mt-5 grid gap-2 lg:mt-auto">
              <button
                type="button"
                onClick={sharePoster}
                disabled={sharing || error}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-blue px-4 font-mono text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sharing ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />}
                {zh ? "系统分享" : "Share"}
              </button>
              <button
                type="button"
                onClick={downloadPoster}
                disabled={sharing || error}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-line px-4 font-mono text-xs text-paper hover:border-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={15} aria-hidden="true" /> {zh ? "下载 PNG" : "Download PNG"}
              </button>
            </div>
          </aside>
        </div>
      </dialog>
    </>
  );
}
