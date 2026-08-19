"use client";

/* 发帖表单(Kimi Design 改造):类型 seg(文字/链接/投票)驱动字段显隐;
   话题+标题双列;投票选项 2–8 条动态增删;自绘 checkbox(AI 回复/私密);
   底栏 hint + primary 发布。提交走 server action(createPostAction),校验错误就地显示。
   完整页(/community/new)与弹窗(@modal)共用,RouteModal 已提供圆角壳。 */
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2, X } from "lucide-react";
import CheckboxControl from "@/components/CheckboxControl";
import {
  FORM_BTN_PRIMARY,
  INPUT_CLS,
  LABEL_CLS,
} from "@/components/form-classes";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { CATEGORIES } from "@/src/lib/categories";
import {
  COMMUNITY_DRAFT_KEY,
  readCommunityDraft,
  writeCommunityDraft,
  type CommunityDraft,
} from "@/src/lib/community-draft";
import { t, type Locale } from "@/src/lib/i18n";
import { createPostAction, type PostFormState } from "../actions";
import MarkdownEditor from "../../_components/MarkdownEditor";

const TYPES = [
  { id: "text", key: "form.text" },
  { id: "link", key: "form.link" },
  { id: "poll", key: "form.poll" },
] as const;

/* 控件样式收编到共享 form-classes(20260819 版式对齐);
   别名保留,下方调用点不动。 */
const inputCls = INPUT_CLS;
const labelCls = LABEL_CLS;

/* 自绘复选框:sr-only input + 兄弟节点方盒(peer-checked 驱动),与用量页 switch 同族。 */
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

export default function PostForm({
  aiDefault,
  locale,
}: {
  aiDefault: boolean;
  locale: Locale;
}) {
  const [type, setType] = useState<CommunityDraft["type"]>("text");
  const [category, setCategory] = useState("chat");
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [body, setBody] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const submittingRef = useRef(false);
  const [state, formAction, pending] = useActionState<
    PostFormState | null,
    FormData
  >(createPostAction, null);

  /* 保存成功:客户端导航落详情页(完整页 = 普通跳转;弹窗 = 整条路由树重解析,
     @modal 插槽随之卸载)。action 里 redirect() 只转背景页,弹窗不会关 */
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.postId) router.push(`/community/${state.postId}`);
  }, [state, router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const draft = readCommunityDraft(window.localStorage.getItem(COMMUNITY_DRAFT_KEY));
      if (draft) {
        setType(draft.type);
        setCategory(CATEGORIES.some((item) => item.id === draft.category) ? draft.category : "chat");
        setTitle(draft.title);
        setLinkUrl(draft.linkUrl);
        setBody(draft.body);
        setOptions(draft.options.length >= 2 ? draft.options : ["", ""]);
        setDraftRestored(true);
        setDraftSaved(true);
      }
      setDraftLoaded(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      const hasContent = !!(
        title.trim() ||
        body.trim() ||
        linkUrl.trim() ||
        options.some((option) => option.trim())
      );
      if (!hasContent) {
        window.localStorage.removeItem(COMMUNITY_DRAFT_KEY);
        setDraftSaved(false);
        return;
      }
      window.localStorage.setItem(
        COMMUNITY_DRAFT_KEY,
        writeCommunityDraft({ type, category, title, linkUrl, body, options }),
      );
      setDraftSaved(true);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [body, category, draftLoaded, linkUrl, options, title, type]);

  useEffect(() => {
    if (!pending && state?.error) submittingRef.current = false;
  }, [pending, state]);

  useEffect(
    () => () => {
      if (submittingRef.current) window.localStorage.removeItem(COMMUNITY_DRAFT_KEY);
    },
    [],
  );

  const clearDraft = () => {
    window.localStorage.removeItem(COMMUNITY_DRAFT_KEY);
    setType("text");
    setCategory("chat");
    setTitle("");
    setLinkUrl("");
    setBody("");
    setOptions(["", ""]);
    setDraftRestored(false);
    setDraftSaved(false);
  };

  return (
    <form
      action={formAction}
      onSubmitCapture={() => {
        submittingRef.current = true;
      }}
      className="mt-6 space-y-4"
    >
      {draftRestored && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-moon px-3 py-2.5 text-xs text-grey">
          <span className="min-w-0 flex-1">{t(locale, "form.draftRestored")}</span>
          <button
            type="button"
            onClick={clearDraft}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs text-grey transition-colors hover:bg-card hover:text-paper"
          >
            <Trash2 size={12} aria-hidden="true" />
            {t(locale, "form.clearDraft")}
          </button>
        </div>
      )}
      {/* 类型:seg 分段 */}
      <div className={SEG_WRAP} role="radiogroup" aria-label={t(locale, "form.pageTitle")}>
        {TYPES.map((tp) => (
          <label
            key={tp.id}
            className={`${SEG_ITEM} cursor-pointer ${type === tp.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
          >
            <input
              type="radio"
              name="type"
              value={tp.id}
              checked={type === tp.id}
              onChange={() => setType(tp.id as CommunityDraft["type"])}
              className="sr-only"
            />
            {t(locale, tp.key)}
          </label>
        ))}
      </div>

      {/* 话题 + 标题 双列(移动端单列) */}
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div>
          <label htmlFor="post-category" className={labelCls}>
            {t(locale, "form.topic")} <span className="text-ui-blue">*</span>
          </label>
          {/* 原生 select 外观与站点语言不符(20260815):appearance-none + 自绘
              ChevronDown(与筛选下拉同款),箭头位置与输入框内边距对齐 */}
          <div className="relative">
            <select
              id="post-category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={`${inputCls} cursor-pointer appearance-none pr-9`}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-bg">
                  {locale === "zh" ? c.zh : c.en}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-grey"
            />
          </div>
        </div>
        <div>
          <label htmlFor="post-title" className={labelCls}>
            {t(locale, "form.titleLabel")}{" "}
            <span className="text-grey/70">{t(locale, "form.optional")}</span>
          </label>
          <input
            id="post-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t(locale, "form.title")}
            maxLength={200}
            className={inputCls}
          />
        </div>
      </div>

      {type === "link" && (
        <div>
          <label htmlFor="post-link" className={labelCls}>
            {t(locale, "form.link")} URL <span className="text-ui-blue">*</span>
          </label>
          <input
            id="post-link"
            name="link_url"
            type="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://…"
            className={`${inputCls} font-mono`}
          />
        </div>
      )}

      {type === "poll" && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="font-mono text-xs text-grey">{t(locale, "form.pollOpts")}</p>
          <div className="mt-3 space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-center font-mono text-xs text-grey">
                  {i + 1}
                </span>
                <input
                  name="option"
                  value={opt}
                  maxLength={200}
                  onChange={(e) =>
                    setOptions(options.map((o, j) => (j === i ? e.target.value : o)))
                  }
                  className={inputCls}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    aria-label={t(locale, "modal.close")}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-paper/[0.05] hover:text-paper"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 8 && (
            <button
              type="button"
              onClick={() => setOptions([...options, ""])}
              className="mt-3 inline-flex items-center rounded-lg px-2 py-1 text-xs text-ui-blue hover:bg-ui-blue/10"
            >
              {t(locale, "form.addOpt")}
            </button>
          )}
        </div>
      )}

      <div>
        <label htmlFor="post-body" className={labelCls}>
          {t(locale, "form.bodyLabel")}
        </label>
        <MarkdownEditor
          id="post-body"
          name="body"
          locale={locale}
          value={body}
          onChange={setBody}
          rows={type === "text" ? 7 : 4}
          mentionKimi
          placeholder={t(locale, type === "text" ? "form.bodyText" : "form.bodyOpt")}
          inputCls={inputCls}
        />
        <div className="mt-2 flex items-center justify-between font-mono text-xs text-grey/70">
          <span>{t(locale, "form.mdHint")}</span>
          <span>{t(locale, "form.mdSupport")}</span>
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <CheckBox
          name="ai_reply"
          defaultChecked={aiDefault}
          label={t(locale, "form.aiReply")}
          hint={t(locale, "form.aiReplyHint")}
        />
        <CheckBox
          name="private"
          label={t(locale, "form.private")}
          hint={t(locale, "form.privateHint")}
        />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">{state.error}</p>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <span className="text-sm leading-5 text-grey/80">
          {draftSaved ? t(locale, "form.draftSaved") : t(locale, "form.footerHint")}
        </span>
        <button
          type="submit"
          disabled={pending}
 className={`ml-auto shrink-0 ${FORM_BTN_PRIMARY}`}
        >
          {pending ? t(locale, "form.posting") : t(locale, "form.submit")}
        </button>
      </div>
    </form>
  );
}
