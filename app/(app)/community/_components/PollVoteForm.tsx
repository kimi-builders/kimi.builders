"use client";

/* 投票表单:提交 → 等待态 → toast 反馈 → refresh 换出结果条。 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { votePollAction } from "../actions";

export default function PollVoteForm({
  postId,
  options,
  locale,
}: {
  postId: number;
  options: { id: number; label: string }[];
  locale: Locale;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    if (!fd.get("option_id")) return;
    setPending(true);
    try {
      const res = await votePollAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.voted"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input type="hidden" name="post_id" value={postId} />
      {options.map((o) => (
        <label
          key={o.id}
          className="flex cursor-pointer items-center gap-3 text-sm text-paper"
        >
          <input
            type="radio"
            name="option_id"
            value={o.id}
            className="accent-blue"
            required
          />
          {o.label}
        </label>
      ))}
      <button
        type="submit"
        disabled={pending}
 className="rounded-lg bg-blue px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? t(locale, "post.submitting") : t(locale, "post.vote")}
      </button>
    </form>
  );
}
