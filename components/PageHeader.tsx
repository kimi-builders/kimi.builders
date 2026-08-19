/* 列表页页头基元(20260819 版式对齐):works / awesome / learn / blog 四个分区
   落地页共用同一页头语法——eyebrow(.kb-eyebrow 技术标签)+ H1(.kb-h1)+
   导语(.kb-lede,正文级 16px)+ 汇总 meta + CTA 行,可选右侧 aside
   (learn 的 PATH STACK / blog 的每期三层;works/awesome 无)。
   对齐 Kimi 品牌手册:一页一个焦点、默认左对齐、间距只走 4px 序列。
   eyebrow 用 div 容器:blog 需在同行右侧放编辑入口(传 flex 行节点),
   其余页面直接传文本。 */
import type { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  title,
  lede,
  meta,
  actions,
  aside,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  /* learn 传 "xl:block":≥xl 右栏已有路径栈,aside 收起后 hero 回单列 */
  className?: string;
}) {
  return (
    <header
      className={`grid gap-8${
        aside ? " lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <div>
        <div className="kb-eyebrow">{eyebrow}</div>
        <h1 className="kb-h1 mt-3">{title}</h1>
        {lede && <p className="kb-lede mt-4 max-w-2xl">{lede}</p>}
        {meta && <div className="mt-5">{meta}</div>}
        {actions && <div className="mt-8">{actions}</div>}
      </div>
      {aside}
    </header>
  );
}
