/* 分段控件(时间范围 / 指标切换 / 明细粒度 / 币种)共用的样式常量。
   设计稿 .seg 语法:rounded-lg 容器 + 内边距,激活项 bg-paper text-bg。
   高度统一(20260815):项 36/28 + 容器 8(3px padding×2 + 1px 边框×2)
   = 外高 44(移动)/36(桌面),与工具行独立按钮(min-h-11 sm:min-h-9,
   用量中心 DimensionDropdown 同规格)逐像素对齐——同排混排不再高低参差。 */
export const SEG_WRAP =
  "inline-flex items-center gap-0.5 rounded-lg border border-line bg-card p-[3px]";
export const SEG_ITEM =
  "inline-flex min-h-9 items-center rounded-md px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-7";
export const SEG_ITEM_ACTIVE = "bg-paper text-bg";
export const SEG_ITEM_IDLE = "text-grey hover:text-paper";
