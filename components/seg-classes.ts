/* 分段控件共用样式:所有视口统一 44px 外高。kb-control-group 同时隔离
   globals.css 的通用 nav 链接最小高度,避免容器被二次撑高。
   选中态语法(20260820 起与 usage-cli dashboard 统一,反向同步):
   反色实块(paper 底 + bg 字),不再是描边+文字提亮——选中态要一眼可见。 */
export const SEG_WRAP =
  "kb-control-group inline-flex h-11 items-center gap-0.5 rounded-lg border border-line bg-card p-[3px]";
export const SEG_ITEM =
  "inline-flex h-full min-h-0 items-center rounded-md border border-transparent px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
export const SEG_ITEM_ACTIVE = "border-paper bg-paper text-bg font-medium";
export const SEG_ITEM_IDLE = "text-grey hover:text-paper";
