/* List-page header primitive: the works / awesome / learn / blog
   landing pages share one header grammar — eyebrow (.kb-eyebrow
   technical label) + H1 (.kb-h1) + lede (.kb-lede, body-grade 16px) +
   summary meta + CTA row, with an optional right aside (learn's PATH
   STACK / blog's per-issue layers; works/awesome have none). Aligned
   with the Kimi brand book: one focal point per page, left-aligned by
   default, spacing strictly on the 4px ladder. The eyebrow is a div:
   blog places an edit entry on the same row (passing a flex row
   node); other pages pass plain text. */
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
  /* learn passes "xl:block": from xl the rail already carries the
     path stack, so a collapsed aside returns the hero to one column. */
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
