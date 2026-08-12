export interface SiteSearchItem {
  href: string;
  label: string;
  description: string;
  keywords?: readonly string[];
}

export function searchSiteItems(
  items: readonly SiteSearchItem[],
  rawQuery: string,
  limit = 8,
): SiteSearchItem[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  const safeLimit = Math.max(0, Math.min(20, Math.trunc(limit)));
  if (!query) return items.slice(0, safeLimit);

  return items
    .map((item, index) => {
      const label = item.label.toLocaleLowerCase();
      const description = item.description.toLocaleLowerCase();
      const keywords = item.keywords?.join(" ").toLocaleLowerCase() ?? "";
      const exact = label === query ? 0 : 1;
      const prefix = label.startsWith(query) ? 0 : 1;
      const contains = label.includes(query) ? 0 : 1;
      const supporting = `${description} ${keywords}`.includes(query) ? 0 : 1;
      return { item, index, score: exact * 8 + prefix * 4 + contains * 2 + supporting };
    })
    .filter(({ score }) => score < 15)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, safeLimit)
    .map(({ item }) => item);
}
