import type { ReactNode } from "react";

export function DataMeta({
  items,
  className = "",
}: {
  items: Array<ReactNode | null | false | undefined>;
  className?: string;
}) {
  const visible = items.filter((item): item is ReactNode => item !== null && item !== false && item !== undefined);
  if (visible.length === 0) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10.5px] text-grey/70 ${className}`}>
      {visible.map((item, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 ? <i aria-hidden="true" className="h-0.5 w-0.5 rounded-full bg-grey/50" /> : null}
          <span>{item}</span>
        </span>
      ))}
    </p>
  );
}

export function MetricCard({
  label,
  labelAccessory,
  value,
  accent = false,
  comparison,
  description,
  meta = [],
  status,
  className = "",
  valueClassName = "",
}: {
  label: ReactNode;
  labelAccessory?: ReactNode;
  value: ReactNode;
  accent?: boolean;
  comparison?: ReactNode;
  description?: ReactNode;
  meta?: Array<ReactNode | null | false | undefined>;
  status?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <article className={`relative rounded-xl border border-line bg-bg p-4 ${className}`}>
      <div className="flex min-w-0 items-center gap-1 text-[11px] text-grey/80">
        <span className="truncate">{label}</span>
        {labelAccessory}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong
          className={`font-mono text-[17px] font-semibold leading-none ${accent ? "text-blue" : "text-paper"} ${valueClassName}`}
        >
          {value}
        </strong>
        {comparison ? <span className="font-mono text-[10.5px] text-grey">{comparison}</span> : null}
      </div>
      {description ? <p className="mt-2 text-[11px] leading-relaxed text-grey">{description}</p> : null}
      <DataMeta items={meta} className="mt-1.5" />
      {status}
    </article>
  );
}

export function InsightHeader({
  title,
  description,
  meta = [],
  actions,
  headingLevel = "h2",
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: Array<ReactNode | null | false | undefined>;
  actions?: ReactNode;
  headingLevel?: "h2" | "h3" | "h4";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <Heading className="text-[13px] font-semibold text-paper">{title}</Heading>
        {description ? <p className="mt-1 text-[11px] leading-relaxed text-grey">{description}</p> : null}
        <DataMeta items={meta} className="mt-1" />
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
