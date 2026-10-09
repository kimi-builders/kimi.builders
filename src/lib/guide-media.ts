/* Only /decks/ denotes static public assets. Other local routes and
   external providers are not assumed to map to filesystem paths. */
import { stat } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import type { GuidePayload } from "./tutorials";

export function localDeckPath(url: string, publicRoot: string): string | null {
  if (!url.startsWith("/decks/")) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  } catch {
    return "";
  }
  if (pathname.includes("\\") || pathname.includes("\0")) return "";
  const root = path.resolve(publicRoot, "decks");
  const file = path.resolve(publicRoot, `.${pathname}`);
  return file.startsWith(`${root}${path.sep}`) ? file : "";
}

export function guideMediaState(hasBody: boolean, payload: GuidePayload, deckAvailable: boolean) {
  const missingDeck = !!payload.deck && !deckAvailable;
  const resolved = { ...payload };
  if (missingDeck) delete resolved.deck;
  return {
    payload: resolved,
    unavailable: missingDeck && !hasBody && !payload.video,
  };
}

const deckExists = cache(async (url: string): Promise<boolean> => {
  const file = localDeckPath(url, path.join(process.cwd(), "public"));
  if (file === null) return true;
  if (!file) return false;
  const relative = path.relative(path.join(process.cwd(), "public", "decks"), file);
  try {
    // Keep build-time tracing scoped to the validated static-media directory.
    return (await stat(path.join(process.cwd(), "public", "decks", relative))).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
});

export async function resolveGuideMedia(hasBody: boolean, payload: GuidePayload) {
  return guideMediaState(hasBody, payload, payload.deck ? await deckExists(payload.deck) : true);
}
