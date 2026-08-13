export const MAX_ANALYTICS_BODY_BYTES = 2 * 1024;

/* Beacon payloads are tiny (< 256 B). Read the stream with a hard cap so a
   chunked request cannot make the default JSON parser buffer an arbitrary body first. */
export async function readAnalyticsJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ANALYTICS_BODY_BYTES) {
    throw new Error("analytics body too large");
  }
  if (!request.body) throw new Error("analytics body missing");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ANALYTICS_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("analytics body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const encoded = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    encoded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(encoded));
}
