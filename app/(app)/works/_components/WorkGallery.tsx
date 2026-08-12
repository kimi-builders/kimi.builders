/* 详情页配图图集(20260826_work_media):封面(第一张)大图 + 其余缩略图,
   点击新标签页开原图(从轻,不造 lightbox)。key → 公开 URL 由 mediaUrl 拼接
   (DB 只存 key,见 20260826_work_media 迁移)。 */
import { mediaUrl } from "@/src/lib/storage";

export default function WorkGallery({
  keys,
  name,
}: {
  keys: string[];
  name: string;
}) {
  if (keys.length === 0) return null;
  const [cover, ...rest] = keys;
  return (
    <div>
      <a
        href={mediaUrl(cover)}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(cover)}
          alt={name}
          className="aspect-video w-full rounded-2xl border border-line object-cover"
        />
      </a>
      {rest.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {rest.map((k, i) => (
            <a
              key={k}
              href={mediaUrl(k)}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-line transition-colors hover:border-blue"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(k)}
                alt={`${name} ${i + 2}`}
                loading="lazy"
                className="h-16 w-28 object-cover"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
