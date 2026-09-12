/* Explore lens availability — the single judgment for /explore
   filtering. A lens may show a toolbar dropdown, issue rail links, and
   take effect from the URL only when published content fills it: an
   empty dimension renders nothing anywhere (the documented convention:
   options appear only when content exists; a dimension with no content
   doesn't even render its dropdown). The page, the rails, and the
   URL-param parser all read this one function, so a deep link can never
   filter by a lens the reader can't see or clear, and rail links never
   produce dead or invisible filters. Chapters are not a lens here: the
   chapter seg has its own ">=2 comparable chapters" rule (see the
   explore page). */

export type ExploreFilterKey = "product" | "role" | "tag" | "year";

export interface ExploreLensCounts {
  /* Number of distinct options with content (count list lengths). */
  product: number;
  role: number;
  tag: number;
  year: number;
}

/* Pure: counts in, browsable lenses out (vocabulary order). */
export function availableExploreFilters(
  counts: ExploreLensCounts,
): ExploreFilterKey[] {
  const out: ExploreFilterKey[] = [];
  if (counts.product > 0) out.push("product");
  if (counts.role > 0) out.push("role");
  if (counts.tag > 0) out.push("tag");
  if (counts.year > 0) out.push("year");
  return out;
}

/* Lede fragment joiner (pure): zh uses the CJK list style (enumeration
   comma between items, conjunction before the last); en uses the serial
   comma. Empty input yields an empty fragment so the caller can fall
   back to the lens-free lede. */
export function joinLensWords(words: string[], zh: boolean): string {
  if (words.length === 0) return "";
  if (words.length === 1) return words[0];
  if (zh) return `${words.slice(0, -1).join("、")}和${words[words.length - 1]}`;
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
}
