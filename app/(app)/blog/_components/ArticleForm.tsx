"use client";

/* 文章发布/编辑(20260822 结构化改版,对齐作品发布的体验):
   分节编号 + 吸顶结构导览 + 透镜 chips(词表注册表勾选,不再手写 JSON)+
   资源分型 repeater + 封面实时预览 + 发布/草稿 seg(下架 = 切回草稿保存;
   首次发布时间保留,重新上架即恢复)。
   payload 由结构化字段在客户端组装(hidden input),服务端校验口径不变
   (saveArticleAction → validateGuidePayload / validateLetterPayload 严格报错)。
   与作品发布的关键差异:仅 admin/mod 可发布/编辑/上下架(页面与 action 双门槛),
   普通成员不开放提交入口。 */
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FORM_BTN_PRIMARY,
  INPUT_CLS,
  LABEL_CLS,
} from "@/components/form-classes";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { KB_CHAPTERS } from "@/src/lib/kb-chapters";
import { KB_PRODUCTS } from "@/src/lib/kb-products";
import { KB_ROLES } from "@/src/lib/kb-roles";
import { LEARN_SERIES } from "@/src/lib/learn-series";
import MarkdownEditor from "../../_components/MarkdownEditor";
import ArticleCoverField from "./ArticleCoverField";
import {
  deleteArticleAction,
  saveArticleAction,
  type ArticleFormState,
} from "../actions";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

const inputCls = INPUT_CLS;

export interface ArticleFormInitial {
  id: number;
  slug: string;
  kind: "letter" | "guide";
  locale: "zh" | "en";
  title: string;
  summary: string;
  bodyMd: string;
  sortOrder: number;
  published: boolean;
  payload: string;
}

/* ---- 结构化状态 → payload 组装(纯函数,单测直接测) ---- */

interface ResourceRow {
  label: string;
  url: string;
  kind: string;
}

interface GuideFormState {
  seriesSel: string;
  chapter: string;
  cover: string;
  coverTone: string;
  products: string[];
  roles: string[];
  videoProvider: string;
  videoId: string;
  deck: string;
  durationMin: string;
  scenario: string;
  aiNote: string;
  tags: string;
  resources: ResourceRow[];
}

interface LetterFormState {
  cover: string;
  coverTone: string;
  tags: string;
  aiDigest: string;
  aiFacts: string;
  aiDecisions: string;
  governance: { title: string; note: string; rulingUrl: string }[];
}

export function parseTagInput(raw: string): string[] {
  return [...new Set(
    raw.split(/[,，\s]+/).map((s) => s.trim()).filter((s) => s && s.length <= 24),
  )].slice(0, 5);
}

export function assembleGuidePayload(s: GuideFormState): string {
  const payload: Record<string, unknown> = {};
  if (s.seriesSel) payload.series = s.seriesSel;
  if (s.chapter) payload.chapter = s.chapter;
  if (s.cover.trim()) payload.cover = s.cover.trim();
  /* theme = 跟随主题(缺省),不落 payload;固定色才入契约 */
  if (s.coverTone && s.coverTone !== "theme") payload.coverTone = s.coverTone;
  if (s.products.length) payload.products = s.products;
  if (s.roles.length) payload.roles = s.roles;
  if (s.videoId.trim()) payload.video = { provider: s.videoProvider, id: s.videoId.trim() };
  if (s.deck.trim()) payload.deck = s.deck.trim();
  const dur = Number(s.durationMin);
  if (Number.isInteger(dur) && dur > 0) payload.durationMin = dur;
  if (s.scenario.trim()) payload.scenario = s.scenario.trim();
  if (s.aiNote.trim()) payload.aiNote = s.aiNote.trim();
  const tags = parseTagInput(s.tags);
  if (tags.length) payload.tags = tags;
  const resources = s.resources.filter((r) => r.label.trim() && r.url.trim()).slice(0, 8);
  if (resources.length) payload.resources = resources;
  return JSON.stringify(payload);
}

export function assembleLetterPayload(s: LetterFormState): string {
  const payload: Record<string, unknown> = {};
  if (s.cover.trim()) payload.cover = s.cover.trim();
  /* theme = 跟随主题(缺省),不落 payload;固定色才入契约 */
  if (s.coverTone && s.coverTone !== "theme") payload.coverTone = s.coverTone;
  const tags = parseTagInput(s.tags);
  if (tags.length) payload.tags = tags;
  const disclosure: Record<string, string> = {};
  if (s.aiDigest.trim()) disclosure.digest = s.aiDigest.trim();
  if (s.aiFacts.trim()) disclosure.facts = s.aiFacts.trim();
  if (s.aiDecisions.trim()) disclosure.decisions = s.aiDecisions.trim();
  if (Object.keys(disclosure).length) payload.aiDisclosure = disclosure;
  const governance = s.governance.filter((g) => g.title.trim()).slice(0, 20);
  if (governance.length) payload.governance = governance;
  return JSON.stringify(payload);
}

function readInitialPayload(raw: string): {
  guide: GuideFormState;
  letter: LetterFormState;
} {
  let p: Record<string, unknown> = {};
  try {
    p = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    p = {};
  }
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const video = (p.video ?? {}) as { provider?: string; id?: string };
  const resources = Array.isArray(p.resources)
    ? (p.resources as ResourceRow[]).map((r) => ({
        label: r?.label ?? "", url: r?.url ?? "", kind: r?.kind ?? "resource",
      }))
    : [];
  const governance = Array.isArray(p.governance)
    ? (p.governance as { title?: string; note?: string; rulingUrl?: string }[]).map((g) => ({
        title: g?.title ?? "", note: g?.note ?? "", rulingUrl: g?.rulingUrl ?? "",
      }))
    : [];
  const disclosure = (p.aiDisclosure ?? {}) as Record<string, string>;
  return {
    guide: {
      seriesSel: str("series"),
      chapter: str("chapter"),
      cover: str("cover"),
      coverTone: str("coverTone") || "theme",
      products: Array.isArray(p.products) ? (p.products as string[]).slice(0, 3) : [],
      roles: Array.isArray(p.roles) ? (p.roles as string[]).slice(0, 3) : [],
      videoProvider: video.provider === "youtube" ? "youtube" : "bilibili",
      videoId: video.id ?? "",
      deck: str("deck"),
      durationMin: typeof p.durationMin === "number" ? String(p.durationMin) : "",
      scenario: str("scenario"),
      aiNote: str("aiNote"),
      tags: Array.isArray(p.tags) ? (p.tags as string[]).join(" ") : "",
      resources,
    },
    letter: {
      cover: str("cover"),
      coverTone: str("coverTone") || "theme",
      tags: Array.isArray(p.tags) ? (p.tags as string[]).join(" ") : "",
      aiDigest: disclosure.digest ?? "",
      aiFacts: disclosure.facts ?? "",
      aiDecisions: disclosure.decisions ?? "",
      governance,
    },
  };
}

/* ---- 展示基元 ---- */

function Section({
  title,
  step,
  id,
  first = false,
  children,
}: {
  title: string;
  step: number;
  id: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-28 space-y-4 ${first ? "" : "border-t border-line pt-6"}`}>
      <h3 className="kb-eyebrow">
        <span className="mr-1.5 text-ui-blue/80">{String(step).padStart(2, "0")}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/* 透镜 chip(产品/职业共用):可勾选,≤max 项 */
function LensPick({
  options,
  selected,
  onToggle,
  max,
  zh,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  max: number;
  zh: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.id);
        const disabled = !on && selected.length >= max;
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onToggle(o.id)}
            className={`min-h-9 rounded-lg border px-2.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              on
                ? "border-blue/60 bg-blue/10 font-semibold text-blue"
                : disabled
                  ? "cursor-default border-line text-grey/40"
                  : "border-line text-grey hover:border-ui-blue/50 hover:text-ui-blue"
            }`}
          >
            {o.label}
          </button>
        );
      })}
      <span className="self-center font-mono text-[11px] text-grey/60">
        {selected.length}/{max}
        {selected.length === 0 && (zh ? " · 不选 = 不进该透镜" : " · none = not in this lens")}
      </span>
    </div>
  );
}

export default function ArticleForm({
  locale,
  initial,
}: {
  locale: Locale;
  initial?: ArticleFormInitial;
}) {
  const zh = locale === "zh";
  const router = useRouter();
  const [kind, setKind] = useState<string>(initial?.kind ?? "guide");
  /* payload 初值解析一次(直接函数调用,不借 ref——编译器规则禁止渲染期读 ref) */
  const parsed = readInitialPayload(initial?.payload ?? "");
  const [guide, setGuide] = useState<GuideFormState>(parsed.guide);
  const [letter, setLetter] = useState<LetterFormState>(parsed.letter);
  const [publishOn, setPublishOn] = useState(initial?.published ?? false);
  const [state, formAction, pending] = useActionState<
    ArticleFormState | null,
    FormData
  >(saveArticleAction, null);
  const [deleting, setDeleting] = useState(false);

  /* 校验失败:错误条滚进视野(对齐 WorkForm 的防「看似无反应」处理) */
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state?.error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [state?.error]);

  /* 保存成功(20260822 弹窗化,与作品发布同构):发布 → replace 到详情
     (拦截弹窗静默关、落在 /explore/<slug>);存草稿 → replace 到编辑路由
     续编——表单由服务端数据重挂、行 id 天然带回(再保存走更新,不重复
     建行);弹窗态在弹窗内换成编辑表单,完整页则落到编辑页。replace 不用
     push:已提交的表单不该能通过回退再次进入(POST-redirect 惯例) */
  useEffect(() => {
    if (!state?.ok || !state.slug) return;
    if (state.published) {
      router.replace(`/explore/${state.slug}`);
    } else {
      toast(t(locale, "artf.draftSaved"));
      router.replace(
        `/blog/admin/${state.slug}/edit?locale=${state.artLocale ?? "zh"}`,
      );
    }
  }, [state, locale, router]);

  const payloadJson =
    kind === "letter"
      ? assembleLetterPayload(letter)
      : assembleGuidePayload(guide);

  const del = async () => {
    if (!initial || deleting || !window.confirm(t(locale, "artf.deleteConfirm")))
      return;
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.set("id", String(initial.id));
      const res = await deleteArticleAction(fd);
      if (!res.ok) {
        toast(res.error ?? t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.deleted"));
      router.push("/explore");
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setDeleting(false);
    }
  };

  const setG = (patch: Partial<GuideFormState>) => setGuide((g) => ({ ...g, ...patch }));
  const setL = (patch: Partial<LetterFormState>) => setLetter((l) => ({ ...l, ...patch }));
  const coverUrl = kind === "letter" ? letter.cover : guide.cover;

  /* 结构导览锚点(当前 kind 有效的节) */
  const toc: { id: string; label: string }[] = [
    { id: "af-basic", label: zh ? "基础" : "Basics" },
    { id: "af-body", label: zh ? "正文" : "Body" },
    { id: "af-mount", label: zh ? "挂载" : "Mount" },
    ...(kind === "guide"
      ? [
          { id: "af-lens", label: zh ? "透镜" : "Lenses" },
          { id: "af-media", label: zh ? "形态" : "Media" },
          { id: "af-res", label: zh ? "资源" : "Resources" },
        ]
      : []),
    { id: "af-publish", label: zh ? "发布" : "Publish" },
  ];

  return (
    <form action={formAction} className="mt-6 space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {/* payload 由结构化字段实时组装;服务端校验口径不变 */}
      <input type="hidden" name="payload" value={payloadJson} />
      <input type="hidden" name="kind" value={kind} />
      {/* publish:"on" = 发布/上架;缺省 = 草稿/下架(与 action 契约一致) */}
      {publishOn && <input type="hidden" name="publish" value="on" />}

      {/* 吸顶结构导览(WorkForm 同款语法) */}
      <nav
        aria-label={zh ? "结构导览" : "Structure"}
        className="sticky top-16 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-y border-line bg-bg/95 px-4 py-3 font-mono text-xs uppercase tracking-[0.08em] backdrop-blur sm:-mx-6 sm:px-6 lg:top-14"
      >
        {toc.map((item, i) => (
          <a key={item.id} href={`#${item.id}`} className="kb-navlink text-grey transition-colors hover:text-ui-blue">
            {String(i + 1).padStart(2, "0")} {item.label}
          </a>
        ))}
      </nav>

      <Section step={1} id="af-basic" first title={zh ? "基础" : "Basics"}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className={SEG_WRAP} role="radiogroup" aria-label={zh ? "类型" : "Type"}>
            {(
              [
                { id: "guide", key: "artf.kindGuide" },
                { id: "letter", key: "artf.kindLetter" },
              ] as const
            ).map((k) => (
              <label
                key={k.id}
                className={`${SEG_ITEM} cursor-pointer ${kind === k.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                <input
                  type="radio"
                  name="kindSeg"
                  value={k.id}
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                  className="sr-only"
                />
                {t(locale, k.key)}
              </label>
            ))}
          </div>
          <select
            name="locale"
            defaultValue={initial?.locale ?? locale}
            className={`${inputCls} w-28 font-mono text-xs`}
            title={t(locale, "artf.locale")}
          >
            <option value="zh" className="bg-bg">中文</option>
            <option value="en" className="bg-bg">EN</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLS}>{t(locale, "artf.slug")}</label>
            <input name="slug" defaultValue={initial?.slug} maxLength={160} className={`${inputCls} font-mono`} />
            <p className="mt-1.5 text-xs text-grey/70">
              {zh ? "同 slug + 不同语言 = 双语两行;URL 即 /explore/<slug>。" : "Same slug + locale pair = bilingual rows; URL is /explore/<slug>."}
            </p>
          </div>
          {kind === "guide" && (
            <div>
              <label className={LABEL_CLS}>{t(locale, "artf.sortOrder")}</label>
              <input
                name="sort_order" type="number" min={0} max={9999}
                defaultValue={initial?.sortOrder ?? 0}
                className={`${inputCls} w-full font-mono`}
              />
              <p className="mt-1.5 text-xs text-grey/70">{zh ? "系列内集序;单篇保持 0。" : "Order within a series; 0 for standalone."}</p>
            </div>
          )}
        </div>
        <div>
          <label className={LABEL_CLS}>{t(locale, "artf.title")}</label>
          <input name="title" defaultValue={initial?.title} maxLength={200} className={inputCls} />
        </div>
        <div>
          <label className={LABEL_CLS}>{t(locale, "artf.summary")}</label>
          <textarea name="summary" rows={2} defaultValue={initial?.summary} maxLength={500} className={inputCls} />
        </div>
      </Section>

      <Section step={2} id="af-body" title={zh ? "正文(Markdown)" : "Body (Markdown)"}>
        <MarkdownEditor
          name="body"
          locale={locale}
          defaultValue={initial?.bodyMd}
          rows={16}
          placeholder={zh ? "长文正文;视频为主时可留空" : "Long-form body; may be empty when video-led"}
          inputCls={inputCls}
        />
      </Section>

      <Section step={3} id="af-mount" title={zh ? "挂载与封面" : "Mount & cover"}>
        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "guide" && (
            <>
              <div>
                <label className={LABEL_CLS}>{zh ? "章(主轴)" : "Chapter"}</label>
                <div className={SEG_WRAP} role="radiogroup" aria-label={zh ? "章" : "Chapter"}>
                  {[{ id: "", zh: "未挂", en: "None" }, ...KB_CHAPTERS.map((c) => ({ id: c.id, zh: c.zh, en: c.en }))].map((c) => (
                    <label
                      key={c.id || "none"}
                      className={`${SEG_ITEM} cursor-pointer ${guide.chapter === c.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
                    >
                      <input
                        type="radio" name="chapterSeg" value={c.id}
                        checked={guide.chapter === c.id}
                        onChange={() => setG({ chapter: c.id })}
                        className="sr-only"
                      />
                      {zh ? c.zh : c.en}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-grey/70">
                  {zh ? "单篇直接挂章;入系列的集可不挂(章随系列)。" : "Standalone pieces carry their own chapter; episodes may inherit from the series."}
                </p>
              </div>
              <div>
                <label className={LABEL_CLS}>{zh ? "系列(可选)" : "Series (optional)"}</label>
                <select
                  value={guide.seriesSel}
                  onChange={(e) => setG({ seriesSel: e.target.value })}
                  className={`${inputCls} font-mono text-xs`}
                >
                  <option value="" className="bg-bg">{zh ? "不挂系列" : "No series"}</option>
                  {LEARN_SERIES.map((s) => (
                    <option key={s.slug} value={s.slug} className="bg-bg">
                      {s.code} · {zh ? s.title.zh : s.title.en}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-grey/70">
                  {zh ? "系列现阶段前台不显示,数据层保留。" : "Series are hidden on the front-end for now; data layer keeps them."}
                </p>
              </div>
            </>
          )}
          <div className={kind === "guide" ? "" : "sm:col-span-2"}>
            <ArticleCoverField
              locale={locale}
              url={coverUrl}
              tone={kind === "letter" ? letter.coverTone : guide.coverTone}
              onUrlChange={(v) => (kind === "letter" ? setL({ cover: v }) : setG({ cover: v }))}
              onToneChange={(v) => (kind === "letter" ? setL({ coverTone: v }) : setG({ coverTone: v }))}
            />
          </div>
        </div>
      </Section>

      {kind === "guide" && (
        <>
          <Section step={4} id="af-lens" title={zh ? "透镜(产品 / 职业)" : "Lenses (products / roles)"}>
            <div>
              <label className={LABEL_CLS}>{zh ? "产品" : "Products"}</label>
              <LensPick
                options={KB_PRODUCTS.map((p) => ({ id: p.id, label: zh ? p.zh : p.en }))}
                selected={guide.products}
                onToggle={(id) =>
                  setG({
                    products: guide.products.includes(id)
                      ? guide.products.filter((x) => x !== id)
                      : [...guide.products, id],
                  })
                }
                max={3}
                zh={zh}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>{zh ? "职业" : "Roles"}</label>
              <LensPick
                options={KB_ROLES.map((r) => ({ id: r.id, label: zh ? r.zh : r.en }))}
                selected={guide.roles}
                onToggle={(id) =>
                  setG({
                    roles: guide.roles.includes(id)
                      ? guide.roles.filter((x) => x !== id)
                      : [...guide.roles, id],
                  })
                }
                max={3}
                zh={zh}
              />
            </div>
            <p className="text-xs leading-relaxed text-grey/70">
              {zh
                ? "透镜随内容计数自动显隐:筛选器与右栏只出有内容的维度(启用配置见 src/lib/explore-filters.ts)。"
                : "Lenses surface by content counts; enabled dimensions live in src/lib/explore-filters.ts."}
            </p>
          </Section>

          <Section step={5} id="af-media" title={zh ? "形态(视频 / 演示稿)" : "Media (video / deck)"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>{zh ? "视频(可选)" : "Video (optional)"}</label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className={SEG_WRAP} role="radiogroup" aria-label={zh ? "平台" : "Provider"}>
                    {["bilibili", "youtube"].map((pv) => (
                      <label
                        key={pv}
                        className={`${SEG_ITEM} cursor-pointer ${guide.videoProvider === pv ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
                      >
                        <input
                          type="radio" name="videoProvider" value={pv}
                          checked={guide.videoProvider === pv}
                          onChange={() => setG({ videoProvider: pv })}
                          className="sr-only"
                        />
                        {pv === "bilibili" ? "B 站" : "YouTube"}
                      </label>
                    ))}
                  </div>
                  <input
                    value={guide.videoId}
                    onChange={(e) => setG({ videoId: e.target.value })}
                    placeholder={guide.videoProvider === "bilibili" ? "BV…" : "video id"}
                    maxLength={64}
                    className={`${inputCls} w-44 font-mono text-xs`}
                  />
                </div>
                <p className="mt-1.5 text-xs text-grey/70">
                  {zh ? "视频为主时正文可空(详情出「以视频为主」)。" : "Body may be empty when video-led."}
                </p>
              </div>
              <div>
                <label className={LABEL_CLS}>{zh ? "演示稿(可选)" : "Deck (optional)"}</label>
                <input
                  value={guide.deck}
                  onChange={(e) => setG({ deck: e.target.value })}
                  placeholder="/decks/x.html 或 https://…"
                  maxLength={500}
                  className={`${inputCls} font-mono text-xs`}
                />
                <p className="mt-1.5 text-xs text-grey/70">{zh ? "站内路径自带导出/下载语义。" : "In-site paths get download semantics."}</p>
              </div>
              <div>
                <label className={LABEL_CLS}>{zh ? "时长(分钟)" : "Length (min)"}</label>
                <input
                  value={guide.durationMin}
                  onChange={(e) => setG({ durationMin: e.target.value.replace(/[^\d]/g, "") })}
                  inputMode="numeric" placeholder="15" maxLength={3}
                  className={`${inputCls} w-28 font-mono text-xs`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>{zh ? "场景(动词开头)" : "Scenario (verb-first)"}</label>
                <input
                  value={guide.scenario}
                  onChange={(e) => setG({ scenario: e.target.value })}
                  placeholder={zh ? "起一个项目 / 做判例摘要" : "Start a project / Brief case law"}
                  maxLength={40}
                  className={inputCls}
                />
              </div>
            </div>
          </Section>

          <Section step={6} id="af-res" title={zh ? "资源(可带走的资产)" : "Resources (takeaway assets)"}>
            <ul className="space-y-2">
              {guide.resources.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    value={r.label}
                    onChange={(e) => {
                      const next = [...guide.resources];
                      next[i] = { ...r, label: e.target.value };
                      setG({ resources: next });
                    }}
                    placeholder={zh ? "名称,如「本集提示词」" : "Label"}
                    maxLength={40}
                    className={`${inputCls} w-44 text-xs`}
                  />
                  <input
                    value={r.url}
                    onChange={(e) => {
                      const next = [...guide.resources];
                      next[i] = { ...r, url: e.target.value };
                      setG({ resources: next });
                    }}
                    placeholder="https://… 或 /p/…"
                    maxLength={500}
                    className={`${inputCls} min-w-48 flex-1 font-mono text-xs`}
                  />
                  <select
                    value={r.kind}
                    onChange={(e) => {
                      const next = [...guide.resources];
                      next[i] = { ...r, kind: e.target.value };
                      setG({ resources: next });
                    }}
                    className={`${inputCls} w-32 font-mono text-xs`}
                    aria-label={zh ? "分型" : "Kind"}
                  >
                    {[
                      { id: "official", zh: "官方链接", en: "Official" },
                      { id: "resource", zh: "推荐资源", en: "Recommended" },
                      { id: "prompt", zh: "提示词", en: "Prompt" },
                      { id: "skill", zh: "SKILLS", en: "Skills" },
                      { id: "file", zh: "源文件", en: "Source file" },
                    ].map((k) => (
                      <option key={k.id} value={k.id} className="bg-bg">{zh ? k.zh : k.en}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setG({ resources: guide.resources.filter((_, j) => j !== i) })}
                    aria-label={zh ? `移除资源 ${i + 1}` : `Remove resource ${i + 1}`}
                    className="flex size-9 items-center justify-center rounded-lg border border-line text-grey transition-colors hover:border-status-danger/50 hover:text-status-danger-fg"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {guide.resources.length < 8 && (
              <button
                type="button"
                onClick={() => setG({ resources: [...guide.resources, { label: "", url: "", kind: "resource" }] })}
                className="rounded-lg border border-line px-3 py-2 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue"
              >
                + {zh ? "添加资源" : "Add resource"}
              </button>
            )}
          </Section>
        </>
      )}

      <Section step={kind === "guide" ? 7 : 4} id="af-meta" title={zh ? "标签与披露" : "Tags & disclosure"}>
        <div>
          <label className={LABEL_CLS}>{zh ? "标签(空格/逗号分隔,≤5)" : "Tags (space/comma separated, ≤5)"}</label>
          <input
            value={kind === "letter" ? letter.tags : guide.tags}
            onChange={(e) =>
              kind === "letter" ? setL({ tags: e.target.value }) : setG({ tags: e.target.value })
            }
            placeholder={zh ? "入门 工作流 效率" : "starter workflow efficiency"}
            className={inputCls}
          />
          <p className="mt-1.5 font-mono text-xs text-grey/70">
            {parseTagInput(kind === "letter" ? letter.tags : guide.tags).join(" #") &&
              `#${parseTagInput(kind === "letter" ? letter.tags : guide.tags).join(" #")}`}
          </p>
        </div>
        {kind === "guide" ? (
          <div>
            <label className={LABEL_CLS}>{zh ? "AI 参与披露(可选)" : "AI involvement note (optional)"}</label>
            <textarea
              value={guide.aiNote}
              onChange={(e) => setG({ aiNote: e.target.value })}
              rows={2} maxLength={280}
              placeholder={zh ? "AI 做了什么、人拍了什么板" : "What AI did, what humans decided"}
              className={inputCls}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  { key: "aiDigest", zh: "评鉴节披露", en: "Review disclosure" },
                  { key: "aiFacts", zh: "事实节披露", en: "Facts disclosure" },
                  { key: "aiDecisions", zh: "定夺节披露", en: "Decisions disclosure" },
                ] as const
              ).map((f) => (
                <div key={f.key}>
                  <label className={LABEL_CLS}>{zh ? f.zh : f.en}</label>
                  <textarea
                    value={letter[f.key]}
                    onChange={(e) => setL({ [f.key]: e.target.value } as Partial<LetterFormState>)}
                    rows={2} maxLength={280}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className={LABEL_CLS}>{zh ? "治理公示(可选)" : "Governance (optional)"}</label>
              <ul className="space-y-2">
                {letter.governance.map((g, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      value={g.title}
                      onChange={(e) => {
                        const next = [...letter.governance];
                        next[i] = { ...g, title: e.target.value };
                        setL({ governance: next });
                      }}
                      placeholder={zh ? "裁决标题" : "Title"} maxLength={120}
                      className={`${inputCls} w-44 text-xs`}
                    />
                    <input
                      value={g.note}
                      onChange={(e) => {
                        const next = [...letter.governance];
                        next[i] = { ...g, note: e.target.value };
                        setL({ governance: next });
                      }}
                      placeholder={zh ? "一句说明" : "Note"} maxLength={280}
                      className={`${inputCls} min-w-40 flex-1 text-xs`}
                    />
                    <input
                      value={g.rulingUrl}
                      onChange={(e) => {
                        const next = [...letter.governance];
                        next[i] = { ...g, rulingUrl: e.target.value };
                        setL({ governance: next });
                      }}
                      placeholder="/community/…" maxLength={500}
                      className={`${inputCls} w-44 font-mono text-xs`}
                    />
                    <button
                      type="button"
                      onClick={() => setL({ governance: letter.governance.filter((_, j) => j !== i) })}
                      aria-label={zh ? `移除公示 ${i + 1}` : `Remove ${i + 1}`}
                      className="flex size-9 items-center justify-center rounded-lg border border-line text-grey transition-colors hover:border-status-danger/50 hover:text-status-danger-fg"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {letter.governance.length < 20 && (
                <button
                  type="button"
                  onClick={() => setL({ governance: [...letter.governance, { title: "", note: "", rulingUrl: "" }] })}
                  className="rounded-lg border border-line px-3 py-2 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue"
                >
                  + {zh ? "添加公示" : "Add entry"}
                </button>
              )}
            </div>
          </>
        )}
      </Section>

      <Section step={kind === "guide" ? 8 : 5} id="af-publish" title={zh ? "发布" : "Publish"}>
        <div className="flex flex-wrap items-center gap-3">
          <div className={SEG_WRAP} role="radiogroup" aria-label={zh ? "上架状态" : "Shelf state"}>
            <label className={`${SEG_ITEM} cursor-pointer ${!publishOn ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}>
              <input
                type="radio" name="publishSeg" value="draft"
                checked={!publishOn}
                onChange={() => setPublishOn(false)}
                className="sr-only"
              />
              {zh ? "草稿(下架)" : "Draft (off shelf)"}
            </label>
            <label className={`${SEG_ITEM} cursor-pointer ${publishOn ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}>
              <input
                type="radio" name="publishSeg" value="publish"
                checked={publishOn}
                onChange={() => setPublishOn(true)}
                className="sr-only"
              />
              {zh ? "发布上架" : "Published (on shelf)"}
            </label>
          </div>
          {initial?.published && (
            <span className="rounded-md border border-status-ok/40 px-1.5 py-px font-mono text-[11px] text-status-ok-fg">
              {zh ? "当前已上架" : "currently live"}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-grey/70">
          {zh
            ? "上架 = 进入 /explore 列表与计数;切回草稿保存即下架(首次发布时间保留,再上架即恢复,URL 不变)。"
            : "On-shelf appears in /explore; switch to draft and save to take it down (first-publish time kept, URL stable)."}
        </p>

        {state?.error && (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper"
          >
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending || deleting} className={FORM_BTN_PRIMARY}>
            {pending
              ? t(locale, "set.saving")
              : publishOn
                ? initial
                  ? (zh ? "保存(保持上架)" : "Save (live)")
                  : (zh ? "发布上架" : "Publish")
                : initial
                  ? (zh ? "保存草稿" : "Save draft")
                  : (zh ? "存为草稿" : "Save as draft")}
          </button>
          {initial && (
            <button
              type="button"
              onClick={del}
              disabled={pending || deleting}
              className="rounded-lg border border-line px-3 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue disabled:opacity-40"
            >
              {deleting ? t(locale, "post.submitting") : t(locale, "post.delete")}
            </button>
          )}
        </div>
      </Section>
    </form>
  );
}
