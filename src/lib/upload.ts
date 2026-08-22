/* Shared client upload helper: POST /api/upload (multipart: kind +
   file). Success returns the content-addressed key and the full CDN
   URL; failure throws an Error carrying the server's error code —
   callers map it to their own UI. Browser-only (relies on fetch
   FormData upload). */
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
