/* 章注册表(20260821 「章主轴」改版):探索区的主浏览轴。
   使命句:从智能到创造力的最优转化(镜像官方 Seeking the optimal
   conversion from energy to intelligence 的句式)。
   四章是这条转化链上的四刀,也是用户的人生语言入口——学(信息→认知)、
   做(认知→东西)、得(东西→价值)、立(价值→位置与自我)。
   章存代码注册表(一年不动的永久框架,3-5 封顶),路(系列)挂章;
   letter(月刊)不挂章——章是「路」的语言,期刊与其正交。
   渲染按已发布内容计数,0 计数章在 seg 里置灰(恒可见)。 */
import type { L10n } from "./learn-series";

export type ChapterId = "learn" | "build" | "gain" | "become";

export interface KbChapter {
  id: ChapterId;
  zh: string;
  en: string;
  /* 定义句(章节头一句话) */
  tagline: L10n;
}

export const KB_CHAPTERS: KbChapter[] = [
  {
    id: "learn",
    zh: "学",
    en: "LEARN",
    tagline: { zh: "把智能变成你的认知", en: "Turn intelligence into your own judgment" },
  },
  {
    id: "build",
    zh: "做",
    en: "BUILD",
    tagline: { zh: "把认知变成做出来的东西", en: "Turn judgment into things you made" },
  },
  {
    id: "gain",
    zh: "得",
    en: "GAIN",
    tagline: { zh: "把东西变成价值(收入、成绩、位置)", en: "Turn what you made into value — income, results, standing" },
  },
  {
    id: "become",
    zh: "立",
    en: "BECOME",
    tagline: { zh: "把价值变成位置与自我(影响力、自由、更像自己)", en: "Turn value into who you are — influence, freedom, self" },
  },
];

export function findKbChapter(id: string): KbChapter | undefined {
  return KB_CHAPTERS.find((c) => c.id === id);
}

export function isKbChapterId(id: string): id is ChapterId {
  return KB_CHAPTERS.some((c) => c.id === id);
}

export function kbChapterLabel(id: string, zh: boolean): string | null {
  const c = findKbChapter(id);
  return c ? (zh ? c.zh : c.en) : null;
}
