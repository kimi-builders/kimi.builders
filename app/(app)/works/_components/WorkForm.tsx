"use client";

/* 作品提交/编辑共用表单(Kimi Design + linux.do 参考):名称必填,链接/仓库至少其一,
   至少标一个参与的 Agent(服务端校验)。推荐站外项目(填了原作者)= awesome 条目,
   必须再选收录口径;作品墙条目可填构建投入声明。
   Agent/平台/模型家族芯片是原生 checkbox(has-checked 着色),无 JS 可提交;
   自填型号(回车添加)依赖 JS,删除键同样。
   保存成功由 action redirect 回 /works(自己的作品)或 /awesome(推荐的站外项目)。 */
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ImageUp, LoaderCircle, Plus, X } from "lucide-react";
import CheckboxControl from "@/components/CheckboxControl";
import { AGENTS } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { isModelFamily, MODEL_FAMILIES, modelFamilyName } from "@/src/lib/model-families";
import { uploadMedia } from "@/src/lib/upload";
import { WORK_KINDS, workKindLabel } from "@/src/lib/work-kinds";
import AgentIcon from "@/components/AgentIcon";
import ModelIcon from "@/components/ModelIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import WorkScopeIcon from "@/components/WorkScopeIcon";
import MarkdownEditor from "../../_components/MarkdownEditor";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import type { WorkFormState } from "../actions";
import WorkMediaFields, { type MediaRef } from "./WorkMediaFields";

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

export default function WorkForm({
  action,
  locale,
  workId,
  initial,
  claim,
  media,
}: {
  action: (prev: WorkFormState | null, formData: FormData) => Promise<WorkFormState>;
  locale: Locale;
  workId?: number;
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
  };
  /* 声明制上下文:空 = 不渲染声明字段( awesome 推荐等同理,服务端也会强制 null) */
  claim?: {
    initial: number | null;
    hasUsage: boolean;
    remaining: number;
    suggested: { label: string; tokens: number } | null;
  };
  /* 媒体回填(20260826_work_media):编辑时由服务端 mediaUrl 拼好 URL 传入;
     仅「我的作品」路径渲染上传区(awesome 推荐条目服务端强制置空) */
  media?: {
    logo: MediaRef | null;
    images: MediaRef[];
  };
}) {
  const [state, formAction, pending] = useActionState<WorkFormState | null, FormData>(
    action,
    null,
  );
  const checkedAgents = new Set(
    initial ? initial.agents : ["kimi"], // 新表单默认勾 Kimi
  );
  /* 我的作品 / 推荐站外项目:推荐 = 填原作者 + 收录口径;作品 = 可声明投入 */
  const [kind, setKind] = useState<"site" | "awesome">(
    initial?.authorLabel ? "awesome" : "site",
  );
  /* 自填型号(非家族预设的文本项) */
  const [customModels, setCustomModels] = useState<string[]>(
    (initial?.models ?? []).filter((m) => !isModelFamily(m)),
  );
  const [modelInput, setModelInput] = useState("");
  /* 封面图 URL:可手贴外链,也可「上传」落自家 CDN 后回填;
     broken 仅影响小预览(外链失效时不至于挂破图) */
  const [shotUrl, setShotUrl] = useState(initial?.screenshotUrl ?? "");
  const [shotUploading, setShotUploading] = useState(false);
  const [shotError, setShotError] = useState(false);
  const [shotBroken, setShotBroken] = useState(false);
  const shotFile = useRef<HTMLInputElement>(null);
  const uploadShot = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setShotUploading(true);
    setShotError(false);
    try {
      const ref = await uploadMedia(file, "image");
      setShotUrl(ref.url);
      setShotBroken(false);
    } catch {
      setShotError(true);
    } finally {
      setShotUploading(false);
    }
  };
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
    <form action={formAction} className="mt-5 space-y-4">
      {workId && <input type="hidden" name="work_id" value={workId} />}
      <input type="hidden" name="kind" value={kind} />

      {/* 我的作品 / 推荐站外项目 */}
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
      {kind === "awesome" && (
        <p className="rounded-xl border border-dashed border-line bg-moon px-3 py-2 text-[11px] leading-relaxed text-grey">
          {t(locale, "awesome.rulesBody")}
        </p>
      )}

      <div>
        <label htmlFor="work-name" className={labelCls}>
          {t(locale, "works.name")} <span className="text-blue">*</span>
        </label>
        <input
          id="work-name"
          name="name"
          defaultValue={initial?.name}
          maxLength={120}
          required
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="work-tagline" className={labelCls}>
          {t(locale, "works.tagline")}
        </label>
        <textarea
          id="work-tagline"
          name="tagline"
          rows={2}
          defaultValue={initial?.tagline}
          maxLength={300}
          className={`${inputCls} resize-y`}
        />
      </div>

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
                defaultChecked={(initial?.kind ?? "app") === k.id}
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

      <div>
        <label htmlFor="work-shot" className={labelCls}>
          {t(locale, "works.shot")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="work-shot"
            name="screenshot_url"
            type="url"
            value={shotUrl}
            onChange={(e) => {
              setShotUrl(e.target.value);
              setShotError(false);
              setShotBroken(false);
            }}
            placeholder="https://…"
            maxLength={500}
            className={`${inputCls} font-mono`}
          />
          <button
            type="button"
            onClick={() => shotFile.current?.click()}
            disabled={shotUploading}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
          >
            {shotUploading ? (
              <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <ImageUp size={12} aria-hidden="true" />
            )}
            {shotUploading ? t(locale, "works.uploading") : t(locale, "works.shotUpload")}
          </button>
        </div>
        <input
          ref={shotFile}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void uploadShot(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {shotUrl.trim() && (
          <div className="mt-2 flex items-center gap-2">
            {shotBroken ? (
              <span className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-line text-grey/50">
                <ImageUp size={16} aria-hidden="true" />
              </span>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={shotUrl}
                alt=""
                onError={() => setShotBroken(true)}
                className="h-16 w-28 rounded-lg border border-line object-cover"
              />
            )}
            <button
              type="button"
              onClick={() => {
                setShotUrl("");
                setShotBroken(false);
              }}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <X size={11} aria-hidden="true" />
              {t(locale, "works.shotClear")}
            </button>
          </div>
        )}
        {shotError && (
          <p role="alert" className="mt-1.5 text-xs text-blue">
            {t(locale, "err.uploadFailed")}
          </p>
        )}
      </div>

      {/* Logo + 配图上传(20260826_work_media):仅「我的作品」;推荐站外项目不渲染
          (组件卸载后隐藏字段不提交,服务端对 awesome 条目再强制置空) */}
      {kind === "site" && (
        <WorkMediaFields
          locale={locale}
          initialLogo={media?.logo ?? null}
          initialImages={media?.images ?? []}
        />
      )}

      <div>
        <label htmlFor="work-desc" className={labelCls}>
          {t(locale, "works.desc")}
        </label>
        <MarkdownEditor
          id="work-desc"
          name="description_md"
          locale={locale}
          rows={6}
          defaultValue={initial?.descriptionMd}
          inputCls={inputCls}
        />
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-grey/70">
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
          defaultValue={initial?.tags.join(", ")}
          placeholder="kimi, web, tool"
          className={`${inputCls} font-mono`}
        />
        <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
          {t(locale, "works.tagsHint")}
        </span>
      </div>

      <fieldset>
        <span className={labelCls}>
          {t(locale, "works.agents")} <span className="text-blue">*</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
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
        <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
          {t(locale, "works.agentsHint")}
        </span>
      </fieldset>

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


      {kind === "awesome" && (
        <>
          <div>
            <label htmlFor="work-author" className={labelCls}>
              {t(locale, "works.authorLabel")} <span className="text-blue">*</span>
            </label>
            <input
              id="work-author"
              name="author_label"
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
                    name="scope"
                    value={s.id}
                    defaultChecked={initial?.scope === s.id}
                    className={choiceInputCls}
                  />
                  <span className="flex items-center gap-1.5 text-xs font-medium text-paper">
                    <WorkScopeIcon id={s.id} size={14} />
                    <span>{t(locale, s.key)}</span>
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-relaxed text-grey">
                    {t(locale, s.hintKey)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

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
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
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

      {/* 私密开关 + 同时收录 Awesome(仅「我的作品」;推荐条目恒在 Awesome,无需开关) */}
      <div className="space-y-2.5 pt-1">
        {kind === "site" && (
          <CheckBox
            name="also_awesome"
            defaultChecked={initial?.alsoAwesome}
            label={t(locale, "works.alsoAwesome")}
            hint={t(locale, "works.alsoAwesomeHint")}
          />
        )}
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
      {state?.error && (
        <p role="alert" className="rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">{state.error}</p>
      )}
      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Link
          href="/works"
          className="inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "post.cancel")}
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="ml-auto inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
        >
          {pending ? t(locale, "set.saving") : t(locale, "set.save")}
        </button>
      </div>
    </form>
  );
}
