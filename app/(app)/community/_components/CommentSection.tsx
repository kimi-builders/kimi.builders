"use client";

/* Comment section (client): two-level threading — top-level comments +
   an indented reply layer (deeper replies are flattened server-side
   into their top-level root, carrying a "replying @x" label). Each
   comment: VoteCluster votes (optimistic) + reply; one's own comments
   allow inline edit and delete (confirm, then soft). Every mutation
   goes pending -> toast -> router.refresh() for fresh data — every
   action answers. Comments at net score <= -3 render dimmed. Anchor
   ids comment-<id> give notifications precise targets. List data is
   assembled server-side: bodies arrive as pre-rendered ReactNode
   props. Paging: the first page renders SSR (counted by top-level
   comments); "load more" fetches identically rendered later pages via
   a server action, cursor = the last loaded top-level comment id. After
   a mutation refresh, appended pages are dropped back to the first
   page (same behavior as the pre-refresh full refetch). */
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import MarkdownEditor from "@/app/(app)/_components/MarkdownEditor";
import {
  SummonPendingRow,
  useSummonPending,
  type SummonTarget,
} from "@/app/(app)/_components/summon-pending";
import { useRouter } from "next/navigation";
import { ArrowBigUp, ChevronDown, ChevronUp, X } from "lucide-react";
import FeedbackButton from "@/app/(app)/_components/FeedbackButton";
import { useConfirm, usePrompt } from "@/components/useConfirm";
import { visibleReplyCount } from "@/src/lib/community-draft";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import VoteCluster from "./VoteCluster";
import {
  createCommentAction,
  deleteCommentAction,
  loadMoreCommentsAction,
  updateCommentAction,
} from "../actions";
import { hideContentAction } from "../../admin/actions";

export interface CommentView {
  id: number;
  authorId: number | null;
  isAi: boolean;
  author: string;
  handle: string | null;
  avatarUrl: string;
  time: string;
  edited: boolean;
  /* Hidden by a moderator (only the author's own view sees true;
     public queries already filter it). */
  hidden: boolean;
  score: number;
  replyToAuthor: string | null;
  bodyMd: string;
  body: React.ReactNode;
}

export interface CommentThread extends CommentView {
  replies: CommentView[];
}

export default function CommentSection({
  postId,
  locale,
  meId,
  moderator = false,
  total,
  threads,
  nextCursor,
  upIds,
  downIds,
}: {
  postId: number;
  locale: Locale;
  meId: number | null;
  /* admin/mod: the comment row gains a "hide" moderation entry (the
     action layer re-authenticates). */
  moderator?: boolean;
  total: number;
  threads: CommentThread[];
  nextCursor: number | null;
  upIds: number[];
  downIds: number[];
}) {
  const [replyTo, setReplyTo] = useState<{ id: number; author: string } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<number>>(new Set());
  /* Later pages already appended; after a mutation's router.refresh()
     the first-page props change and the appended pages are dropped. */
  const [extra, setExtra] = useState<{
    threads: CommentThread[];
    upIds: number[];
    downIds: number[];
  } | null>(null);
  const [cursor, setCursor] = useState(nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { confirm, node } = useConfirm(locale);
  const { prompt, node: promptNode } = usePrompt(locale);
  const loggedIn = meId !== null;
  /* @kimi summon wait feedback: on success a placeholder row +
     polling auto-refreshes when the reply lands. */
  const [summon, setSummon] = useState<SummonTarget | null>(null);
  const settleSummon = useCallback(() => setSummon(null), []);
  useSummonPending({ target: summon, locale, onSettle: settleSummon });

  /* After a mutation, router.refresh() brings fresh first-page props:
     appended pages drop, back to page one (same as the pre-refresh full
     refetch). Reset by comparing previous props during render — never
     in an effect. */
  const [prevThreads, setPrevThreads] = useState(threads);
  if (prevThreads !== threads) {
    setPrevThreads(threads);
    setExtra(null);
    setCursor(nextCursor);
  }

  const allThreads = extra ? [...threads, ...extra.threads] : threads;
  const up = new Set([...upIds, ...(extra?.upIds ?? [])]);
  const down = new Set([...downIds, ...(extra?.downIds ?? [])]);
  const loaded = allThreads.reduce((n, c) => n + 1 + c.replies.length, 0);
  const remaining = Math.max(0, total - loaded);

  const loadMore = async () => {
    if (loadingMore || cursor === null) return;
    setLoadingMore(true);
    try {
      const res = await loadMoreCommentsAction(postId, cursor);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      setExtra((prev) => ({
        threads: [...(prev?.threads ?? []), ...res.threads],
        upIds: [...(prev?.upIds ?? []), ...res.upIds],
        downIds: [...(prev?.downIds ?? []), ...res.downIds],
      }));
      setCursor(res.nextCursor);
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const startReply = (id: number, author: string) => {
    setReplyTo({ id, author });
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      taRef.current?.focus({ preventScroll: true });
    });
  };

  /* Post comment/reply: success -> toast + clear + refresh out the new
     floor. */
  const submitComment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (posting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPosting(true);
    try {
      const res = await createCommentAction(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.commented"));
      /* @kimi summon outcome: the comment publishes either way;
         whether the summon took is a separate notice. */
      if (res.aiNote === "summoned") {
        toast(t(locale, "post.aiSummoned"));
        if (res.commentId) setSummon({ commentId: res.commentId });
      } else if (res.aiNote === "aiDisabled") toast(t(locale, "post.aiSummonDisabled"));
      else if (res.aiNote === "rate") toast(t(locale, "post.aiSummonRate"));
      setReplyTo(null);
      form.reset();
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setPosting(false);
    }
  };

  /* Inline edit save. */
  const saveEdit = async (e: React.FormEvent<HTMLFormElement>, id: number) => {
    e.preventDefault();
    if (busyId !== null) return;
    const fd = new FormData(e.currentTarget);
    setBusyId(id);
    try {
      const res = await updateCommentAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.saved"));
      setEditingId(null);
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  /* Delete (confirm, then soft). */
  const remove = async (id: number) => {
    if (busyId !== null) return;
    if (!(await confirm({ body: t(locale, "post.commentDeleteConfirm")}))) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.set("comment_id", String(id));
      const res = await deleteCommentAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.deleted"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  /* Moderation hide (admin/mod): fill a reason -> write -> refresh
     (the public side drops it immediately). */
  const hideAsMod = async (id: number) => {
    if (busyId !== null) return;
    const reason = await prompt({
      title: t(locale, "mod.hidePromptTitle"),
      label: t(locale, "mod.hidePromptLabel"),
      placeholder: t(locale, "mod.hidePrompt"),
      required: true,
      maxLength: 280,
    });
    if (reason === null || reason.trim().length === 0) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.set("target_type", "comment");
      fd.set("target_id", String(id));
      fd.set("reason", reason);
      const res = await hideContentAction(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "mod.toastHidden"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const head = (c: CommentView) => (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-grey">
      <Avatar
        url={c.avatarUrl}
        handle={c.handle ?? c.author}
        size={20}
        className="h-5 w-5"
      />
      {c.handle ? (
        <Link
          href={`/u/${c.handle}`}
          className="text-paper transition-colors hover:text-ui-blue"
        >
          {c.author}
        </Link>
      ) : (
        <span className="text-paper">{c.author}</span>
      )}
      {c.isAi && (
        <span className="rounded-md border border-blue px-1.5 py-px text-xs tracking-wider text-blue">
          AI
        </span>
      )}
      {c.hidden && (
        <span className="rounded-md border border-status-danger/60 px-1.5 py-px text-xs tracking-wider text-status-danger-fg">
          {t(locale, "mod.hiddenBadge")}
        </span>
      )}
      {c.replyToAuthor && (
        <span>{t(locale, "post.replyTo", { name: c.replyToAuthor })}</span>
      )}
      <span>{c.time}</span>
      {c.edited && <span>({t(locale, "post.edited")})</span>}
    </div>
  );

  const actions = (c: CommentView) => {
    const mine = meId !== null && c.authorId === meId;
    const busy = busyId === c.id;
    /* Text actions idle at grey/60 and settle to grey when the row is
       hovered (the li carries group) — the vote cluster keeps its
       steady grey: votes are primary affordances, not chrome. */
    const idle = "text-grey/60 transition-colors group-hover:text-grey";
    return (
      <div className="mt-1.5 flex items-center gap-4 font-mono text-xs">
        {loggedIn ? (
          <VoteCluster
            target="comment"
            id={c.id}
            score={c.score}
            up={up.has(c.id)}
            down={down.has(c.id)}
            locale={locale}
            size={13}
          />
        ) : (
          /* Same signed-out gate fix as the post vote cluster: carries
             the visitor to login and back, not a hint-only span. */
          <Link
            href={`/login?next=${encodeURIComponent(`/community/${postId}#comment-${c.id}`)}`}
            data-tip={t(locale, "post.loginToUpvote")}
            aria-label={t(locale, "post.loginToUpvote")}
            className="inline-flex items-center gap-1 rounded px-1 text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <ArrowBigUp size={13} aria-hidden="true" />
            {c.score}
          </Link>
        )}
        {loggedIn && (
          <button
            type="button"
            onClick={() => startReply(c.id, c.author)}
            className={`${idle} hover:text-ui-blue`}
          >
            {t(locale, "post.reply")}
          </button>
        )}
        {mine && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditingId(editingId === c.id ? null : c.id)}
              className={`${idle} hover:text-ui-blue disabled:opacity-40`}
            >
              {t(locale, "post.edit")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(c.id)}
              className={`${idle} hover:text-paper disabled:opacity-40`}
            >
              {busy ? t(locale, "post.submitting") : t(locale, "post.delete")}
            </button>
          </>
        )}
        {/* Moderation entry: admin/mod can hide un-hidden comments (hidden ones stay visible to their author only; unhiding happens in /admin) */}
        {moderator && !c.hidden && (
          <button
            type="button"
            disabled={busy}
            onClick={() => hideAsMod(c.id)}
            className={`${idle} hover:text-status-danger-fg disabled:opacity-40`}
          >
            {t(locale, "mod.hide")}
          </button>
        )}
        {/* Report entry (members): flagging your own comment is noise,
            so own rows stay clean. */}
        {!mine && (
          <FeedbackButton
            locale={locale}
            targetType="comment"
            targetId={c.id}
            compact
            loggedIn={loggedIn}
            returnTo={`/community/${postId}#comment-${c.id}`}
          />
        )}
      </div>
    );
  };

  const row = (c: CommentView, nested: boolean) => (
    <li
      key={c.id}
      id={`comment-${c.id}`}
      className={`group scroll-mt-24 ${!nested ? "py-4" : ""} ${
        c.score <= -3 ? "opacity-55" : ""
      }`}
      title={c.score <= -3 ? t(locale, "post.dimmed") : undefined}
    >
      {head(c)}
      {editingId === c.id ? (
        <form onSubmit={(e) => saveEdit(e, c.id)} className="mt-2 space-y-2">
          <input type="hidden" name="comment_id" value={c.id} />
          <MarkdownEditor
            name="body"
            locale={locale}
            rows={3}
            required
            defaultValue={c.bodyMd}
            inputCls="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-paper focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10"
          />
          <div className="flex gap-3 font-mono text-xs">
            <button
              type="submit"
              disabled={busyId === c.id}
 className="rounded-lg bg-blue px-3 py-1.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busyId === c.id
                ? t(locale, "post.submitting")
                : t(locale, "post.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-grey transition-colors hover:text-paper"
            >
              {t(locale, "post.cancel")}
            </button>
          </div>
        </form>
      ) : (
        /* AI comments get a light blue wash: distinguishable at a
           glance, restrained enough not to steal the show. */
        <div
          className={`mt-2 ${c.isAi ? "rounded-lg border border-blue/15 bg-blue/[0.04] px-3 py-2" : ""}`}
        >
          {c.body}
        </div>
      )}
      {actions(c)}
      {nested === false && (c as CommentThread).replies?.length > 0 && (() => {
        const replies = (c as CommentThread).replies;
        const expanded = expandedThreads.has(c.id);
        const visible = visibleReplyCount(replies.length, expanded);
        const hidden = replies.length - visible;
        return (
          <div className="ml-2 mt-4 border-l border-line pl-4">
            <ul className="space-y-4">{replies.slice(0, visible).map((reply) => row(reply, true))}</ul>
            {replies.length > 3 && (
              <button
                type="button"
                onClick={() => {
                  setExpandedThreads((current) => {
                    const next = new Set(current);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    return next;
                  });
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ui-blue transition-colors hover:bg-ui-blue/10"
              >
                {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                {expanded
                  ? t(locale, "post.hideReplies")
                  : t(locale, "post.showReplies", { n: hidden })}
              </button>
            )}
          </div>
        );
      })()}
    </li>
  );

  return (
    <>
    <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5">
      {/* Section title in the site's quiet mono eyebrow grammar; the
          #comments anchor (post action bar / notifications) stays. */}
      <h2
        id="comments"
        className="font-mono text-xs font-medium tracking-[0.08em] text-grey"
      >
        {t(locale, "post.comments", { n: total })}
      </h2>

      {/* Composer above the list: reply flows scroll up to it, and the
          entry point reads before the thread, not after it. */}
      {loggedIn ? (
        <form ref={formRef} onSubmit={submitComment} className="mt-3 space-y-3">
          <input type="hidden" name="post_id" value={postId} />
          {replyTo && (
            <>
              <input type="hidden" name="parent_id" value={replyTo.id} />
              <p className="flex items-center gap-2 font-mono text-xs text-grey">
                {t(locale, "post.replying", { name: replyTo.author })}
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label={t(locale, "post.cancel")}
                  className="flex size-7 items-center justify-center rounded-lg text-grey transition-colors hover:bg-card hover:text-paper"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </p>
            </>
          )}
          <MarkdownEditor
            textareaRef={taRef}
            name="body"
            locale={locale}
            rows={4}
            required
            mentionKimi
            placeholder={t(locale, "post.commentPh")}
            inputCls="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10"
          />
          <button
            type="submit"
            disabled={posting}
            className="rounded-lg bg-blue px-5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {posting ? t(locale, "post.submitting") : t(locale, "post.comment")}
          </button>
        </form>
      ) : (
        /* Signed out: the single login entry (a modal with return
           redirect), the site-wide pattern — no bare OAuth links (the
           login page itself carries every auth method). */
        <p className="mt-3 text-sm text-grey">
          {t(locale, "post.loginToComment")}
          <Link
            href={`/login?next=${encodeURIComponent(`/community/${postId}#comments`)}`}
            className="ml-2 text-paper underline decoration-ui-blue/60 underline-offset-4 hover:text-ui-blue"
          >
            {t(locale, "auth.login")}
          </Link>
        </p>
      )}

      {/* Comment rows drop the rounded box: hairline dividers let them merge into the parent card (nested rounded boxes read as clutter) */}
      <ul className="mt-4 divide-y divide-line border-t border-line">{allThreads.map((c) => row(c, false))}</ul>

      {/* Summon-wait placeholder: cleared automatically when the poller refreshes on AI-reply arrival */}
      {summon !== null && <SummonPendingRow locale={locale} />}

      {cursor !== null && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-6 rounded-lg border border-line px-4 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue disabled:opacity-40"
        >
          {loadingMore
            ? t(locale, "post.submitting")
            : t(locale, "post.loadMore", { n: remaining })}
        </button>
      )}
    </section>
    {node}
    {promptNode}
    </>
  );
}
