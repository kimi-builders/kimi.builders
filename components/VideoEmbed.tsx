/* 教程视频嵌入(20260820 教程频道):平台优先——B 站 player / YouTube nocookie
   iframe,16:9,懒加载;不自托管、不上传。外链兜底(「在平台观看 →」)由调用方给。 */
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
