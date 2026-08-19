/* AI 召唤卡位(docs/shell-and-ai-native.md C 节,L1 召唤):
   帖子详情右栏的预留组件,AI-Native 暂不开工 —— 默认不渲染。
   开工时:把 AI_SUMMON_ENABLED 置 true,接通召唤 action(右栏是唯一入口),
   并在 C 节定义的 Agent 护照/配额语义内实现。 */
import { Sparkles } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import Widget from "./Widget";

const AI_SUMMON_ENABLED = false;

export default function AiSummonSlot({
  postId,
  locale,
}: {
  postId: number;
  locale: Locale;
}) {
  if (!AI_SUMMON_ENABLED) return null;
  return (
    <Widget title={t(locale, "rail.aiSummon")}>
      <p className="text-xs leading-relaxed text-grey">
        {t(locale, "rail.aiSummonHint")}
      </p>
      <button
        type="button"
        data-post-id={postId}
        className="mt-3 flex w-full items-center justify-center gap-2 border border-ui-blue py-2 text-xs text-ui-blue transition-colors hover:bg-blue hover:text-bg"
      >
        <Sparkles size={13} />
        {t(locale, "rail.aiSummon")}
      </button>
    </Widget>
  );
}
