/* 分段控件(时间范围 / 指标切换 / 明细粒度 / 币种)共用的样式常量。
   设计稿 .seg 语法:rounded-lg 容器 + 内边距,激活项 bg-paper text-bg。 */
export const SEG_WRAP =
  "inline-flex items-center gap-0.5 rounded-lg border border-line bg-card p-[3px]";
export const SEG_ITEM =
  "inline-flex min-h-11 items-center rounded-md px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-8";
export const SEG_ITEM_ACTIVE = "bg-paper text-bg";
export const SEG_ITEM_IDLE = "text-grey hover:text-paper";
