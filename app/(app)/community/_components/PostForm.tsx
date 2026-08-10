"use client";

/* 发帖表单(Kimi Design 改造):类型 seg(文字/链接/投票)驱动字段显隐;
   话题+标题双列;投票选项 2–8 条动态增删;自绘 checkbox(AI 回复/私密);
   底栏 hint + primary 发布。提交走 server action(createPostAction),校验错误就地显示。
   完整页(/community/new)与弹窗(@modal)共用,RouteModal 已提供圆角壳。 */
import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { CATEGORIES } from "@/src/lib/categories";
import { t, type Locale } from "@/src/lib/i18n";
import { createPostAction, type PostFormState } from "../actions";

const TYPES = [
  { id: "text", key: "form.text" },
  { id: "link", key: "form.link" },
  { id: "poll", key: "form.poll" },
] as const;

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] text-paper transition-colors placeholder:text-grey/50 focus:border-blue focus:outline-none focus:shadow-[0_0_0_3px_rgb(26_136_255/0.15)]";
const labelCls = "mb-1.5 block text-[11.5px] text-grey";

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
    <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] text-paper">
      <span className="relative mt-px inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="grid size-4 place-items-center rounded-[5px] border-[1.5px] border-line text-transparent transition-colors peer-checked:border-blue peer-checked:bg-blue peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue"
        >
          <Check size={11} strokeWidth={3} />
        </span>
      </span>
      <span>
        {label}
        <span className="mt-0.5 block text-[11px] leading-relaxed text-grey">{hint}</span>
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
  const [type, setType] = useState<string>("text");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [state, formAction, pending] = useActionState<
    PostFormState | null,
    FormData
  >(createPostAction, null);

  return (
    <form action={formAction} className="mt-5 space-y-4">
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
              onChange={() => setType(tp.id)}
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
            {t(locale, "form.topic")} <span className="text-blue">*</span>
          </label>
          <select
            id="post-category"
            name="category"
            defaultValue="chat"
            className={`${inputCls} cursor-pointer appearance-none bg-[position:right_12px_center] bg-no-repeat pr-8`}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239AA1AE' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")",
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="bg-bg">
                {locale === "zh" ? c.zh : c.en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="post-title" className={labelCls}>
            {t(locale, "form.titleLabel")}{" "}
            <span className="text-grey/70">{t(locale, "form.optional")}</span>
          </label>
          <input
            id="post-title"
            name="title"
            placeholder={t(locale, "form.title")}
            maxLength={200}
            className={inputCls}
          />
        </div>
      </div>

      {type === "link" && (
        <div>
          <label htmlFor="post-link" className={labelCls}>
            {t(locale, "form.link")} URL <span className="text-blue">*</span>
          </label>
          <input
            id="post-link"
            name="link_url"
            type="url"
            placeholder="https://…"
            className={`${inputCls} font-mono`}
          />
        </div>
      )}

      {type === "poll" && (
        <div className="rounded-xl border border-line p-3.5">
          <p className="font-mono text-[11px] text-grey">{t(locale, "form.pollOpts")}</p>
          <div className="mt-2.5 space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-center font-mono text-[11px] text-grey">
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
              className="mt-2.5 inline-flex items-center rounded-lg px-2 py-1 font-mono text-[11px] text-blue hover:bg-blue/10"
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
        <textarea
          id="post-body"
          name="body"
          rows={type === "text" ? 7 : 4}
          placeholder={t(locale, type === "text" ? "form.bodyText" : "form.bodyOpt")}
          className={`${inputCls} resize-y`}
        />
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-grey/70">
          <span>**粗体** `代码` # 标题 - 列表</span>
          <span>{t(locale, "form.mdSupport")}</span>
        </div>
      </div>

      <div className="space-y-2.5 pt-1">
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
        <p role="alert" className="text-xs text-red-400">{state.error}</p>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <span className="text-[11px] text-grey/80">{t(locale, "form.footerHint")}</span>
        <button
          type="submit"
          disabled={pending}
          className="ml-auto inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
        >
          {pending ? t(locale, "form.posting") : t(locale, "form.submit")}
        </button>
      </div>
    </form>
  );
}
