"use client";

/* Post owner self-service actions: edit (a standalone page) / solved
   toggle / public<->private / delete (confirm, then soft). Rendered for
   the author only (server-decided); moderation can also toggle
   solved. Chain: pending -> toast -> router.refresh() after
   visibility/solved toggles; delete toasts + returns to the feed. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { useConfirm } from "@/components/useConfirm";
import { deletePostAction, setPostSolvedAction, setPostVisibilityAction } from "../actions";

export default function PostOwnerActions({
  postId,
  visibility,
  solved = false,
  locale,
}: {
  postId: number;
  visibility: string;
  solved?: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"vis" | "del" | "solved" | null>(null);
  const { confirm, node } = useConfirm(locale);

  const toggleSolved = async () => {
    if (busy) return;
    setBusy("solved");
    try {
      const fd = new FormData();
      fd.set("post_id", String(postId));
      fd.set("solved", solved ? "0" : "1");
      const res = await setPostSolvedAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, solved ? "post.unsolvedToast" : "post.solvedToast"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const toggleVisibility = async () => {
    if (busy) return;
    const next = visibility === "private" ? "public" : "private";
    setBusy("vis");
    try {
      const fd = new FormData();
      fd.set("post_id", String(postId));
      fd.set("visibility", next);
      const res = await setPostVisibilityAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      toast(
        t(locale, next === "private" ? "toast.privateOn" : "toast.privateOff"),
      );
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (busy) return;
    if (!(await confirm({ body: t(locale, "post.deleteConfirm"), danger: true }))) return;
    setBusy("del");
    try {
      const fd = new FormData();
      fd.set("post_id", String(postId));
      const res = await deletePostAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        setBusy(null);
        return;
      }
      toast(t(locale, "toast.deleted"));
      router.push("/community");
    } catch {
      toast(t(locale, "toast.failed"), "error");
      setBusy(null);
    }
  };

  const btn =
    "inline-flex items-center font-mono text-xs text-grey transition-colors hover:text-ui-blue disabled:opacity-40";
  return (
    <>
    <span className="inline-flex items-center gap-4">
      <Link href={`/community/${postId}/edit`} className={btn}>
        {t(locale, "post.edit")}
      </Link>
      <button
        type="button"
        onClick={toggleSolved}
        disabled={busy !== null}
        className={btn}
      >
        {busy === "solved"
          ? t(locale, "post.submitting")
          : t(locale, solved ? "post.unmarkSolved" : "post.markSolved")}
      </button>
      <button
        type="button"
        onClick={toggleVisibility}
        disabled={busy !== null}
        className={btn}
      >
        {busy === "vis"
          ? t(locale, "post.submitting")
          : t(
              locale,
              visibility === "private" ? "post.makePublic" : "post.makePrivate",
            )}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy !== null}
        className={`${btn} hover:text-paper`}
      >
        {busy === "del" ? t(locale, "post.submitting") : t(locale, "post.delete")}
      </button>
    </span>
    {node}
    </>
  );
}
