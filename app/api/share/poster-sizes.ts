/* 海报分档自适应高度(宽 1080 固定,内容定高):各海报按内容块估算总高,
   向上 snap 到最近档(向上 = 永不裁切,最多留一点空气)。
   用量海报内容恒满 1440,不走这里。
   纯 TS 模块(无 JSX),供路由与测试直接引用;组件只渲染 100% 画布。 */
import type {
  PostShareSnapshot,
  ProfileShareSnapshot,
  WorkShareSnapshot,
} from "@/src/lib/share-posters";

export const POSTER_WIDTH = 1080;
const POSTER_HEIGHT_STEPS = [960, 1080, 1200, 1320, 1440] as const;

/* 月刊分节海报:内容经截取(定夺 ≤3、议题 ≤5、事实 7 项)恒满 1440,同用量海报。 */
export const LETTER_POSTER_SIZE = { width: POSTER_WIDTH, height: 1440 } as const;

export function snapPosterHeight(estimated: number): number {
  for (const step of POSTER_HEIGHT_STEPS) {
    if (estimated <= step) return step;
  }
  return 1440;
}

/* CJK 感知的行数估算:CJK/全角按 1.0em,其余按 0.6em(JB Mono 字面宽)。 */
export function estimatePosterLines(text: string, fontSize: number, width: number): number {
  let units = 0;
  for (const ch of text) {
    units += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.6;
  }
  return Math.max(1, Math.ceil((units * fontSize) / width));
}

/* 骨架固定件(四张统一):页边距 80 + 身份带 133 + 主区 pads 58 + 页脚 140。 */
const FRAME = 80 + 133 + 58 + 140;
/* 指标带:上下 padding 18×2 + 标签 20 + 间距 12 + 数值 30 = 98,加各自 marginTop。 */
const BAND = 98;
const CONTENT_WIDTH = POSTER_WIDTH - 108; // 54×2 侧距

export function postPosterSize(s: PostShareSnapshot): { width: number; height: number } {
  const sparse = !s.excerpt && !s.poll && !s.linkDomain;
  const titleSize = !sparse ? 56 : s.title.length <= 20 ? 84 : s.title.length <= 40 ? 72 : 60;
  let middle = 0;
  if (sparse) middle += 113 + 16; // 引号装饰 + 标题间距
  middle += estimatePosterLines(s.title, titleSize, CONTENT_WIDTH) * titleSize * 1.3;
  if (sparse) middle += 44; // 蓝方块细线装饰
  if (s.excerpt) middle += 24 + estimatePosterLines(s.excerpt, 28, CONTENT_WIDTH) * 28 * 1.7;
  if (s.linkDomain) middle += 26 + 40;
  if (s.poll) middle += 30 + 44 + s.poll.options.length * 59 + 30;
  return { width: POSTER_WIDTH, height: snapPosterHeight(Math.round(FRAME + 40 + BAND + middle)) };
}

export function workPosterSize(s: WorkShareSnapshot): { width: number; height: number } {
  const nameSize = s.name.length <= 12 ? 88 : s.name.length <= 24 ? 72 : 58;
  let middle = estimatePosterLines(s.name, nameSize, CONTENT_WIDTH) * nameSize * 1.2;
  if (s.tagline) middle += 26 + estimatePosterLines(s.tagline, 30, CONTENT_WIDTH) * 30 * 1.7;
  if (s.agents.length > 0) {
    /* chip 折行估算:名宽(21px mono) + padding 32 + gap 12 */
    const chipsWidth =
      s.agents.reduce((sum, name) => sum + name.length * 13 + 44, 0) + (s.agentsMore > 0 ? 90 : 0);
    middle += 30 + Math.ceil(chipsWidth / CONTENT_WIDTH) * 49;
  }
  if (s.claimedTokens !== null) middle += 36 + 86 + 16 + 30; // hero 数字 + 口径行
  return { width: POSTER_WIDTH, height: snapPosterHeight(Math.round(FRAME + 40 + BAND + middle)) };
}

export function profilePosterSize(s: ProfileShareSnapshot): { width: number; height: number } {
  let middle = 0;
  if (s.usage) middle += 124; // TOKENS hero(96 数字 + 标签)
  if (s.bio) middle += 32 + estimatePosterLines(s.bio, 28, CONTENT_WIDTH) * 28 * 1.7;
  /* 贡献图:eyebrow 18 + 12 + 月标 11 + 6 + 7×21 格 + 12 + 图例 18 ≈ 224 */
  if (s.usage) middle += 36 + 224;
  return { width: POSTER_WIDTH, height: snapPosterHeight(Math.round(FRAME + 36 + BAND + middle)) };
}
