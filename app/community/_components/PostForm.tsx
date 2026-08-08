"use client";

/* 发帖表单:类型切换(文字/链接/投票)驱动字段显隐;投票选项 2–8 条动态增删。
   提交走 server action(createPostAction),校验错误就地显示。 */
import { useActionState, useState } from "react";
import { createPostAction, type PostFormState } from "../actions";
import { CATEGORIES } from "@/src/lib/categories";

const TYPES = [
  { id: "text", zh: "文字" },
  { id: "link", zh: "链接" },
  { id: "poll", zh: "投票" },
] as const;

const inputCls =
  "w-full border border-moon bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";

export default function PostForm({ aiDefault }: { aiDefault: boolean }) {
  const [type, setType] = useState<string>("text");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [state, formAction, pending] = useActionState<
    PostFormState | null,
    FormData
  >(createPostAction, null);

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div className="flex gap-2 font-mono text-xs">
        {TYPES.map((t) => (
          <label
            key={t.id}
            className={`cursor-pointer border px-3 py-1.5 ${
              type === t.id
                ? "border-blue text-blue"
                : "border-moon text-grey hover:text-paper"
            }`}
          >
            <input
              type="radio"
              name="type"
              value={t.id}
              checked={type === t.id}
              onChange={() => setType(t.id)}
              className="sr-only"
            />
            {t.zh}
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <select name="category" className={`${inputCls} w-36 font-mono text-xs`} defaultValue="chat">
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id} className="bg-bg">
              {c.zh}
            </option>
          ))}
        </select>
        <input
          name="title"
          placeholder="标题"
          maxLength={200}
          className={inputCls}
          required
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
        <div className="space-y-2 border border-moon p-4">
          <p className="font-mono text-[11px] text-grey">投票选项(2–8 个)</p>
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
              + 添加选项
            </button>
          )}
        </div>
      )}

      <textarea
        name="body"
        rows={type === "text" ? 8 : 4}
        placeholder={
          type === "text"
            ? "正文(支持 Markdown)"
            : "补充说明(可选,支持 Markdown)"
        }
        className={inputCls}
      />

      <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-grey">
        <input
          type="checkbox"
          name="ai_reply"
          defaultChecked={aiDefault}
          className="accent-blue"
        />
        允许 Kimi 小筑(AI)回复本帖
      </label>

      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="border border-blue px-6 py-2 font-mono text-sm text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
      >
        {pending ? "发布中…" : "发布"}
      </button>
    </form>
  );
}
