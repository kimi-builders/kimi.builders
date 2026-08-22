/* 产品词表注册表(20260821 探索「货架 + 透镜」改版):探索区的领域透镜。
   产品是「我在用 X」的查找心智——做筛选 facet 与卡片图标,不做内容架子
   (架子只有一个:系列)。与 cover-tones / learn-series 同范式:
   策展词表存代码不入库,slug 供 payload.products / URL / 交叉链接共用;
   渲染按已发布内容计数,0 计数不出 chips(与「0 集系列不上架」同口径)。
   词表变更走 PR 评审(代码评审即编辑评审),不开放自由添加。 */
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
  /* payload.products / URL ?product= 用的稳定 slug */
  id: string;
  zh: string;
  en: string;
  icon: LucideIcon;
}

/* Kimi 生态在册产品(20260821 首批 11 项;主产品在前,应用能力在后)。 */
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
