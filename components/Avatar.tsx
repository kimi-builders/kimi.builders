/* 头像兜底:无 avatarUrl 时渲染首字母色块,避免空 src 破图。
   纯展示,RSC/客户端通用。 */
export default function Avatar({
  url,
  handle,
  size = 36,
  square = false,
  className = "",
}: {
  url: string | null | undefined;
  handle: string;
  size?: number;
  /* 方形变体:bot/系统头像(Kimi 小筑等)用,人物头像保持圆形 */
  square?: boolean;
  className?: string;
}) {
  const shape = square ? "rounded" : "rounded-full";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`@${handle}`}
        className={`${shape} object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = handle.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-label={`@${handle}`}
      className={`inline-flex shrink-0 select-none items-center justify-center ${shape} bg-moon font-mono text-paper ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </span>
  );
}
