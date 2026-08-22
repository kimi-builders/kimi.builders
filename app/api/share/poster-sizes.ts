/* Poster height tiers (width fixed at 1080, height content-driven):
   each poster estimates its total height from content blocks and snaps
   up to the nearest tier (up = never cropped, at most a little air).
   The usage poster always fills 1440 and skips this. A pure TS module
   (no JSX) so routes and tests import it directly; components render a
   100% canvas. */
import type {
  PostShareSnapshot,
  ProfileShareSnapshot,
  WorkShareSnapshot,
} from "@/src/lib/share-posters";

export const POSTER_WIDTH = 1080;
const POSTER_HEIGHT_STEPS = [960, 1080, 1200, 1320, 1440] as const;

/* Monthly section posters: content is capped at assembly (<=3 decisions,
   <=5 topics, 7 facts) and always fills 1440, like the usage poster. */
export const LETTER_POSTER_SIZE = { width: POSTER_WIDTH, height: 1440 } as const;

export function snapPosterHeight(estimated: number): number {
  for (const step of POSTER_HEIGHT_STEPS) {
    if (estimated <= step) return step;
  }
  return 1440;
}

/* CJK-aware line estimation: CJK/fullwidth at 1.0em, everything else at
   0.6em (JB Mono's advance width). */
export function estimatePosterLines(text: string, fontSize: number, width: number): number {
  let units = 0;
  for (const ch of text) {
    units += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.6;
  }
  return Math.max(1, Math.ceil((units * fontSize) / width));
}

/* Fixed skeleton parts (shared by all four): margins 80 + identity band
   133 + main pads 58 + footer 140. */
const FRAME = 80 + 133 + 58 + 140;
/* Metric band: padding 18x2 + label 20 + gap 12 + value 30 = 98, plus
   each part's marginTop. */
const BAND = 98;
const CONTENT_WIDTH = POSTER_WIDTH - 108; // 54x2 side gutters

export function postPosterSize(s: PostShareSnapshot): { width: number; height: number } {
  const sparse = !s.excerpt && !s.poll && !s.linkDomain;
  const titleSize = !sparse ? 56 : s.title.length <= 20 ? 84 : s.title.length <= 40 ? 72 : 60;
  let middle = 0;
  if (sparse) middle += 113 + 16; // quote ornament + title gap
  middle += estimatePosterLines(s.title, titleSize, CONTENT_WIDTH) * titleSize * 1.3;
  if (sparse) middle += 44; // blue-square thin-line ornament
  if (s.excerpt) middle += 24 + estimatePosterLines(s.excerpt, 28, CONTENT_WIDTH) * 28 * 1.7;
  if (s.linkDomain) middle += 26 + 40;
  if (s.poll) middle += 30 + 44 + s.poll.options.length * 59 + 30;
  return { width: POSTER_WIDTH, height: snapPosterHeight(Math.round(FRAME + 40 + BAND + middle)) };
}

export function workPosterSize(s: WorkShareSnapshot): { width: number; height: number } {
  const nameSize = s.name.length <= 12 ? 88 : s.name.length <= 24 ? 72 : 58;
  let middle = estimatePosterLines(s.name, nameSize, CONTENT_WIDTH) * nameSize * 1.2;
  if (s.tagline) middle += 26 + estimatePosterLines(s.tagline, 30, CONTENT_WIDTH) * 30 * 1.7;
  if (s.agents.length > 0) {
    /* Chip wrap estimate: name width (21px mono) + padding 32 + gap 12. */
    const chipsWidth =
      s.agents.reduce((sum, name) => sum + name.length * 13 + 44, 0) + (s.agentsMore > 0 ? 90 : 0);
    middle += 30 + Math.ceil(chipsWidth / CONTENT_WIDTH) * 49;
  }
  if (s.claimedTokens !== null) middle += 36 + 86 + 16 + 30; // hero digits
                                                              // + method row
  return { width: POSTER_WIDTH, height: snapPosterHeight(Math.round(FRAME + 40 + BAND + middle)) };
}

export function profilePosterSize(s: ProfileShareSnapshot): { width: number; height: number } {
  let middle = 0;
  if (s.usage) middle += 124; // TOKENS hero (96 digits + label)
  if (s.bio) middle += 32 + estimatePosterLines(s.bio, 28, CONTENT_WIDTH) * 28 * 1.7;
  /* Contribution graph: eyebrow 18 + 12 + month labels 11 + 6 + 7x21
     cells + 12 + legend 18 ~= 224. */
  if (s.usage) middle += 36 + 224;
  return { width: POSTER_WIDTH, height: snapPosterHeight(Math.round(FRAME + 36 + BAND + middle)) };
}
