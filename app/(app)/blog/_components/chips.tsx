/* Decision-kind chips shared by the monthly pages (extracted from
   verbatim duplication across overview/detail; the retired "letter to
   the official" layer took responseChip with it): featured build /
   featured discussion / governance ruling, colored in the same family
   as the poster DECISION_CHIP_COLORS. */
import type { IssueDecision } from "@/src/lib/monthly";

export function decisionChip(kind: IssueDecision["kind"], zh: boolean) {
  const map = {
    work: { zh: "精选构建", en: "FEATURED BUILD", cls: "border-status-ok/40 text-status-ok-fg" },
    post: { zh: "精选讨论", en: "FEATURED POST", cls: "border-blue/60 text-blue" },
    governance: { zh: "治理公示", en: "GOVERNANCE", cls: "border-line text-grey" },
  } as const;
  const m = map[kind];
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-md border px-1.5 py-px font-mono text-xs ${m.cls}`}>
      {zh ? m.zh : m.en}
    </span>
  );
}
