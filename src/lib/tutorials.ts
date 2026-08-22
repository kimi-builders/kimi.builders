/* Tutorials (payload contract + query assembly). One episode = one
   articles row (kind='guide'): title/summary/body/bilingual versions as
   usual; channel semantics live entirely in the payload (JSON column):
   - series      - owning series slug (validated against the registry in
                   src/lib/learn-series.ts);
   - video       - { provider: "bilibili" | "youtube", id } (platform
                   embed; absent = text tutorial);
   - deck        - slide deck link (on-site path or https, optional);
   - durationMin - duration in minutes (positive integer, optional);
   - scenario    - scenario label (<=40 chars, optional);
   - aiNote      - AI participation disclosure (<=280 chars, optional;
                   rendered in the detail footer);
   - products    - product lens (<=3, slugs registered in kb-products.ts;
                   primary first);
   - roles       - role lens (<=3, slugs registered in kb-roles.ts);
   - resources   - related links (<=8, optional kind: official/resource/
                   prompt/skill/file).
   Strict validation (inline errors in the edit console) is separated from
   tolerant rendering (guidePayloadFromDb falls back to empty), the same
   pattern as the letter payload in src/lib/monthly.ts. */
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

/* ---- Payload contract and validation ---- */

export interface GuideVideo {
  provider: "bilibili" | "youtube";
  id: string;
}

/* Resource kinds: official link / recommended resource / prompt / SKILLS
   / source file; the detail page's resources tab groups by kind; default
   = recommended resource. */
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
  /* Owning chapter (standalone tutorials; slugs in kb-chapters.ts;
     episodes in a series don't need it — the chapter hangs on the series
     registry, resolved by inheritance in the aggregation layer). */
  chapter?: string;
  /* Cover (optional): on-site path or https image on the list card's
     left column; default = the automatic chapter brick. */
  cover?: string;
  /* Chapter-brick tone (same palette as work name bricks): applies
     without an uploaded cover/image; allowlist in cover-tones.ts (theme =
     follow the theme, default). */
  coverTone?: string;
  video?: GuideVideo;
  deck?: string;
  durationMin?: number;
  scenario?: string;
  aiNote?: string;
  /* Tag dimension of the explore lenses: <=5 tags, <=24 chars each. */
  tags?: string[];
  /* Resources tab: related links (<=8). */
  resources?: GuideResource[];
  /* Product lens: slugs must be registered in kb-products.ts; <=3,
     primary first. */
  products?: string[];
  /* Role lens: slugs must be registered in kb-roles.ts; <=3. */
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

/* Shared lens-slug validation: array <=max, each registered (registry
   allowlist), deduped. Strict on the edit path (inline errors); the
   render path has its own tolerant variant. */
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

/* Tolerant variant for rendering: drop invalid items, keep valid ones
   (never kills the page). */
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

/* Edit-console entry: JSON text -> strict validation; empty string -> ok
   + empty payload (NULL semantics). */
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

/* DB read entry (render path): tolerant — invalid content falls back to
   an empty payload, never killing the page. Note: the render path skips
   series-registry validation (if a series is removed from the registry,
   published episodes stay readable). */
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
  /* Tolerant path: an invalid tags/resources item drops alone, never
     taking down the payload. */
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
  /* Tolerant lenses: an invalid slug drops alone (same idea as skipping
     registry checks on the render path). */
  const products = lensIdsFromDb(value.products, 3, isKbProductId);
  if (products.length) payload.products = products;
  const roles = lensIdsFromDb(value.roles, 3, isKbRoleId);
  if (roles.length) payload.roles = roles;
  return payload;
}

/* ---- Display shapes and query assembly ---- */

/* One tutorial episode (render contract shared by list/detail). */
export interface Tutorial {
  slug: string;
  title: string;
  summary: string;
  locale: "zh" | "en";
  fallback: boolean;
  publishedAt: Date;
  /* Episode number (sort_order, 1-based; 0 = unnumbered, sorts last). */
  episode: number;
  payload: GuidePayload;
  /* Owning series (resolved at render; unregistered = null, the episode
     stays readable). */
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

/* Episode ordering: number ascending, unnumbered (0) last, then by
   publish time. */
export function compareTutorials(a: Tutorial, b: Tutorial): number {
  const ea = a.episode > 0 ? a.episode : Number.MAX_SAFE_INTEGER;
  const eb = b.episode > 0 ? b.episode : Number.MAX_SAFE_INTEGER;
  if (ea !== eb) return ea - eb;
  return a.publishedAt.getTime() - b.publishedAt.getTime();
}

/* Channel catalog: all published episodes grouped by series (only series
   with episodes appear) + the latest-tutorials stream. */
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

/* Series page: the series' published episodes (by number). */
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

/* Episode detail: located by series slug + episode slug; series
   unregistered or episode not in it -> null (page 404s). */
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

/* Episode detail (explore single-slug form, /explore/<slug>): the series
   is read from payload.series; unregistered/missing -> empty
   seriesTutorials (the detail stays readable, just without series
   context). */
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

/* Prev/next episode navigation on the detail page (by number). */
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
