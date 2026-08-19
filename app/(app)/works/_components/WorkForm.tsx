"use client";

/* 作品提交/编辑共用表单(Kimi Design + linux.do 参考):名称必填,链接/仓库至少其一,
   至少标一个参与的 Agent(服务端校验)。推荐站外项目(填了原作者)= awesome 条目,
   必须再选收录口径;作品墙条目可填构建投入声明。
   意图(我的作品/推荐)创建时定死,编辑不再可切(静默转换是误操作,20260919);
   媒体区与 awesome 字段常驻挂载、按意图显隐——切换不丢已填/已传内容。
   服务端校验错误会滚动到错误条(长表单防「看似无反应」)。
   发布体验打磨(20260815):长表单「全展开 15 段」的压迫感拆成三层——
   ① 必填集中:agents* 上移进 01 基本信息,与名称/类型/链接同屏;
   ② 可选收纳:媒体/模型/发布选项改原生 <details> 折叠(默认收起,编辑带回
      数据自动展开;无 JS 仍可展开提交,收起时字段照常随表单提交);
   ③ 动作常驻:提交栏 sticky 常驻底部,新建按钮文案「发布作品」;
   加小节编号 01–05 与「最小路径」提示。分组/实时预览(20260919)沿用:
   字段按 基本信息→媒体→推荐信息→详情→发布选项 分节;顶部实时渲染网格卡预览
   (复用 WorkScreenshot,与列表同一渲染路径)。
   Agent/平台/模型家族芯片是原生 checkbox(has-checked 着色),无 JS 可提交;
   自填型号(回车添加)依赖 JS,删除键同样。
   保存成功由 action redirect 回 /works(自己的作品)或 /awesome(推荐的站外项目)。 */
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
import type { WorkFormState } from "../actions";
import WorkMediaFields, { type MediaPreviewState, type MediaRef } from "./WorkMediaFields";
import WorkScreenshot from "./WorkScreenshot";

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] text-paper transition-colors placeholder:text-grey/50 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10";
const labelCls = "mb-1.5 block text-[11.5px] text-grey";
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

/* 表单小节(20260919):轻量分组——mono 小标题 + hairline 分隔,不再是一根
   15 段直线;first = 首节(无上分隔线)。
   编号(20260815 发布体验打磨):01–05 mono 序号,长表单的定位感。
   可选节折叠(CollapseSection,20260815):媒体/模型/发布选项是纯可选增强,
   原生 <details> 收起(无 JS 也能展开与提交;收起时字段仍在 DOM、照常提交);
   编辑带回数据时 defaultOpen 自动展开——新建走最小路径,编辑不丢任何上下文。 */
function Section({
  title,
  step,
  first = false,
  children,
}: {
  title: string;
  step?: number;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`space-y-4 ${first ? "" : "border-t border-line pt-5"}`}>
      <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey/70">
        {step != null && <span className="mr-1.5 text-blue/80">{String(step).padStart(2, "0")}</span>}
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
  defaultOpen = false,
  children,
}: {
  title: string;
  step?: number;
  /* 「可选」标记:调用方传本地化文案 */
  optionalLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-line pt-5">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey/70 transition-colors group-open:text-grey">
          {step != null && <span className="mr-1.5 text-blue/80">{String(step).padStart(2, "0")}</span>}
          {title}
          {optionalLabel && (
            <span className="ml-2 rounded-[2px] border border-line px-1 py-px text-[10.5px] font-normal normal-case tracking-normal text-grey/60">
              {optionalLabel}
            </span>
          )}
        </h3>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="shrink-0 text-grey/60 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

/* 实时卡片预览(20260919):网格卡同款结构——封面/名称砖 + 标题 + 一句话 + 类型行。
   复用 WorkScreenshot(与列表完全同一渲染路径,所见即所得);cover 空 = 名称砖,
   awesome 意图按类型族定色(与列表口径一致)。空值给占位文案,卡片不塌。 */
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
  /* theme 档两条路径同义(20260815):跟随主题;Awesome 按类型定色已下线 */
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
        <h2 className="truncate text-[15px] font-semibold leading-snug text-paper">
          {name || <span className="text-grey/60">{placeholder}</span>}
        </h2>
        <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] leading-relaxed text-grey">
          {tagline || (
            <span className="text-grey/50">{zh ? "一句话介绍…" : "Tagline…"}</span>
          )}
        </p>
        <div className="mt-2.5 flex items-center gap-1 font-mono text-[11px] text-grey">
          <WorkKindIcon id={workKind} size={11} />
          {kindLabel}
        </div>
      </div>
    </div>
  );
}

/* 自绘复选框(私密开关):与发帖页同一套 CheckboxControl 样式,无 JS 可提交。 */
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
    <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] text-paper">
      <CheckboxControl name={name} defaultChecked={defaultChecked} className="mt-px" />
      <span>
        {label}
        <span className="mt-0.5 block text-[11px] leading-relaxed text-grey">{hint}</span>
      </span>
    </label>
  );
}

/* 声明快捷档位(token):只展示「剩余可声明额度之内」的档(渲染前再过滤) */
const CLAIM_LADDER = [
  100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000,
] as const;

/* 与服务端 parseTagsInput 同口径(actions.ts):逗号/空格分隔,去 #,
   ≤5 个,每个 ≤24 字——表单里 chip 预览按同一规则解析,所见即所存 */
function parseTagsPreview(raw: string): string[] {
  return raw
    .split(/[,,\s]+/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 5)
    .map((s) => s.slice(0, 24));
}

/* 字数计数器(20260919):贴在标签行右端,接近上限不再「打不进字莫名其妙」 */
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
      <label htmlFor={htmlFor} className="block text-[11.5px] text-grey">
        {label} {required && <span className="text-blue">*</span>}
      </label>
      <span
        className={`font-mono text-[11px] ${count > max * 0.9 ? "text-blue" : "text-grey/60"}`}
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
  /* 新建意图默认(20260815):从 Awesome 入口打开时 = "awesome"(服务端读
     kb-works-src 直出,无水合跳变);编辑不生效——意图由数据定死 */
  defaultKind?: "site" | "awesome";
  /* 毕业归因上下文(20260920):从路径详情页「发布毕业物」进入(/works/new?path=slug)
     时带上——横幅说明 + 隐藏字段随表单提交,服务端按在册路径复检(normalizePathSlug) */
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
    /* 同时收录 Awesome 回填(20260906) */
    alsoAwesome?: boolean;
    /* AI 参与评论区开关回填(20260816 召唤);新建默认开 */
    aiReply?: boolean;
  };
  /* 声明制上下文:空 = 不渲染声明字段( awesome 推荐等同理,服务端也会强制 null) */
  claim?: {
    initial: number | null;
    hasUsage: boolean;
    remaining: number;
    suggested: { label: string; tokens: number } | null;
  };
  /* 媒体回填(20260826_work_media):编辑时由服务端 mediaUrl 拼好 URL 传入;
     仅「我的作品」路径渲染上传区(awesome 推荐条目服务端强制置空)。
     cover(20260916)/tone/fit(20260908):独立封面、名称砖色调与适配回填 */
  media?: {
    logo: MediaRef | null;
    images: MediaRef[];
    cover?: MediaRef | null;
    tone?: string;
    fit?: string;
  };
  /* 弹窗场景(20260919):取消 = router.back() 关窗回原处,而不是跳 /works */
  modal?: boolean;
}) {
  const [state, formAction, pending] = useActionState<WorkFormState | null, FormData>(
    action,
    null,
  );
  /* 保存成功:客户端导航落详情页(完整页 = 普通跳转;弹窗 = 整条路由树重解析,
     @modal 插槽随之卸载)。action 里 redirect() 只转背景页,弹窗不会关。
     用 replace 不用 push(20260919 验收):action 的 revalidatePath 会失效
     客户端路由缓存,浏览器回退时拦截态弹窗恢复不出来、裸表单以整页重现——
     而且已提交的表单本来就不该能通过回退再次进入(POST-redirect 惯例) */
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.workId) router.replace(`/works/${state.workId}`);
  }, [state, router]);
  /* 服务端校验错误(20260919):滚动到错误条——表单分组后仍很长,弹窗里错误
     渲染在折叠线外,不滚过去用户只会看到「按钮恢复可点、毫无反应」 */
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state?.error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [state?.error]);
  const checkedAgents = new Set(
    initial ? initial.agents : ["kimi"], // 新表单默认勾 Kimi
  );
  /* 我的作品 / 推荐站外项目:意图在创建时定死——编辑存量条目不再可切
     (20260919,静默转换是误操作)。新建默认跟来源列表(20260815):
     从 Awesome 入口进来直接落在「推荐站外项目」档 */
  const [kind, setKind] = useState<"site" | "awesome">(
    initial?.authorLabel ? "awesome" : defaultKind,
  );
  /* 预览受控值(20260919):名称/一句话/类型在预览里实时出现 */
  const [name, setName] = useState(initial?.name ?? "");
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [workKind, setWorkKind] = useState(initial?.kind ?? "app");
  /* 详情字段受控:计数器与 tags chip 预览需要实时值 */
  const [desc, setDesc] = useState(initial?.descriptionMd ?? "");
  const [tagsInput, setTagsInput] = useState(initial?.tags.join(", ") ?? "");
  /* 服务端同口径解析;raw 全量计数用于超限提示 */
  const parsedTags = parseTagsPreview(tagsInput);
  const rawTagCount = tagsInput
    .split(/[,,\s]+/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean).length;
  /* Agent 选中数:checkbox 仍非受控(无 JS 可提交),容器 onChange 事件委托计数 */
  const [agentsCount, setAgentsCount] = useState(checkedAgents.size);
  /* 媒体预览快照:初始取回填,之后由 WorkMediaFields 上报 */
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState>({
    coverUrl: media?.cover?.url ?? null,
    logoUrl: media?.logo?.url ?? null,
    fit: media?.fit ?? "cover",
  });
  /* 色调(两条 CoverToneField 都上报;内部状态各自保留,这里只喂预览) */
  const [tone, setTone] = useState(media?.tone ?? "theme");
  /* 自填型号(非家族预设的文本项) */
  const [customModels, setCustomModels] = useState<string[]>(
    (initial?.models ?? []).filter((m) => !isModelFamily(m)),
  );
  const [modelInput, setModelInput] = useState("");
  /* 完整页「取消」的目标:来源列表记忆优先——useSyncExternalStore 客户端快照
     读 cookie(服务端快照 null,水合后升级,不在 effect 里 setState);
     无记忆按当前意图回落——awesome 表单不该把人送回作品墙 */
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
  /* 声明预填:已有声明回填声明值;否则有建议值时预填建议(纯省事,可改可无视) */
  const claimDefault =
    claim?.initial != null
      ? String(claim.initial)
      : claim?.suggested
        ? String(claim.suggested.tokens)
        : undefined;
  /* 受控值 + 快捷档位:档位都是「剩余可声明额度之内」的整档,一键填入,仍可手改 */
  const [claimValue, setClaimValue] = useState(claimDefault ?? "");
  const claimOptions = claim?.hasUsage
    ? CLAIM_LADDER.filter((v) => v <= claim.remaining)
    : [];

  return (
    <form action={formAction} className="mt-5 space-y-5">
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
          <p className="mt-2 text-[11.5px] leading-relaxed text-grey/80">
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
          <p className="rounded-xl border border-dashed border-blue/50 bg-blue/5 px-3 py-2 text-[11.5px] leading-relaxed text-paper/90">
            {sourcePath.text}
          </p>
        </div>
      )}

      {/* ---- 01 基本信息:必填集中(name/type/agents)+ 链接二选一 ---- */}
      <Section first step={1} title={t(locale, "works.secBasic")}>
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
            {t(locale, "works.kind")} <span className="text-blue">*</span>
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
            {t(locale, "works.agents")} <span className="text-blue">*</span>
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
            <span className="mt-1 block text-[11px] leading-relaxed text-status-danger-fg">
              {t(locale, "err.workNoAgent")}
            </span>
          ) : (
            <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
              {t(locale, "works.agentsHint")}
            </span>
          )}
        </fieldset>
      </Section>

      {/* ---- 02 详情介绍:desc + tags(高频填写字段,保持常开) ---- */}
      <Section title={t(locale, "works.secDetail")} step={2}>
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
          <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-grey/70">
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
                  className="rounded-md border border-line px-1.5 py-px font-mono text-[11px] text-grey"
                >
                  {tag.length > 24 ? `${tag.slice(0, 24)}…` : tag}
                </span>
              ))}
              {rawTagCount > 5 && (
                <span className="font-mono text-[11px] text-status-danger-fg">
                  {t(locale, "works.tagsOver", { n: rawTagCount })}
                </span>
              )}
            </div>
          )}
          <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
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
      <div className={kind === "site" ? "block" : "hidden"}>
        <CollapseSection
          title={t(locale, "works.secMedia")}
          step={3}
          optionalLabel={t(locale, "works.optional")}
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
      <div className={kind === "awesome" ? "block" : "hidden"}>
        <Section title={t(locale, "works.secRecommend")} step={3}>
          {/* 控件摘掉 name(无名控件不随表单提交):残留的 author_label 不会把
              「我的作品」误变成 awesome 条目(服务端按 author_label 非空分流) */}
          {kind === "awesome" && (
            <p className="rounded-xl border border-dashed border-line bg-moon px-3 py-2 text-[11px] leading-relaxed text-grey">
              {t(locale, "awesome.rulesBody")}
            </p>
          )}
          <div>
            <label htmlFor="work-author" className={labelCls}>
              {t(locale, "works.authorLabel")} <span className="text-blue">*</span>
            </label>
            <input
              id="work-author"
              name={kind === "awesome" ? "author_label" : undefined}
              defaultValue={initial?.authorLabel}
              maxLength={120}
              placeholder={t(locale, "works.authorLabelPh")}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
              {t(locale, "works.authorLabelHint")}
            </span>
          </div>
          <fieldset>
            <span className={labelCls}>
              {t(locale, "awesome.scope")} <span className="text-blue">*</span>
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
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-grey">
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
                  className="text-blue/70 hover:text-blue"
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
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-paper/30 hover:text-paper"
            >
              <Plus size={12} aria-hidden="true" />
              {t(locale, "form.addOpt").replace(/^\+?\s*/, "")}
            </button>
          </div>
          <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
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
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                      claimValue === String(v)
                        ? "border-blue bg-blue/10 text-blue"
                        : "border-line text-grey hover:border-blue/50 hover:text-paper"
                    }`}
                  >
                    {compactNumber(v, locale)}
                  </button>
                ))}
              </div>
            )}
            <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
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
                    className="text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
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
        <p className="text-[11px] leading-relaxed text-grey/80">
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
          弹窗容器 px-5 py-5;完整页主列 px-4 py-6 lg:px-6 lg:py-8,
          移动端抬升 bottom-20 避让底部标签栏。
          两套负边距/padding 互斥写(20260816):同优先级冲突类靠生成顺序定胜负,
          与书写顺序无关,并排写会得到两边都不预期的值。 */}
      <div
        className={`sticky z-10 flex items-center gap-3 border-t border-line bg-bg/95 py-3 backdrop-blur ${
          modal
            ? "bottom-0 -mx-5 mb-[-1.25rem] px-5"
            : "bottom-20 -mx-4 mb-[-1.5rem] px-4 sm:-mx-6 sm:px-6 lg:bottom-0 lg:mb-[-2rem]"
        }`}
      >
        {/* 弹窗场景:取消 = router.back() 关窗回原处(RouteModal 监听 URL 变化
            静默关窗);完整页 = 回来源列表(记忆优先,否则按意图) */}
        {modal ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "post.cancel")}
          </button>
        ) : (
          <Link
            href={cancelHref}
            className="inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "post.cancel")}
          </Link>
        )}
        <button
          type="submit"
          disabled={pending}
          className="ml-auto inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
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
