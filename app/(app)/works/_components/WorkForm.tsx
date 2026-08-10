"use client";

/* 作品提交/编辑共用表单:名称必填,链接/仓库至少其一,至少标一个参与的
   Agent(服务端校验)。Agent 芯片是原生 checkbox(has-checked 着色),无 JS 可提交。
   保存成功由 action redirect 回 /works(自己的作品)或 /awesome(推荐的站外项目)。
   构建投入声明(声明制,20260822_work_claims):可选紧凑数字(612M 这类),
   服务端按「剩余可声明额度 = 可验证总量 − 其他作品已声明」校验;
   作者无用量数据时字段禁用并引导去 /usage 同步(想戴徽章,先接数据);
   有项目分布数据(upload_project 开且有 label)且名字匹配时给建议预填值,
   可改可无视(作者清空保存后再次编辑会再次预填建议值——值来自其本人
   项目数据、服务端校验兜底,可接受)。 */
import Link from "next/link";
import { useActionState } from "react";
import { AGENTS } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import AgentIcon from "@/components/AgentIcon";
import type { WorkFormState } from "../actions";

const inputCls =
  "w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";

export default function WorkForm({
  action,
  locale,
  workId,
  initial,
  claim,
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
  };
  /* 声明制上下文:空 = 不渲染声明字段( awesome 推荐等同理,服务端也会强制 null) */
  claim?: {
    initial: number | null;
    hasUsage: boolean;
    remaining: number;
    suggested: { label: string; tokens: number } | null;
  };
}) {
  const [state, formAction, pending] = useActionState<WorkFormState | null, FormData>(
    action,
    null,
  );
  const checkedAgents = new Set(
    initial ? initial.agents : ["kimi"], // 新表单默认勾 Kimi
  );
  /* 声明预填:已有声明回填声明值;否则有建议值时预填建议(纯省事,可改可无视) */
  const claimDefault =
    claim?.initial != null
      ? String(claim.initial)
      : claim?.suggested
        ? String(claim.suggested.tokens)
        : undefined;

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {workId && <input type="hidden" name="work_id" value={workId} />}
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.name")} *
        </span>
        <input
          name="name"
          defaultValue={initial?.name}
          maxLength={120}
          required
          className={`${inputCls} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.tagline")}
        </span>
        <textarea
          name="tagline"
          rows={2}
          defaultValue={initial?.tagline}
          maxLength={300}
          className={`${inputCls} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.url")}
        </span>
        <input
          name="url"
          type="url"
          defaultValue={initial?.url}
          placeholder="https://…"
          maxLength={500}
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.repoUrl")}
        </span>
        <input
          name="repo_url"
          type="url"
          defaultValue={initial?.repoUrl}
          placeholder="https://github.com/…"
          maxLength={500}
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.shot")}
        </span>
        <input
          name="screenshot_url"
          type="url"
          defaultValue={initial?.screenshotUrl}
          placeholder="https://…"
          maxLength={500}
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.tags")}
        </span>
        <input
          name="tags"
          defaultValue={initial?.tags.join(", ")}
          placeholder="kimi, web, tool"
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <fieldset>
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.agents")}
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {AGENTS.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-1.5 border border-line px-2.5 py-1.5 font-mono text-xs text-grey transition-colors hover:border-paper/30 has-checked:border-blue has-checked:text-blue"
            >
              <input
                type="checkbox"
                name="agents"
                value={a.id}
                defaultChecked={checkedAgents.has(a.id)}
                className="sr-only"
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
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.authorLabel")}
        </span>
        <input
          name="author_label"
          defaultValue={initial?.authorLabel}
          maxLength={120}
          placeholder={t(locale, "works.authorLabelPh")}
          className={`${inputCls} mt-1.5`}
        />
        <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
          {t(locale, "works.authorLabelHint")}
        </span>
      </label>
      {claim && (
        <label className="block">
          <span className="font-mono text-[11px] text-grey">
            {t(locale, "works.claim")}
          </span>
          <input
            name="claimed_tokens"
            defaultValue={claimDefault}
            placeholder={t(locale, "works.claimPh")}
            maxLength={24}
            disabled={!claim.hasUsage}
            className={`${inputCls} mt-1.5 font-mono disabled:opacity-40`}
          />
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
        </label>
      )}
      <p className="text-[11px] leading-relaxed text-grey/80">
        {t(locale, "works.hint")}
      </p>
      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="border border-blue px-6 py-2 font-mono text-sm text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
        >
          {pending ? t(locale, "set.saving") : t(locale, "set.save")}
        </button>
        <Link
          href="/works"
          className="font-mono text-xs text-grey transition-colors hover:text-paper"
        >
          {t(locale, "post.cancel")}
        </Link>
      </div>
    </form>
  );
}
