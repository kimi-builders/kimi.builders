"use client";

/* 发帖表单:类型切换(文字/链接/投票)驱动字段显隐;投票选项 2–8 条动态增删。
   提交走 server action(createPostAction),校验错误就地显示。 */
import { useActionState, useState } from "react";
import { createPostAction, type PostFormState } from "../actions";
import { CATEGORIES } from "@/src/lib/categories";
import { t, type Locale } from "@/src/lib/i18n";

const TYPES = [
  { id: "text", key: "form.text" },
  { id: "link", key: "form.link" },
  { id: "poll", key: "form.poll" },
] as const;

const inputCls =
  "w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";

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
    <form action={formAction} className="mt-6 space-y-5">
      <div className="flex gap-2 font-mono text-xs">
        {TYPES.map((tp) => (
          <label
            key={tp.id}
            className={`cursor-pointer border px-3 py-1.5 ${
              type === tp.id
                ? "border-blue text-blue"
                : "border-line text-grey hover:text-paper"
            }`}
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

      <div className="flex gap-3">
        <select name="category" className={`${inputCls} w-36 font-mono text-xs`} defaultValue="chat">
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id} className="bg-bg">
              {locale === "zh" ? c.zh : c.en}
            </option>
          ))}
        </select>
        <input
          name="title"
          placeholder={t(locale, "form.title")}
          maxLength={200}
          className={inputCls}
        />
      </div>

      {type === "link" && (
        <input
          name="link_url"
          type="url"
          placeholder="https://…"
          className={`${inputCls} font-mono`}
        />
      )}

      {type === "poll" && (
        <div className="space-y-2 border border-line p-4">
          <p className="font-mono text-[11px] text-grey">{t(locale, "form.pollOpts")}</p>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 font-mono text-[11px] text-grey">{i + 1}</span>
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
                  className="font-mono text-xs text-grey hover:text-paper"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button
              type="button"
              onClick={() => setOptions([...options, ""])}
              className="font-mono text-xs text-blue hover:underline"
            >
              {t(locale, "form.addOpt")}
            </button>
          )}
        </div>
      )}

      <textarea
        name="body"
        rows={type === "text" ? 8 : 4}
        placeholder={t(locale, type === "text" ? "form.bodyText" : "form.bodyOpt")}
        className={inputCls}
      />

      <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-grey">
        <input
          type="checkbox"
          name="ai_reply"
          defaultChecked={aiDefault}
          className="accent-blue"
        />
        {t(locale, "form.aiReply")}
      </label>

      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="border border-blue px-6 py-2 font-mono text-sm text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
      >
        {pending ? t(locale, "form.posting") : t(locale, "form.submit")}
      </button>
    </form>
  );
}
