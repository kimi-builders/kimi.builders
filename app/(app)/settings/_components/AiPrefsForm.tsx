"use client";

/* AI 回复偏好开关(设置页):点按即切换 —— 乐观翻转,落库成功 toast,
   失败回退并 toast。语义见 schema(v2 决策 3):
   aiMine = 允许 AI 回我的帖/评论;aiShow = 浏览时显示 AI 回复。 */
import { useState } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { updateAiPrefsAction } from "../actions";

function Switch({
  on,
  label,
  onFlip,
}: {
  on: boolean;
  label: string;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onFlip}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="text-sm text-paper">{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 border transition-colors ${
          on ? "border-blue bg-blue" : "border-line bg-transparent"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 transition-all ${
            on ? "left-[18px] bg-bg" : "left-0.5 bg-grey"
          }`}
        />
      </span>
    </button>
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
      toast(t(locale, "toast.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 divide-y divide-line">
      <Switch
        on={mine}
        label={t(locale, "set.aiMine")}
        onFlip={() => flip("mine")}
      />
      <Switch
        on={show}
        label={t(locale, "set.aiShow")}
        onFlip={() => flip("show")}
      />
    </div>
  );
}
