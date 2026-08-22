/* 教程(payload 契约 + 查询组装,20260820 知识库教程化改造)
   一集教程 = articles(kind='guide') 一行:标题/摘要/文稿正文/双语版本照旧;
   频道语义全在 payload(JSON 列):
   · series      — 所属系列 slug(src/lib/learn-series.ts 注册表在册校验);
   · video       — { provider: "bilibili" | "youtube", id }(平台嵌入;缺省 = 文稿教程);
   · deck        — 演示稿链接(站内路径或 https,可选);
   · durationMin — 时长(分钟,正整数,可选);
   · scenario    — 场景标签(如「工作流自动化」;≤40 字,可选);
   · aiNote      — AI 参与披露(≤280 字,可选;渲染进详情页脚);
   · products    — 产品透镜(≤3,slug 须在 kb-products.ts 在册;主产品在前);
   · roles       — 职业透镜(≤3,slug 须在 kb-roles.ts 在册);
   · resources   — 相关链接(≤8 条,可选 kind 分型:official/resource/prompt/skill/file)。
   校验严格(编辑后台就地报错)与渲染容错(guidePayloadFromDb 回落空)分离,
   与月刊 letter payload(src/lib/monthly.ts)同一范式。 */
import {
  getArticleBySlug,
  listArticles,
  type ArticleDetail,
  type ArticleListItem,
} from "./articles";
import { isKbChapterId } from "./kb-chapters";
import { isKbProductId } from "./kb-products";
import { isKbRoleId } from "./kb-roles";
import { isCoverTone } from "./cover-tones";
import { findLearnSeries } from "./learn-series";
import { normalizeTags } from "./monthly";

/* ---- payload 契约与校验 ---- */

export interface GuideVideo {
  provider: "bilibili" | "youtube";
  id: string;
}

/* 资源分型(20260821 透镜改版):官方链接/推荐资源/提示词/SKILLS/源文件,
   详情页资源 tab 按 kind 分组渲染;缺省 = 推荐资源。 */
export type GuideResourceKind =
  | "official"
  | "resource"
  | "prompt"
  | "skill"
  | "file";

export const GUIDE_RESOURCE_KINDS: readonly GuideResourceKind[] = [
  "official",
  "resource",
  "prompt",
  "skill",
  "file",
] as const;

export interface GuideResource {
  label: string;
  url: string;
  kind?: GuideResourceKind;
}

export interface GuidePayload {
  series?: string;
  /* 所属章(单篇教程用,slug 见 kb-chapters.ts;系列内的集不需要——
     章挂在系列注册表上,聚合层按继承链解析) */
  chapter?: string;
  /* 封面(可选):站内路径或 https 图片;列表横列卡左列。缺省 = 自动章字砖 */
  cover?: string;
  /* 章字砖色调(20260822,与作品名称砖同一色板):无上传封面/图挂时生效;
     白名单见 cover-tones.ts(theme = 跟随主题,缺省) */
  coverTone?: string;
  video?: GuideVideo;
  deck?: string;
  durationMin?: number;
  scenario?: string;
  aiNote?: string;
  /* 探索四维的标签维(20260821):≤5 个,每标签 ≤24 字 */
  tags?: string[];
  /* 资源 tab:相关链接(≤8 条) */
  resources?: GuideResource[];
  /* 产品透镜(20260821 货架+透镜):slug 须在 kb-products.ts 注册表;
     ≤3 个,主产品在前 */
  products?: string[];
  /* 职业透镜:slug 须在 kb-roles.ts 注册表;≤3 个 */
  roles?: string[];
}

export type GuidePayloadParse =
  | { ok: true; payload: GuidePayload }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function boundedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

/* 透镜 slug 列表共用校验:数组 ≤max 项、逐项在册(注册表 slug 白名单)、
   去重。编辑路径严格(不在册就地报错);渲染路径另有容错版。 */
function normalizeLensIds(
  value: unknown,
  max: number,
  isInRegistry: (id: string) => boolean,
  label: string,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: `${label} 需为数组` };
  if (value.length === 0) return { ok: false, error: `${label} 不能为空数组(省略该字段 = 不打标)` };
  if (value.length > max) return { ok: false, error: `${label} 最多 ${max} 项` };
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of value) {
    const id = boundedString(raw, 64);
    if (!id) return { ok: false, error: `${label} 每项需为 ≤64 字文本` };
    if (!isInRegistry(id)) {
      return { ok: false, error: `${label} 不在册:${id}(词表见 src/lib/kb-products.ts / kb-roles.ts)` };
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { ok: true, ids };
}

/* 渲染路径的容错版:丢非法项,合法项保留(不打掉整页)。 */
function lensIdsFromDb(
  value: unknown,
  max: number,
  isInRegistry: (id: string) => boolean,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, max)) {
    const id = boundedString(raw, 64);
    if (id && isInRegistry(id) && !seen.has(id)) seen.add(id);
  }
  return [...seen];
}

export function validateGuidePayload(value: unknown): GuidePayloadParse {
  if (!isPlainObject(value)) return { ok: false, error: "payload 必须是 JSON 对象" };
  const stray = Object.keys(value).find(
    (k) => !["series", "chapter", "cover", "coverTone", "video", "deck", "durationMin", "scenario", "aiNote", "tags", "resources", "products", "roles"].includes(k),
  );
  if (stray) return { ok: false, error: `payload 未知字段:${stray}` };
  const payload: GuidePayload = {};

  if (value.series !== undefined) {
    const s = boundedString(value.series, 64);
    if (!s) return { ok: false, error: "series 需为 ≤64 字文本" };
    if (!findLearnSeries(s)) {
      return { ok: false, error: `series 不在册:${s}(先注册 src/lib/learn-series.ts)` };
    }
    payload.series = s;
  }
  if (value.chapter !== undefined) {
    const c = boundedString(value.chapter, 16);
    if (!c) return { ok: false, error: "chapter 需为 ≤16 字文本" };
    if (!isKbChapterId(c)) {
      return { ok: false, error: `chapter 不在册:${c}(四章词表见 src/lib/kb-chapters.ts)` };
    }
    payload.chapter = c;
  }
  if (value.cover !== undefined) {
    const s = boundedString(value.cover, 500);
    if (!s || (!s.startsWith("/") && !/^https?:\/\//i.test(s))) {
      return { ok: false, error: "cover 需为站内路径或 http(s) 图片链接" };
    }
    payload.cover = s;
  }
  if (value.coverTone !== undefined) {
    const c = boundedString(value.coverTone, 16);
    if (!c || !isCoverTone(c)) {
      return { ok: false, error: `coverTone 不在册:${String(value.coverTone)}(色板见 src/lib/cover-tones.ts)` };
    }
    payload.coverTone = c;
  }
  if (value.video !== undefined) {
    if (!isPlainObject(value.video)) return { ok: false, error: "video 必须是对象" };
    const vk = Object.keys(value.video).find((k) => !["provider", "id"].includes(k));
    if (vk) return { ok: false, error: `video 未知字段:${vk}` };
    const provider = value.video.provider;
    const id = boundedString(value.video.id, 64);
    if (provider !== "bilibili" && provider !== "youtube") {
      return { ok: false, error: 'video.provider 只能是 "bilibili" 或 "youtube"' };
    }
    if (!id) return { ok: false, error: "video.id 需为 ≤64 字文本(BV 号 / 视频 id)" };
    payload.video = { provider, id };
  }
  if (value.deck !== undefined) {
    const s = boundedString(value.deck, 500);
    if (!s || (!s.startsWith("/") && !/^https:\/\//i.test(s) && !/^http:\/\//i.test(s))) {
      return { ok: false, error: "deck 需为站内路径或 http(s) 链接" };
    }
    payload.deck = s;
  }
  if (value.durationMin !== undefined) {
    const n = Number(value.durationMin);
    if (!Number.isInteger(n) || n <= 0 || n > 600) {
      return { ok: false, error: "durationMin 需为 1-600 的正整数(分钟)" };
    }
    payload.durationMin = n;
  }
  if (value.scenario !== undefined) {
    const s = boundedString(value.scenario, 40);
    if (!s) return { ok: false, error: "scenario 需为 ≤40 字文本" };
    payload.scenario = s;
  }
  if (value.aiNote !== undefined) {
    const s = boundedString(value.aiNote, 280);
    if (!s) return { ok: false, error: "aiNote 需为 1-280 字文本" };
    payload.aiNote = s;
  }
  if (value.tags !== undefined) {
    const r = normalizeTags(value.tags);
    if (!r.ok) return r;
    payload.tags = r.tags;
  }
  if (value.resources !== undefined) {
    if (!Array.isArray(value.resources) || value.resources.length > 8) {
      return { ok: false, error: "resources 需为数组(≤8 条)" };
    }
    const resources: GuideResource[] = [];
    for (let i = 0; i < value.resources.length; i++) {
      const entry = value.resources[i];
      if (!isPlainObject(entry)) return { ok: false, error: `resources[${i}] 必须是对象` };
      const label = boundedString(entry.label, 40);
      const url = boundedString(entry.url, 500);
      if (!label || !url) return { ok: false, error: `resources[${i}] label/url 必填` };
      if (!url.startsWith("/") && !/^https?:\/\//i.test(url)) {
        return { ok: false, error: `resources[${i}] url 需为站内路径或 http(s) 链接` };
      }
      const kind = entry.kind;
      if (kind !== undefined && !GUIDE_RESOURCE_KINDS.includes(kind as GuideResourceKind)) {
        return { ok: false, error: `resources[${i}].kind 只能是 ${GUIDE_RESOURCE_KINDS.join("/")}` };
      }
      resources.push({ label, url, ...(kind ? { kind: kind as GuideResourceKind } : {}) });
    }
    payload.resources = resources;
  }
  if (value.products !== undefined) {
    const r = normalizeLensIds(value.products, 3, isKbProductId, "products");
    if (!r.ok) return r;
    payload.products = r.ids;
  }
  if (value.roles !== undefined) {
    const r = normalizeLensIds(value.roles, 3, isKbRoleId, "roles");
    if (!r.ok) return r;
    payload.roles = r.ids;
  }

  return { ok: true, payload };
}

/* 编辑后台入口:JSON 文本 → 严格校验;空串 → ok + 空 payload(NULL 语义)。 */
export function parseGuidePayload(raw: string): GuidePayloadParse {
  const text = raw.trim();
  if (!text) return { ok: true, payload: {} };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "payload 不是合法 JSON" };
  }
  return validateGuidePayload(value);
}

/* DB 读取入口(渲染路径):容错——非法内容回落空 payload,不打掉整页。
   注意:渲染路径不做 series 在册校验(系列从注册表删了,已发布的集照常可读)。 */
export function guidePayloadFromDb(raw: unknown): GuidePayload {
  if (raw === null || raw === undefined || raw === "") return {};
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!isPlainObject(value)) return {};
  const payload: GuidePayload = {};
  const series = boundedString(value.series, 64);
  if (series) payload.series = series;
  const chapter = boundedString(value.chapter, 16);
  if (chapter && isKbChapterId(chapter)) payload.chapter = chapter;
  const cover = boundedString(value.cover, 500);
  if (cover && (cover.startsWith("/") || /^https?:\/\//i.test(cover))) payload.cover = cover;
  const coverTone = boundedString(value.coverTone, 16);
  if (coverTone && isCoverTone(coverTone)) payload.coverTone = coverTone;
  if (isPlainObject(value.video)) {
    const provider = value.video.provider;
    const id = boundedString(value.video.id, 64);
    if ((provider === "bilibili" || provider === "youtube") && id) {
      payload.video = { provider, id };
    }
  }
  const deck = boundedString(value.deck, 500);
  if (deck && (deck.startsWith("/") || /^https?:\/\//i.test(deck))) payload.deck = deck;
  const duration = Number(value.durationMin);
  if (Number.isInteger(duration) && duration > 0 && duration <= 600) {
    payload.durationMin = duration;
  }
  const scenario = boundedString(value.scenario, 40);
  if (scenario) payload.scenario = scenario;
  const aiNote = boundedString(value.aiNote, 280);
  if (aiNote) payload.aiNote = aiNote;
  /* 容错路径:tags/resources 单项非法只丢该项,不拖累整个 payload */
  if (Array.isArray(value.tags)) {
    const r = normalizeTags(value.tags);
    if (r.ok && r.tags.length) payload.tags = r.tags;
  }
  if (Array.isArray(value.resources)) {
    const resources: GuideResource[] = [];
    for (const entry of value.resources.slice(0, 8)) {
      if (!isPlainObject(entry)) continue;
      const label = boundedString(entry.label, 40);
      const url = boundedString(entry.url, 500);
      if (label && url && (url.startsWith("/") || /^https?:\/\//i.test(url))) {
        const kind = GUIDE_RESOURCE_KINDS.includes(entry.kind as GuideResourceKind)
          ? (entry.kind as GuideResourceKind)
          : undefined;
        resources.push({ label, url, ...(kind ? { kind } : {}) });
      }
    }
    if (resources.length) payload.resources = resources;
  }
  /* 透镜容错:非法 slug 只丢该项(渲染路径不做在册校验的同款口径) */
  const products = lensIdsFromDb(value.products, 3, isKbProductId);
  if (products.length) payload.products = products;
  const roles = lensIdsFromDb(value.roles, 3, isKbRoleId);
  if (roles.length) payload.roles = roles;
  return payload;
}

/* ---- 展示形态与查询组装 ---- */

/* 一集教程(列表/详情共用渲染契约)。 */
export interface Tutorial {
  slug: string;
  title: string;
  summary: string;
  locale: "zh" | "en";
  fallback: boolean;
  publishedAt: Date;
  /* 集序(sort_order,1 起;0 = 未编号,排尾) */
  episode: number;
  payload: GuidePayload;
  /* 所属系列(渲染期解析;不在册 = null,集仍可读) */
  series: string | null;
}

export interface TutorialDetail extends Tutorial {
  bodyMd: string;
}

function toTutorial(a: ArticleListItem): Tutorial {
  const payload = guidePayloadFromDb(a.payloadRaw);
  return {
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    locale: a.locale,
    fallback: a.fallback,
    publishedAt: a.publishedAt,
    episode: a.sortOrder,
    payload,
    series: payload.series ?? null,
  };
}

/* 集排序:集序升序,未编号(0)排尾,再按发布时间。 */
export function compareTutorials(a: Tutorial, b: Tutorial): number {
  const ea = a.episode > 0 ? a.episode : Number.MAX_SAFE_INTEGER;
  const eb = b.episode > 0 ? b.episode : Number.MAX_SAFE_INTEGER;
  if (ea !== eb) return ea - eb;
  return a.publishedAt.getTime() - b.publishedAt.getTime();
}

/* 频道目录:全部已发布集按系列分组(系列只出「有集」的)+ 最新教程流。 */
export async function getChannelOverview(uiLocale: "zh" | "en"): Promise<{
  bySeries: Map<string, Tutorial[]>;
  latest: Tutorial[];
}> {
  const articles = await listArticles("guide", uiLocale);
  const tutorials = articles.map(toTutorial);
  const bySeries = new Map<string, Tutorial[]>();
  for (const t of tutorials) {
    if (!t.series) continue;
    const list = bySeries.get(t.series) ?? [];
    list.push(t);
    bySeries.set(t.series, list);
  }
  for (const list of bySeries.values()) list.sort(compareTutorials);
  const latest = [...tutorials]
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 10);
  return { bySeries, latest };
}

/* 系列页:该系列的已发布集(按集序)。 */
export async function getSeriesTutorials(
  seriesSlug: string,
  uiLocale: "zh" | "en",
): Promise<Tutorial[]> {
  const articles = await listArticles("guide", uiLocale);
  return articles
    .map(toTutorial)
    .filter((t) => t.series === seriesSlug)
    .sort(compareTutorials);
}

/* 集详情:系列 slug + 集 slug 双定位;系列不在册/集不归此系列 → null(页面 404)。 */
export async function getTutorial(
  seriesSlug: string,
  episodeSlug: string,
  uiLocale: "zh" | "en",
): Promise<{ tutorial: TutorialDetail; seriesTutorials: Tutorial[] } | null> {
  const article = await getArticleBySlug("guide", episodeSlug, uiLocale);
  if (!article) return null;
  const tutorial = toTutorial(article);
  if (tutorial.series !== seriesSlug) return null;
  const seriesTutorials = await getSeriesTutorials(seriesSlug, uiLocale);
  return {
    tutorial: { ...tutorial, bodyMd: (article as ArticleDetail).bodyMd ?? "" },
    seriesTutorials,
  };
}

/* 集详情(探索区单 slug 定位,/explore/<slug>):系列从 payload.series 读出,
   不在册/缺失 → seriesTutorials 空数组(详情仍可读,只是没有系列上下文)。 */
export async function getTutorialBySlug(
  episodeSlug: string,
  uiLocale: "zh" | "en",
): Promise<{ tutorial: TutorialDetail; seriesTutorials: Tutorial[] } | null> {
  const article = await getArticleBySlug("guide", episodeSlug, uiLocale);
  if (!article) return null;
  const tutorial: TutorialDetail = {
    ...toTutorial(article),
    bodyMd: (article as ArticleDetail).bodyMd ?? "",
  };
  const seriesTutorials = tutorial.series
    ? await getSeriesTutorials(tutorial.series, uiLocale)
    : [];
  return { tutorial, seriesTutorials };
}

/* 详情页上/下集导航(按集序)。 */
export function episodeNeighbors(
  list: Tutorial[],
  slug: string,
): { prev: Tutorial | undefined; next: Tutorial | undefined } {
  const idx = list.findIndex((t) => t.slug === slug);
  return {
    prev: idx > 0 ? list[idx - 1] : undefined,
    next: idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined,
  };
}
