"use client";

/* AI reply preference switches (the settings "preferences" tab): tap
   to toggle — optimistic flip, toast on save, rollback + toast on
   failure. Semantics: aiMine = allow AI to reply to my posts/comments;
   aiShow = show AI replies while browsing. Row layout matches
   UsagePrivacyForm: title + description left, rounded iOS switch
   right. */
import { useState } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { updateAiPrefsAction } from "../actions";
import Switch from "./Switch";

function PrefRow({
  title,
  hint,
  on,
  onFlip,
}: {
  title: string;
  hint: string;
  on: boolean;
  onFlip: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-paper">{title}</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-grey">{hint}</p>
      </div>
      <Switch on={on} label={title} onFlip={onFlip} />
    </div>
  );
}

export default function AiPrefsForm({
  aiMine,
  aiShow,
  locale,
}: {
  aiMine: boolean;
  aiShow: boolean;
  locale: Locale;
}) {
  const [mine, setMine] = useState(aiMine);
  const [show, setShow] = useState(aiShow);
  const [busy, setBusy] = useState(false);

  const flip = async (which: "mine" | "show") => {
    if (busy) return;
    const nextMine = which === "mine" ? !mine : mine;
    const nextShow = which === "show" ? !show : show;
    setMine(nextMine);
    setShow(nextShow);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("ai_mine", nextMine ? "1" : "0");
      fd.set("ai_show", nextShow ? "1" : "0");
      const res = await updateAiPrefsAction(fd);
      if (!res.ok) throw new Error("failed");
      toast(t(locale, "set.saved"));
    } catch {
      setMine(mine);
      setShow(show);
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="divide-y divide-line">
      <PrefRow
        title={t(locale, "set.aiMine")}
        hint={t(locale, "set.aiMineHint")}
        on={mine}
        onFlip={() => flip("mine")}
      />
      <PrefRow
        title={t(locale, "set.aiShow")}
        hint={t(locale, "set.aiShowHint")}
        on={show}
        onFlip={() => flip("show")}
      />
    </div>
  );
}
