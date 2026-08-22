/* Product vocabulary registry: the explore section's domain lens.
   Products match the "I'm using X" lookup mindset — filter facets and
   card icons, never content shelves (there is exactly one shelf: the
   series). Same pattern as cover-tones / learn-series: a curated
   vocabulary stored in code, with slugs shared by payload.products /
   URLs / cross-links; rendering counts published content and zero-count
   products never render chips (same rule as empty series). Vocabulary
   changes go through PR review (code review is editorial review) — no
   free-form additions. */
import {
  CalendarClock,
  FileText,
  Globe,
  Grab,
  Network,
  Palette,
  Presentation,
  Puzzle,
  Sheet,
  SquareCode,
  Telescope,
  type LucideIcon,
} from "lucide-react";

export interface KbProduct {
  /* Stable slug for payload.products / URL ?product=. */
  id: string;
  zh: string;
  en: string;
  icon: LucideIcon;
}

/* Registered Kimi-ecosystem products (first batch of 11; primary
   products first, capabilities after). */
export const KB_PRODUCTS: KbProduct[] = [
  { id: "kimi-code", zh: "Kimi Code", en: "Kimi Code", icon: SquareCode },
  { id: "kimi-design", zh: "Kimi Design", en: "Kimi Design", icon: Palette },
  { id: "kimi-claw", zh: "Kimi Claw", en: "Kimi Claw", icon: Grab },
  { id: "kimi-swarm", zh: "Kimi Swarm", en: "Kimi Swarm", icon: Network },
  { id: "site", zh: "网站", en: "Sites", icon: Globe },
  { id: "doc", zh: "文档", en: "Docs", icon: FileText },
  { id: "sheet", zh: "表格", en: "Sheets", icon: Sheet },
  { id: "slide", zh: "PPT", en: "Slides", icon: Presentation },
  { id: "automation", zh: "定时任务", en: "Automations", icon: CalendarClock },
  { id: "plugin", zh: "插件", en: "Plugins", icon: Puzzle },
  { id: "research", zh: "深度研究", en: "Deep Research", icon: Telescope },
];

export function findKbProduct(id: string): KbProduct | undefined {
  return KB_PRODUCTS.find((p) => p.id === id);
}

export function isKbProductId(id: string): boolean {
  return KB_PRODUCTS.some((p) => p.id === id);
}

export function kbProductLabel(id: string, zh: boolean): string | null {
  const p = findKbProduct(id);
  return p ? (zh ? p.zh : p.en) : null;
}
