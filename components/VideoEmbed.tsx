/* Tutorial video embed: platforms first — a Bilibili player / YouTube
   nocookie iframe, 16:9, lazy; no self-hosting, no uploads. The
   external fallback ("watch on the platform ->") is the caller's. */
export default function VideoEmbed({
  provider,
  id,
  title,
}: {
  provider: "bilibili" | "youtube";
  id: string;
  title: string;
}) {
  const src =
    provider === "bilibili"
      ? `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}&autoplay=0`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-moon">
      <div className="relative aspect-video">
        <iframe
          src={src}
          title={title}
          loading="lazy"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
