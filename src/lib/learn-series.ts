/* 教程频道 · 系列注册表(20260820 知识库教程化改造,plan:文档库 → 系列课频道)
   系列是策展对象(少而重,RFC §2),存代码不入库——署名、验证戳、重验痕迹、
   讨论帖都在系列级;集(教程)= articles(kind='guide') + payload.series 挂载,
   查询组装在 src/lib/tutorials.ts。
   验证戳(RFC §2.2):editorHandle × verifiedModel × verifiedAt;
   stale 不手填,由 isPathStale 计算(超龄或模型换代 → 待重验)——
   验证戳必须自己不会过期说谎;reverifyLog 留每次重验的痕迹。
   讨论闭环(RFC §2.5):discussionPostId 挂社区帖(运营发帖后回填)。 */

export interface L10n {
  zh: string;
  en: string;
}

/* 站点当前担保的模型代际(验证戳的对照基准)。
   ⚠️ 模型换代时更新此值:更新瞬间,所有 verifiedModel ≠ 此值的系列
   自动转「待重验」。 */
export const CURRENT_KIMI_MODEL = "kimi-latest";

/* 验证戳保质期:verifiedAt 超过该天数未重验 → 自动「待重验」。 */
export const STALE_AFTER_DAYS = 45;

/* 计算型 stale(纯函数):验证戳必须自己不会过期说谎。
   · verifiedModel ≠ 当前模型代际 → 待重验;
   · verifiedAt(YYYY-MM[-DD])距今超 STALE_AFTER_DAYS → 待重验;
   · verifiedAt 无法解析 → 待重验(读不出的戳不担保)。 */
export function isPathStale(
  series: { verifiedModel: string; verifiedAt: string },
  currentModel: string = CURRENT_KIMI_MODEL,
  now: Date = new Date(),
): boolean {
  if (series.verifiedModel !== currentModel) return true;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(series.verifiedAt.trim());
  if (!m) return true;
  const month = Number(m[2]);
  const day = Number(m[3] ?? 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) return true;
  const verified = Date.UTC(Number(m[1]), month - 1, day);
  return now.getTime() - verified > STALE_AFTER_DAYS * 86_400_000;
}

/* 重验记录(RFC §2.2):每次重验留痕——时间 × 模型 × 编辑注记,新的在前。
   最新一次重验同时更新 verifiedAt/verifiedModel;log 是它之前的痕迹。 */
export interface ReverifyEntry {
  at: string;
  model: string;
  note: L10n;
}

/* 教程系列:频道的策展单元(「路径」的系列化)。 */
export interface LearnSeries {
  slug: string;
  /* mono 短码(目录卡角标),如 "SER-01" */
  code: string;
  title: L10n;
  /* hero 金句 */
  tagline: L10n;
  summary: L10n;
  editorHandle: string;
  verifiedModel: string;
  verifiedAt: string;
  reverifyLog: ReverifyEntry[];
  /* 讨论闭环:挂社区帖(运营发帖后回填;缺省 = 详情页不渲染讨论区) */
  discussionPostId?: number;
}

/* 在册系列(策展注册表,少而重;首批内容筹备中)。
   注意:目录页只渲染「有已发布集」的系列——注册但不发集 = 不上架,不撑空壳。 */
export const LEARN_SERIES: LearnSeries[] = [];

export function findLearnSeries(slug: string): LearnSeries | undefined {
  return LEARN_SERIES.find((s) => s.slug === slug);
}

/* 毕业归因校验(works.source_path):只接受在册系列 slug,其余置 null。 */
export function normalizePathSlug(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > 64) return null;
  return findLearnSeries(s) ? s : null;
}
