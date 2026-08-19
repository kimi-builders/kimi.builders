/* 月刊页共用的定夺类型 chip(20260921 抽取,此前总览/详情两页逐字重复;
   同日「给官方的信」层下线,responseChip 一并退役):
   精选构建/精选讨论/治理公示,配色与海报 DECISION_CHIP_COLORS 同族。 */
import type { IssueDecision } from "@/src/lib/monthly";

export function decisionChip(kind: IssueDecision["kind"], zh: boolean) {
  const map = {
    work: { zh: "精选构建", en: "FEATURED BUILD", cls: "border-status-ok/40 text-status-ok-fg" },
    post: { zh: "精选讨论", en: "FEATURED POST", cls: "border-blue/60 text-blue" },
    governance: { zh: "治理公示", en: "GOVERNANCE", cls: "border-line text-grey" },
  } as const;
  const m = map[kind];
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-md border px-1.5 py-px font-mono text-[11px] ${m.cls}`}>
      {zh ? m.zh : m.en}
    </span>
  );
}
