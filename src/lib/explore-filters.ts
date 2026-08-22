/* 探索筛选器启用配置(20260822):哪些透镜下拉出现在 /explore 工具行与右栏。
   按内容供给渐次开——没内容的维度先关着(职业/归档),词表与计数逻辑都在,
   翻开即用;数组顺序 = 下拉顺序。改这里,页面与右栏(ExploreRail)同步生效。 */
export type ExploreFilterKey = "product" | "role" | "tag" | "year";

export const ENABLED_EXPLORE_FILTERS: readonly ExploreFilterKey[] = [
  "product",
];

export function isExploreFilterEnabled(key: ExploreFilterKey): boolean {
  return ENABLED_EXPLORE_FILTERS.includes(key);
}
