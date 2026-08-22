/* Avatar fallback: without an avatarUrl render an initial-letter tile
   — an empty src must not break the image. Pure display, usable from
   RSC and client alike. */
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
  /* Square variant: bot/system avatars (the bot and friends); human
     avatars stay circular. */
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
