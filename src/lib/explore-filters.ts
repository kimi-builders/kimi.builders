/* Explore filter enablement: which lens dropdowns appear in the
   /explore toolbar and rail. Dimensions open gradually with content
   supply — empty dimensions (roles/archive) stay closed, vocabulary and
   counting logic already in place, ready to switch on; array order =
   dropdown order. Changing this file updates the page and the rail
   (ExploreRail) together. */
export type ExploreFilterKey = "product" | "role" | "tag" | "year";

export const ENABLED_EXPLORE_FILTERS: readonly ExploreFilterKey[] = [
  "product",
];

export function isExploreFilterEnabled(key: ExploreFilterKey): boolean {
  return ENABLED_EXPLORE_FILTERS.includes(key);
}
