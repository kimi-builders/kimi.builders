/* 客户端上传共用 helper:POST /api/upload(multipart:kind + file)。
   成功返回内容寻址 key 与完整 CDN URL;失败抛出带服务端 error code 的 Error,
   调用方按自身 UI 落错误态。仅浏览器端使用(依赖 fetch FormData 上传)。 */
export interface UploadedMedia {
  key: string;
  url: string;
}

export async function uploadMedia(
  file: File | Blob,
  kind: "logo" | "image" | "avatar",
): Promise<UploadedMedia> {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    data?: { key: string; url: string };
  } | null;
  if (!res.ok || !data?.ok || !data.data) throw new Error(data?.error || "upload_failed");
  return { key: data.data.key, url: data.data.url };
}
