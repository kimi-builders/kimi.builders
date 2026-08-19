"use client";

/* AI 回复偏好开关(设置页「偏好」页签):点按即切换 —— 乐观翻转,落库成功 toast,
   失败回退并 toast。语义见 schema(v2 决策 3):
   aiMine = 允许 AI 回我的帖/评论;aiShow = 浏览时显示 AI 回复。
   行式版式与 UsagePrivacyForm 一致:左 标题+说明,右 iOS 圆角开关。 */
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
      aria-label={label}
      onClick={onFlip}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
        on ? "bg-blue" : "bg-paper/15"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

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
