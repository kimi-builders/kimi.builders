"use client";

/* Shared submit/edit form for works: name required, link/repo at least
   one, at least one participating agent (server-validated).
   Recommending an external project (original author filled) = an
   awesome entry, which additionally requires a scope; wall entries may
   declare build effort. Intent (my work / recommend) is fixed at
   creation and unchangeable while editing (silent conversion is a
   misclick); the media area and awesome fields stay mounted, shown or
   hidden by intent — switching never loses filled or uploaded content.
   Server validation errors scroll to the error row (long forms must
   never look unresponsive). Publish-UX pass, three layers against the
   all-expanded 15-block intimidation:
   1. requireds concentrated: agents* moved into 01 basics, on screen
      with name/kind/links;
   2. optionals tucked away: media/models/publish options become native
      <details> (collapsed by default, auto-expanded when editing brings
      data back; expandable and submittable without JS, and collapsed
      fields still submit);
   3. actions ever-present: the submit bar is sticky at the bottom, the
      create button reads "publish work";
   plus section numbers 01-05 and a "minimal path" hint. Grouping + live
   preview carried over: fields group as basics -> media ->
   recommendation -> details -> publish options; the top renders a live
   grid-card preview (reusing WorkScreenshot, the exact list render
   path). Agent/platform/model-family chips are native checkboxes
   (has-checked coloring), submittable without JS; free-form model
   entry (Enter to add) needs JS, as does its delete key. Structure
   overview (a mono anchor directory under the kind seg — every block
   visible at a glance, optionals "listed" rather than "hidden") +
   self-explaining collapsible headers (summaryHint states the content;
   the whole row is hover-clickable). The edit-state defaultOpen logic
   is unchanged. A successful save redirects to /works (own works) or
   /awesome (recommended externals). */
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import CheckboxControl from "@/components/CheckboxControl";
import { AGENTS } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { isModelFamily, MODEL_FAMILIES, modelFamilyName } from "@/src/lib/model-families";
import { WORK_KINDS, workKindLabel } from "@/src/lib/work-kinds";
import { WORKS_SRC_COOKIE } from "@/src/lib/works-view";
import AgentIcon from "@/components/AgentIcon";
import ModelIcon from "@/components/ModelIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import WorkScopeIcon from "@/components/WorkScopeIcon";
import MarkdownEditor from "../../_components/MarkdownEditor";
import CoverToneField from "./CoverToneField";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import {
  FORM_BTN_GHOST,
  FORM_BTN_PRIMARY,
  INPUT_CLS,
  LABEL_CLS,
} from "@/components/form-classes";
import type { WorkFormState } from "../actions";
import WorkMediaFields, { type MediaPreviewState, type MediaRef } from "./WorkMediaFields";
import WorkScreenshot from "./WorkScreenshot";

/* Control styles were consolidated into the shared form-classes;
   aliases kept so call sites don't move. */
const inputCls = INPUT_CLS;
const labelCls = LABEL_CLS;
/* Choice inputs fill their own label instead of using `sr-only`'s page-level
   absolute position. In a long route modal, focusing an uncontained sr-only
   radio can scroll the outer <dialog> itself and strand the visible form. */
const choiceInputCls =
  "absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0";
const chipCls =
  "relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper has-checked:border-blue has-checked:bg-blue/10 has-checked:text-blue has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue";

const STATUSES = [
  { id: "planning", key: "works.statusPlanning" },
  { id: "building", key: "works.statusBuilding" },
  { id: "released", key: "works.statusReleased" },
  { id: "archived", key: "works.statusArchived" },
] as const;

const SCOPES = [
  { id: "base", key: "awesome.scopeBase", hintKey: "awesome.scopeBaseHint" },
  { id: "eco", key: "awesome.scopeEco", hintKey: "awesome.scopeEcoHint" },
  { id: "part", key: "awesome.scopePart", hintKey: "awesome.scopePartHint" },
] as const;

/* Form section: light grouping — mono subtitle + hairline separator,
   no more one unbroken 15-block line; first = the opening section (no
   separator above). Numbering: 01-05 mono ordinals for long-form
   orientation. Optional sections collapse (CollapseSection):
   media/models/publish options are purely optional enhancements in
   native <details> (expandable and submittable without JS; collapsed
   fields stay in the DOM and submit as usual); defaultOpen expands when
   editing brings data back — creation takes the minimal path, editing
   loses no context. */
function Section({
  title,
  step,
  first = false,
  id,
  children,
}: {
  title: string;
  step?: number;
  first?: boolean;
  /* Structure-overview anchors: sections with ids get scroll-mt-28
     (112px ~= top bar 56/64 + the sticky overview row, so anchor jumps
     aren't covered). */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`space-y-4 ${id ? "scroll-mt-28 " : ""}${first ? "" : "border-t border-line pt-6"}`}>
      <h3 className="kb-eyebrow">
        {step != null && <span className="mr-1.5 text-ui-blue/80">{String(step).padStart(2, "0")}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

function CollapseSection({
  title,
  step,
  optionalLabel,
  summaryHint,
  defaultOpen = false,
  id,
  children,
}: {
  title: string;
  step?: number;
  /* The "optional" marker: callers pass localized copy. */
  optionalLabel?: string;
  /* Section summary: collapsible headers explain themselves — what's
     inside at a glance, optionals are never "unknown to exist".
     Displayed inline at normal weight/tracking (explanatory, not an
     eyebrow). */
  summaryHint?: string;
  defaultOpen?: boolean;
  /* Structure-overview anchor (same as Section). */
  id?: string;
  children: ReactNode;
}) {
  return (
    <details id={id} open={defaultOpen} className={`group border-t border-line pt-6 ${id ? "scroll-mt-28" : ""}`}>
      <summary className="-mx-2 flex cursor-pointer select-none list-none items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-moon/60 [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
        <h3 className="kb-eyebrow shrink-0 transition-colors group-open:text-paper">
          {step != null && <span className="mr-1.5 text-ui-blue/80">{String(step).padStart(2, "0")}</span>}
          {title}
          {optionalLabel && (
            <span className="ml-2 rounded-[2px] border border-line px-1 py-px text-xs font-normal normal-case tracking-normal text-grey/60">
              {optionalLabel}
            </span>
          )}
        </h3>
        {summaryHint && (
          <span className="ml-auto hidden min-w-0 truncate font-sans text-xs normal-case tracking-normal text-grey/60 sm:inline">
            {summaryHint}
          </span>
        )}
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`shrink-0 text-grey/60 transition-transform group-open:rotate-180 ${summaryHint ? "" : "ml-auto"}`}
        />
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

/* Live card preview: the grid card's exact structure — cover/name brick
   + title + one-liner + kind row. Reuses WorkScreenshot (the literal
   list render path — WYSIWYG); empty cover = the name brick, awesome
   intent colors by kind family (matching the list). Empty values get
   placeholder copy so the card never collapses. */
function WorkFormPreview({
  locale,
  name,
  tagline,
  workKind,
  coverUrl,
  logoUrl,
  tone,
  fit,
}: {
  locale: Locale;
  name: string;
  tagline: string;
  workKind: string;
  coverUrl: string | null;
  logoUrl: string | null;
  tone: string;
  fit: string;
}) {
  const zh = locale === "zh";
  const kindLabel = workKindLabel(workKind, zh);
  /* The theme option means the same in both paths: follow the theme;
     per-kind coloring on Awesome is retired. */
  const toneFor = tone;
  const placeholder = zh ? "作品名称" : "Work name";
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <WorkScreenshot
        url={coverUrl ?? ""}
        name={name || placeholder}
        logoUrl={logoUrl ?? ""}
        kindLabel={kindLabel}
        kindId={workKind}
        tone={toneFor}
        fit={fit}
        embedded
        variant="grid"
      />
      <div className="p-4">
        <h2 className="truncate text-sm font-semibold leading-snug text-paper">
          {name || <span className="text-grey/60">{placeholder}</span>}
        </h2>
        <p className="mt-1 line-clamp-2 min-h-[2.6em] text-sm leading-relaxed text-grey">
          {tagline || (
            <span className="text-grey/50">{zh ? "一句话介绍…" : "Tagline…"}</span>
          )}
        </p>
        <div className="mt-2.5 flex items-center gap-1 font-mono text-xs text-grey">
          <WorkKindIcon id={workKind} size={11} />
          {kindLabel}
        </div>
      </div>
    </div>
  );
}

/* Hand-drawn checkbox (privacy switch): the same CheckboxControl style
   as the post form, submittable without JS. */
function CheckBox({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-xs text-paper">
      <CheckboxControl name={name} defaultChecked={defaultChecked} className="mt-px" />
      <span>
        {label}
        <span className="mt-0.5 block text-xs leading-relaxed text-grey">{hint}</span>
      </span>
    </label>
  );
}

/* Claim quick tiers (tokens): only tiers within the remaining claim
   allowance are shown (filtered again before render). */
const CLAIM_LADDER = [
  100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000,
] as const;

/* Same definition as the server's parseTagsInput (actions.ts):
   comma/space separated, # stripped, <=5 tags, <=24 chars each — the
   chip preview parses by the same rule, WYSIWYS. */
function parseTagsPreview(raw: string): string[] {
  return raw
    .split(/[,,\s]+/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 5)
    .map((s) => s.slice(0, 24));
}

/* Character counter at the tag row's right end: near the cap, a
   silent refusal is never a mystery. */
function LabelWithCount({
  htmlFor,
  label,
  count,
  max,
  required,
}: {
  htmlFor?: string;
  label: string;
  count: number;
  max: number;
  required?: boolean;
}) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between">
      {/* 不用共享 labelCls(自带 mb-1.5):外层 wrapper 已有下间距,叠双份会
          比别的字段多出一截 */}
      <label htmlFor={htmlFor} className="block text-xs text-grey">
        {label} {required && <span className="text-ui-blue">*</span>}
      </label>
      <span
        className={`font-mono text-xs ${count > max * 0.9 ? "text-ui-blue" : "text-grey/60"}`}
      >
        {count}/{max}
      </span>
    </span>
  );
}

export default function WorkForm({
  action,
  locale,
  workId,
  initial,
  claim,
  media,
  modal = false,
  defaultKind = "site",
  sourcePath = null,
}: {
  action: (prev: WorkFormState | null, formData: FormData) => Promise<WorkFormState>;
  locale: Locale;
  workId?: number;
  /* Create-intent default: opening from Awesome starts at "awesome"
     (the server reads kb-works-src and renders directly — no hydration
     jump); inert while editing — intent is fixed by the data. */
  defaultKind?: "site" | "awesome";
  /* Graduation attribution context: entering via a series page's
     "publish a graduation" (/works/new?path=slug) carries it — a banner
     explanation + a hidden field submitted with the form; the server
     re-validates against registered series (normalizePathSlug). */
  sourcePath?: { slug: string; text: string } | null;
  initial?: {
    name: string;
    tagline: string;
    url: string;
    repoUrl: string;
    screenshotUrl: string;
    tags: string[];
    agents: string[];
    authorLabel: string;
    visibility: string;
    status: string;
    models: string[];
    kind: string;
    descriptionMd: string;
    scope: string;
    /* Also-on-Awesome backfill. */
    alsoAwesome?: boolean;
    /* AI-in-comments switch backfill; on by default for new works. */
    aiReply?: boolean;
  };
  /* Claim context: empty = the claim field never renders (awesome
     recommendations likewise — the server also forces null). */
  claim?: {
    initial: number | null;
    hasUsage: boolean;
    remaining: number;
    suggested: { label: string; tokens: number } | null;
  };
  /* Media backfill: editing passes server-assembled mediaUrl values;
     the upload area renders only on the "my work" path (the server
     forces awesome entries empty). cover/tone/fit: standalone cover,
     name-brick tone, and fit backfill. */
  media?: {
    logo: MediaRef | null;
    images: MediaRef[];
    cover?: MediaRef | null;
    tone?: string;
    fit?: string;
  };
  /* Modal scenario: cancel = router.back() closes the modal in place,
     not a jump to /works. */
  modal?: boolean;
}) {
  const [state, formAction, pending] = useActionState<WorkFormState | null, FormData>(
    action,
    null,
  );
  /* Save success: client navigation lands on the detail page (a full
     page = a normal jump; a modal = the whole route tree re-resolves
     and the @modal slot unmounts). redirect() inside the action moves
     only the background page — the modal never closes. replace, not
     push: the action's revalidatePath invalidates the client router
     cache, so browser-back would fail to restore the intercepted modal
     and re-show the bare form as a full page — and a submitted form
     should never be re-enterable via back anyway (POST-redirect
     convention). */
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.workId) router.replace(`/works/${state.workId}`);
  }, [state, router]);
  /* Server validation errors: scroll to the error row — the grouped
     form is still long, and inside a modal the error renders beyond the
     fold; without scrolling, the user sees only "the button ungrayed
     and nothing happened". */
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state?.error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [state?.error]);
  const checkedAgents = new Set(
    initial ? initial.agents : ["kimi"], // new forms check Kimi by default
  );
  /* My work / recommend external: intent is fixed at creation — not
     switchable while editing (silent conversion is a misclick). New
     works default to the source list: entering from Awesome lands
     directly on "recommend external". */
  const [kind, setKind] = useState<"site" | "awesome">(
    initial?.authorLabel ? "awesome" : defaultKind,
  );
  /* Preview-controlled values: name/one-liner/kind appear live in the
     preview. */
  const [name, setName] = useState(initial?.name ?? "");
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [workKind, setWorkKind] = useState(initial?.kind ?? "app");
  /* Detail fields controlled: the counters and tag-chip preview need
     live values. */
  const [desc, setDesc] = useState(initial?.descriptionMd ?? "");
  const [tagsInput, setTagsInput] = useState(initial?.tags.join(", ") ?? "");
  /* Parsed with the server's exact rule; the raw full count drives the
     over-limit hint. */
  const parsedTags = parseTagsPreview(tagsInput);
  const rawTagCount = tagsInput
    .split(/[,,\s]+/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean).length;
  /* Agent count: the checkboxes stay uncontrolled (submittable without
     JS); the container counts via delegated onChange. */
  const [agentsCount, setAgentsCount] = useState(checkedAgents.size);
  /* Media preview snapshot: initialized from the backfill, then
     reported by WorkMediaFields. */
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState>({
    coverUrl: media?.cover?.url ?? null,
    logoUrl: media?.logo?.url ?? null,
    fit: media?.fit ?? "cover",
  });
  /* Tone (both CoverToneFields report; internal states stay theirs,
     this only feeds the preview). */
  const [tone, setTone] = useState(media?.tone ?? "theme");
  /* Free-form model text (entries outside the family presets). */
  const [customModels, setCustomModels] = useState<string[]>(
    (initial?.models ?? []).filter((m) => !isModelFamily(m)),
  );
  const [modelInput, setModelInput] = useState("");
  /* Full-page "cancel" target: the source-list memory wins —
     useSyncExternalStore reads the cookie client-side (server snapshot
     null, upgraded after hydration, no setState in an effect); without
     memory, fall back by current intent — an awesome form shouldn't
     dump anyone onto the works wall. */
  const srcHint = useSyncExternalStore(
    () => () => undefined,
    () =>
      document.cookie.match(
        new RegExp(`(?:^|;\\s*)${WORKS_SRC_COOKIE}=(awesome|works)`),
      )?.[1] ?? null,
    () => null,
  );
  const cancelHref = (srcHint ?? kind) === "awesome" ? "/awesome" : "/works";
  const addCustomModel = () => {
    const value = modelInput.trim().slice(0, 40);
    if (!value) return;
    setCustomModels((current) =>
      current.includes(value) || isModelFamily(value) || current.length >= 10
        ? current
        : [...current, value],
    );
    setModelInput("");
  };
  /* Claim prefill: an existing claim backfills itself; otherwise a
     suggestion prefills when present (pure convenience — editable,
     ignorable). */
  const claimDefault =
    claim?.initial != null
      ? String(claim.initial)
      : claim?.suggested
        ? String(claim.suggested.tokens)
        : undefined;
  /* Controlled value + quick tiers: every tier sits within the
     remaining allowance, one click fills it, still hand-editable. */
  const [claimValue, setClaimValue] = useState(claimDefault ?? "");
  const claimOptions = claim?.hasUsage
    ? CLAIM_LADDER.filter((v) => v <= claim.remaining)
    : [];

  return (
    <form action={formAction} className="mt-6 space-y-6">
      {workId && <input type="hidden" name="work_id" value={workId} />}
      <input type="hidden" name="kind" value={kind} />

      {/* 实时预览:网格卡同款,所见即所得(封面/名称砖随下面的字段实时变) */}
      <div>
        <span className={labelCls}>{t(locale, "works.preview")}</span>
        <div className="max-w-[280px]">
          <WorkFormPreview
            locale={locale}
            name={name}
            tagline={tagline}
            workKind={workKind}
            coverUrl={mediaPreview.coverUrl}
            logoUrl={mediaPreview.logoUrl}
            tone={tone}
            fit={mediaPreview.fit}
          />
        </div>
      </div>

      {/* 我的作品 / 推荐站外项目:意图在创建时定死——编辑存量条目不再显示切换器
          (20260919)。编辑中切换会把 awesome 推荐静默转成「我的作品」(原作者/口径
          随字段失效丢空),误操作后果不可见。
          最小路径提示(20260815):一句话交代「最少要填什么」,
          长表单的压迫感来自不知道哪些能跳过 */}
      {!workId && (
        <div>
          <div className={SEG_WRAP} role="group" aria-label={t(locale, "works.kindSite")}>
            {(
              [
                { id: "site", key: "works.kindSite" },
                { id: "awesome", key: "works.kindAwesome" },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={kind === k.id}
                className={`${SEG_ITEM} ${kind === k.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                {t(locale, k.key)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-grey/80">
            {t(locale, "works.minPath")}
          </p>
        </div>
      )}

      {/* 来源路径上下文(毕业归因,20260920):横幅 + 隐藏字段随表单提交;
          文案由服务端本地化传入(见 NewWorkContent);
          仅「我的作品」意图显示——awesome 条目无来源路径语义,服务端也强制 null(20260921) */}
      {sourcePath && kind === "site" && (
        <div>
          <input type="hidden" name="source_path" value={sourcePath.slug} />
          <p className="rounded-xl border border-dashed border-blue/50 bg-blue/5 px-3 py-2 text-xs leading-relaxed text-paper/90">
            {sourcePath.text}
          </p>
        </div>
      )}

      {/* 结构导览(20260819 发布体验):全区块锚点目录——有哪些可填一眼可见,
          可选项从「藏起来」变「列出来」;awesome 意图下 03 为推荐信息(必填常开)。
          sticky 吸顶(20260819 二轮):跳到目标节后导览仍常驻,回程不用滚回顶部;
          移动端让位 MobileTopBar(64px),桌面让位固定顶栏(56px),弹窗内贴滚动
          容器顶(0);负边距吃容器 padding 与粘性提交栏同款,两套互斥写。 */}
      <nav
        aria-label={t(locale, "works.formNav")}
        className={`sticky z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-y border-line bg-bg/95 py-3 font-mono text-xs uppercase tracking-[0.08em] backdrop-blur ${
          modal
            ? "top-0 -mx-6 px-6"
            : "top-16 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:top-14"
        }`}
      >
        <a href="#wf-basic" className="kb-navlink text-grey transition-colors hover:text-ui-blue">
          01 {t(locale, "works.secBasic")}
        </a>
        <a href="#wf-detail" className="kb-navlink text-grey transition-colors hover:text-ui-blue">
          02 {t(locale, "works.secDetail")}
        </a>
        {kind === "awesome" ? (
          <a href="#wf-recommend" className="kb-navlink text-grey transition-colors hover:text-ui-blue">
            03 {t(locale, "works.secRecommend")}
          </a>
        ) : (
          <a href="#wf-media" className="kb-navlink text-grey transition-colors hover:text-ui-blue">
            03 {t(locale, "works.secMedia")} · {t(locale, "works.optional")}
          </a>
        )}
        <a href="#wf-models" className="kb-navlink text-grey transition-colors hover:text-ui-blue">
          04 {t(locale, "works.navModels")} · {t(locale, "works.optional")}
        </a>
        <a href="#wf-publish" className="kb-navlink text-grey transition-colors hover:text-ui-blue">
          05 {t(locale, "works.secPublish")} · {t(locale, "works.optional")}
        </a>
      </nav>

      {/* ---- 01 基本信息:必填集中(name/type/agents)+ 链接二选一 ---- */}
      <Section first step={1} id="wf-basic" title={t(locale, "works.secBasic")}>
        <div>
          <LabelWithCount htmlFor="work-name" label={t(locale, "works.name")} count={name.length} max={120} required />
          <input
            id="work-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            className={inputCls}
          />
        </div>

        <div>
          <LabelWithCount htmlFor="work-tagline" label={t(locale, "works.tagline")} count={tagline.length} max={300} />
          <textarea
            id="work-tagline"
            name="tagline"
            rows={2}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={300}
            className={`${inputCls} resize-y`}
          />
        </div>

        <fieldset>
          <span className={labelCls}>
            {t(locale, "works.kind")} <span className="text-ui-blue">*</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {WORK_KINDS.map((k) => (
              <label key={k.id} className={chipCls}>
                <input
                  type="radio"
                  name="work_kind"
                  value={k.id}
                  checked={workKind === k.id}
                  onChange={() => setWorkKind(k.id)}
                  className={choiceInputCls}
                />
                <WorkKindIcon id={k.id} size={14} />
                {workKindLabel(k.id, locale === "zh")}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="work-url" className={labelCls}>
              {t(locale, "works.url")}
            </label>
            <input
              id="work-url"
              name="url"
              type="url"
              defaultValue={initial?.url}
              placeholder="https://…"
              maxLength={500}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="work-repo" className={labelCls}>
              {t(locale, "works.repoUrl")}
            </label>
            <input
              id="work-repo"
              name="repo_url"
              type="url"
              defaultValue={initial?.repoUrl}
              placeholder="https://github.com/…"
              maxLength={500}
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>

        {/* 参与构建的 Agent(必填,20260815 上移进基本信息):原先埋在第四节
            「详情」里,必填项应与 name/type 同屏;容器 onChange 事件委托计数,
            checkbox 仍非受控(无 JS 可提交),0 选中时提前红字提示 */}
        <fieldset>
          <span className={labelCls}>
            {t(locale, "works.agents")} <span className="text-ui-blue">*</span>
          </span>
          <div
            className="flex flex-wrap gap-1.5"
            onChange={(e) => {
              const box = e.currentTarget;
              setAgentsCount(
                box.querySelectorAll<HTMLInputElement>("input[name='agents']:checked").length,
              );
            }}
          >
            {AGENTS.map((a) => (
              <label key={a.id} className={chipCls}>
                <input
                  type="checkbox"
                  name="agents"
                  value={a.id}
                  defaultChecked={checkedAgents.has(a.id)}
                  className={choiceInputCls}
                />
                <AgentIcon id={a.id} size={14} />
                {a.name}
              </label>
            ))}
          </div>
          {agentsCount === 0 ? (
            <span className="mt-1 block text-xs leading-relaxed text-status-danger-fg">
              {t(locale, "err.workNoAgent")}
            </span>
          ) : (
            <span className="mt-1 block text-xs leading-relaxed text-grey/80">
              {t(locale, "works.agentsHint")}
            </span>
          )}
        </fieldset>
      </Section>

      {/* ---- 02 详情介绍:desc + tags(高频填写字段,保持常开) ---- */}
      <Section title={t(locale, "works.secDetail")} step={2} id="wf-detail">
        <div>
          <LabelWithCount htmlFor="work-desc" label={t(locale, "works.desc")} count={desc.length} max={10000} />
          <MarkdownEditor
            id="work-desc"
            name="description_md"
            locale={locale}
            rows={6}
            value={desc}
            onChange={setDesc}
            inputCls={inputCls}
          />
          <div className="mt-1.5 flex items-center justify-between font-mono text-xs text-grey/70">
            <span>{t(locale, "form.mdHint")}</span>
            <span>{t(locale, "form.mdSupport")}</span>
          </div>
        </div>

        <div>
          <label htmlFor="work-tags" className={labelCls}>
            {t(locale, "works.tags")}
          </label>
          <input
            id="work-tags"
            name="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="kimi, web, tool"
            className={`${inputCls} font-mono`}
          />
          {/* chip 预览(20260919):按服务端同口径解析——所见即所存;
              超 5 个红字提示(多的不保存),单条超 24 字截断显示 */}
          {(parsedTags.length > 0 || rawTagCount > 5) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {parsedTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  title={tag}
                  className="rounded-md border border-line px-1.5 py-px font-mono text-xs text-grey"
                >
                  {tag.length > 24 ? `${tag.slice(0, 24)}…` : tag}
                </span>
              ))}
              {rawTagCount > 5 && (
                <span className="font-mono text-xs text-status-danger-fg">
                  {t(locale, "works.tagsOver", { n: rawTagCount })}
                </span>
              )}
            </div>
          )}
          <span className="mt-1 block text-xs leading-relaxed text-grey/80">
            {t(locale, "works.tagsHint")}
          </span>
        </div>
      </Section>

      {/* 旧的「封面图 URL」退役;编辑存量条目时用隐藏字段原样带回 screenshot_url,
          不清空历史外链 */}
      {initial?.screenshotUrl && (
        <input type="hidden" name="screenshot_url" value={initial.screenshotUrl} />
      )}

      {/* ---- 03 媒体素材(仅「我的作品」;常驻挂载,awesome 意图下整节隐藏;
              纯可选增强,默认折叠,编辑带回媒体时展开 ---- */}
      <div id="wf-media" className={`scroll-mt-28 ${kind === "site" ? "block" : "hidden"}`}>
        <CollapseSection
          title={t(locale, "works.secMedia")}
          step={3}
          optionalLabel={t(locale, "works.optional")}
          summaryHint={t(locale, "works.mediaSummary")}
          defaultOpen={Boolean(media && (media.logo || media.cover || media.images.length > 0))}
        >
          <WorkMediaFields
            locale={locale}
            initialLogo={media?.logo ?? null}
            initialImages={media?.images ?? []}
            initialCover={media?.cover ?? null}
            initialTone={media?.tone ?? "theme"}
            initialFit={media?.fit ?? "cover"}
            inactive={kind !== "site"}
            onPreviewChange={setMediaPreview}
            onToneChange={setTone}
          />
        </CollapseSection>
      </div>

      {/* ---- 03 推荐信息(仅「推荐站外项目」;含必填字段,可见时常开;
              常驻挂载,site 意图下整节隐藏 ---- */}
      <div id="wf-recommend" className={`scroll-mt-28 ${kind === "awesome" ? "block" : "hidden"}`}>
        <Section title={t(locale, "works.secRecommend")} step={3}>
          {/* 控件摘掉 name(无名控件不随表单提交):残留的 author_label 不会把
              「我的作品」误变成 awesome 条目(服务端按 author_label 非空分流) */}
          {kind === "awesome" && (
            <p className="rounded-xl border border-dashed border-line bg-moon px-3 py-2 text-xs leading-relaxed text-grey">
              {t(locale, "awesome.rulesBody")}
            </p>
          )}
          <div>
            <label htmlFor="work-author" className={labelCls}>
              {t(locale, "works.authorLabel")} <span className="text-ui-blue">*</span>
            </label>
            <input
              id="work-author"
              name={kind === "awesome" ? "author_label" : undefined}
              defaultValue={initial?.authorLabel}
              maxLength={120}
              placeholder={t(locale, "works.authorLabelPh")}
              className={inputCls}
            />
            <span className="mt-1 block text-xs leading-relaxed text-grey/80">
              {t(locale, "works.authorLabelHint")}
            </span>
          </div>
          <fieldset>
            <span className={labelCls}>
              {t(locale, "awesome.scope")} <span className="text-ui-blue">*</span>
            </span>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {SCOPES.map((s) => (
                <label
                  key={s.id}
                  className="relative cursor-pointer rounded-lg border border-line bg-bg px-3 py-2.5 transition-colors hover:border-paper/30 has-checked:border-blue has-checked:bg-blue/10 has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue"
                >
                  <input
                    type="radio"
                    name={kind === "awesome" ? "scope" : undefined}
                    value={s.id}
                    defaultChecked={initial?.scope === s.id}
                    className={choiceInputCls}
                  />
                  <span className="flex items-center gap-1.5 text-xs font-medium text-paper">
                    <WorkScopeIcon id={s.id} size={14} />
                    <span>{t(locale, s.key)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-grey">
                    {t(locale, s.hintKey)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {/* Awesome 条目也能定封面风格(20260914);theme 档与作品路径同义
              (20260815 按类型定色下线);常驻挂载(与作品侧互斥激活,见 inactive) */}
          <CoverToneField
            locale={locale}
            initialTone={media?.tone ?? "theme"}
            forAwesome
            inactive={kind !== "awesome"}
            onToneChange={setTone}
          />
        </Section>
      </div>


      {/* ---- 04 模型(可选增强,默认折叠;编辑带回模型时展开) ---- */}
      <CollapseSection
        title={t(locale, "works.models")}
        step={4}
        optionalLabel={t(locale, "works.optional")}
        summaryHint={t(locale, "works.modelsSummary")}
        id="wf-models"
        defaultOpen={(initial?.models ?? []).length > 0}
      >
        <fieldset>
          <span className={labelCls}>{t(locale, "works.models")}</span>
          <div className="flex flex-wrap gap-1.5">
            {MODEL_FAMILIES.map((m) => (
              <label key={m.id} className={chipCls}>
                <input
                  type="checkbox"
                  name="models"
                  value={m.id}
                  defaultChecked={initial?.models.includes(m.id)}
                  className={choiceInputCls}
                />
                <ModelIcon id={m.id} size={14} />
                {modelFamilyName(m.id, locale)}
              </label>
            ))}
            {/* 自填型号(纯文本 chip,可删) */}
            {customModels.map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1 rounded-lg border border-blue bg-blue/10 px-2.5 py-1.5 text-xs text-blue"
              >
                <input type="hidden" name="models" value={m} />
                {m}
                <button
                  type="button"
                  onClick={() => setCustomModels((current) => current.filter((x) => x !== m))}
                  aria-label={m}
                  className="text-ui-blue/70 hover:text-ui-blue"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomModel();
                }
              }}
              placeholder={t(locale, "works.modelsPh")}
              maxLength={40}
              className={`${inputCls} max-w-64 font-mono`}
            />
            <button
              type="button"
              onClick={addCustomModel}
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper"
            >
              <Plus size={12} aria-hidden="true" />
              {t(locale, "form.addOpt").replace(/^\+?\s*/, "")}
            </button>
          </div>
          <span className="mt-1 block text-xs leading-relaxed text-grey/80">
            {t(locale, "works.modelsHint")}
          </span>
        </fieldset>
      </CollapseSection>

      {/* ---- 05 发布选项:状态/声明/收录与私密(次要选择收尾;默认折叠,
              编辑带回非默认状态时展开) ---- */}
      <CollapseSection
        title={t(locale, "works.secPublish")}
        step={5}
        optionalLabel={t(locale, "works.optional")}
        summaryHint={t(locale, "works.publishSummary")}
        id="wf-publish"
        defaultOpen={Boolean(
          workId &&
            (initial?.visibility === "private" ||
              (initial?.status && initial.status !== "released") ||
              claim?.initial != null),
        )}
      >
        <div>
          <span className={labelCls}>{t(locale, "works.status")}</span>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <label key={s.id} className={chipCls}>
                <input
                  type="radio"
                  name="status"
                  value={s.id}
                  defaultChecked={(initial?.status ?? "released") === s.id}
                  className={choiceInputCls}
                />
                {t(locale, s.key)}
              </label>
            ))}
          </div>
        </div>

        {kind === "site" && claim && (
          <div>
            <label htmlFor="work-claim" className={labelCls}>
              {t(locale, "works.claim")}
            </label>
            <input
              id="work-claim"
              name="claimed_tokens"
              value={claimValue}
              onChange={(event) => setClaimValue(event.target.value)}
              placeholder={t(locale, "works.claimPh")}
              maxLength={24}
              disabled={!claim.hasUsage}
              className={`${inputCls} font-mono disabled:opacity-40`}
            />
            {claim.hasUsage && claimOptions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {claimOptions.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={claimValue === String(v)}
                    onClick={() => setClaimValue(String(v))}
                    className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                      claimValue === String(v)
                        ? "border-blue bg-blue/10 text-blue"
                        : "border-line text-grey hover:border-ui-blue/50 hover:text-paper"
                    }`}
                  >
                    {compactNumber(v, locale)}
                  </button>
                ))}
              </div>
            )}
            <span className="mt-1 block text-xs leading-relaxed text-grey/80">
              {claim.hasUsage ? (
                <>
                  {t(locale, "works.claimHint")}{" "}
                  {t(locale, "works.claimRemaining", {
                    n: compactNumber(claim.remaining, locale),
                  })}
                  {claim.suggested &&
                    ` ${t(locale, "works.claimSuggest", {
                      label: claim.suggested.label,
                      n: compactNumber(claim.suggested.tokens, locale),
                    })}`}
                </>
              ) : (
                <>
                  {t(locale, "works.claimNoUsage")}{" "}
                  <Link
                    href="/usage"
                    className="text-paper underline decoration-ui-blue/60 underline-offset-4 hover:text-ui-blue"
                  >
                    {t(locale, "works.claimNoUsageCta")}
                  </Link>
                </>
              )}
            </span>
          </div>
        )}

        {/* 私密开关 + AI 参与评论区(20260816 召唤)+ 同时收录 Awesome
            (仅「我的作品」;推荐条目恒在 Awesome,无需开关) */}
        <div className="space-y-2.5">
          {kind === "site" && (
            <CheckBox
              name="also_awesome"
              defaultChecked={initial?.alsoAwesome}
              label={t(locale, "works.alsoAwesome")}
              hint={t(locale, "works.alsoAwesomeHint")}
            />
          )}
          <CheckBox
            name="ai_reply"
            defaultChecked={initial?.aiReply ?? true}
            label={t(locale, "works.aiReply")}
            hint={t(locale, "works.aiReplyHint")}
          />
          <CheckBox
            name="private"
            defaultChecked={initial?.visibility === "private"}
            label={t(locale, "works.formPrivate")}
            hint={t(locale, "works.formPrivateHint")}
          />
        </div>
        <p className="text-xs leading-relaxed text-grey/80">
          {t(locale, "works.hint")}
        </p>
      </CollapseSection>

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
      {/* 粘性提交栏(20260815 发布体验打磨):长表单里发布按钮常驻可视区,
          不再滚丢;负边距吃掉容器的横向/纵向 padding,贴弹窗/主列边缘。
          弹窗容器 px-6 py-6(20260819 随 RouteModal 归位);完整页主列
          px-4 py-6 lg:px-6 lg:py-8,移动端抬升 bottom-20 避让底部标签栏。
          两套负边距/padding 互斥写(20260816):同优先级冲突类靠生成顺序定胜负,
          与书写顺序无关,并排写会得到两边都不预期的值。 */}
      <div
        className={`sticky z-10 flex items-center gap-3 border-t border-line bg-bg/95 py-3 backdrop-blur ${
          modal
            ? "bottom-0 -mx-6 mb-[-1.5rem] px-6"
            : "bottom-20 -mx-4 mb-[-1.5rem] px-4 sm:-mx-6 sm:px-6 lg:bottom-0 lg:mb-[-2rem]"
        }`}
      >
        {/* 弹窗场景:取消 = router.back() 关窗回原处(RouteModal 监听 URL 变化
            静默关窗);完整页 = 回来源列表(记忆优先,否则按意图) */}
        {modal ? (
          <button
            type="button"
            onClick={() => router.back()}
            className={FORM_BTN_GHOST}
          >
            {t(locale, "post.cancel")}
          </button>
        ) : (
          <Link
            href={cancelHref}
            className={FORM_BTN_GHOST}
          >
            {t(locale, "post.cancel")}
          </Link>
        )}
        <button
          type="submit"
          disabled={pending}
 className={`ml-auto shrink-0 ${FORM_BTN_PRIMARY}`}
        >
          {/* 新建 = 发布(动作语义),编辑 = 保存 */}
          {pending
            ? t(locale, "set.saving")
            : workId
              ? t(locale, "set.save")
              : t(locale, "works.submit")}
        </button>
      </div>
    </form>
  );
}
