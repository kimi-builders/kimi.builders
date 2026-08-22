/* AI summon slot: a reserved component on the post detail rail; the
   AI-Native work hasn't started — renders nothing by default. When it
   does: set AI_SUMMON_ENABLED true, wire the summon action (the rail
   is the only entry), and implement within the agent-passport/quota
   semantics. */
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
