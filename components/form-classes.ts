/* 表单共用样式(20260819 版式对齐):此前各表单(post/work/article/settings)
   各自内联了四个版本的 inputCls、两档 label 字号(text-sm/text-xs)、三种主
   按钮规格,这里收编为唯一来源(手法同 seg-classes.ts)。
   对齐 Kimi 品牌手册:label = 12px 标签档;主按钮 = 页面唯一主行动(44px、
   焦点蓝,与列表页/详情页主 CTA 同规格);次要按钮 = mono 12px 文字钮。
   控件内部功能尺寸(input py-2.5、min-h-11)不参与布局 4px 序列归位。 */
export const INPUT_CLS =
  "min-h-11 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm leading-6 text-paper transition-colors placeholder:text-grey/50 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10";
export const LABEL_CLS = "mb-1.5 block text-xs leading-5 text-grey";
export const FORM_BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-blue bg-blue px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40";
export const FORM_BTN_GHOST =
  "inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
