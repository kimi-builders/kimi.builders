"use client";

/* 评论区(客户端):两级楼中楼 —— 顶层评论 + 缩进回复层(更深的回复由服务端
   拍平进所属顶层,并带「回复 @xx」标注)。
   每条评论:VoteCluster 顶/踩(乐观)+ 回复;自己的评论可行内编辑、删除(confirm 后软删)。
   所有 mutation 走「等待态 → toast 反馈 → router.refresh() 换新数据」,操作必有回响。
   净分 ≤ -3 的评论淡化显示。锚点 id=comment-<id> 供消息通知精准定位。
   列表数据在服务端组装:正文 Markdown 已渲成 ReactNode 随 props 传入。
   分页:首屏 SSR 第一页(按顶层评论计);「加载更多」走 server action 拿回同样
   渲染好的后续页直接追加,游标 = 已加载最后一个顶层评论 id。mutation 刷新后
   已追加的页作废,回到首屏第一页(与刷新前全量重取的行为一致)。 */
import { useRef, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import { ArrowBigUp, ChevronDown, ChevronUp, X } from "lucide-react";
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
  /* 已被管理员屏蔽(仅作者本人视角会拿到 true;公开侧查询已滤) */
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
  /* admin/mod:评论行多一个「屏蔽」治理入口(action 层再鉴权) */
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
  /* 已追加的后续页;mutation 触发 router.refresh() 后首屏 props 换新,追加页作废 */
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
  const loggedIn = meId !== null;

  /* mutation 后 router.refresh() 会换来新的首屏 props:追加页作废,回到第一页
     (与刷新前全量重取的行为一致)。渲染期间比对前 props 重置,不走 effect。 */
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
        toast(t(locale, "toast.failed"));
        return;
      }
      setExtra((prev) => ({
        threads: [...(prev?.threads ?? []), ...res.threads],
        upIds: [...(prev?.upIds ?? []), ...res.upIds],
        downIds: [...(prev?.downIds ?? []), ...res.downIds],
      }));
      setCursor(res.nextCursor);
    } catch {
      toast(t(locale, "toast.failed"));
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

  /* 发评论/回复:成功 → toast + 清空 + 刷新出新高楼 */
  const submitComment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (posting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPosting(true);
    try {
      const res = await createCommentAction(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.commented"));
      setReplyTo(null);
      form.reset();
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setPosting(false);
    }
  };

  /* 行内编辑保存 */
  const saveEdit = async (e: React.FormEvent<HTMLFormElement>, id: number) => {
    e.preventDefault();
    if (busyId !== null) return;
    const fd = new FormData(e.currentTarget);
    setBusyId(id);
    try {
      const res = await updateCommentAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.saved"));
      setEditingId(null);
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setBusyId(null);
    }
  };

  /* 删除(confirm 后软删) */
  const remove = async (id: number) => {
    if (busyId !== null) return;
    if (!window.confirm(t(locale, "post.commentDeleteConfirm"))) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.set("comment_id", String(id));
      const res = await deleteCommentAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.deleted"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setBusyId(null);
    }
  };

  /* 治理屏蔽(admin/mod):填原因 → 落库 → 刷新(公开侧随即不可见) */
  const hideAsMod = async (id: number) => {
    if (busyId !== null) return;
    const reason = window.prompt(t(locale, "mod.hidePrompt"), "");
    if (reason === null) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.set("target_type", "comment");
      fd.set("target_id", String(id));
      fd.set("reason", reason);
      const res = await hideContentAction(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "mod.toastHidden"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setBusyId(null);
    }
  };

  const head = (c: CommentView) => (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-grey">
      <Avatar
        url={c.avatarUrl}
        handle={c.handle ?? c.author}
        size={20}
        square={c.isAi}
        className="h-5 w-5"
      />
      {c.handle ? (
        <Link
          href={`/u/${c.handle}`}
          className="text-paper transition-colors hover:text-blue"
        >
          {c.author}
        </Link>
      ) : (
        <span className="text-paper">{c.author}</span>
      )}
      {c.isAi && (
        <span className="rounded-md border border-blue px-1.5 py-px text-[9px] tracking-wider text-blue">
          AI
        </span>
      )}
      {c.hidden && (
        <span className="rounded-md border border-red-400/60 px-1.5 py-px text-[9px] tracking-wider text-red-400">
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
    return (
      <div className="mt-1.5 flex items-center gap-4 font-mono text-[11px] text-grey">
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
          <span
            className="inline-flex items-center gap-1"
            title={t(locale, "post.loginToUpvote")}
          >
            <ArrowBigUp size={13} />
            {c.score}
          </span>
        )}
        {loggedIn && (
          <button
            type="button"
            onClick={() => startReply(c.id, c.author)}
            className="transition-colors hover:text-blue"
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
              className="transition-colors hover:text-blue disabled:opacity-40"
            >
              {t(locale, "post.edit")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(c.id)}
              className="transition-colors hover:text-paper disabled:opacity-40"
            >
              {busy ? t(locale, "post.submitting") : t(locale, "post.delete")}
            </button>
          </>
        )}
        {/* 治理入口:admin/mod 可屏蔽未屏蔽的评论(屏蔽后仅作者可见,解除走 /admin) */}
        {moderator && !c.hidden && (
          <button
            type="button"
            disabled={busy}
            onClick={() => hideAsMod(c.id)}
            className="transition-colors hover:text-red-400 disabled:opacity-40"
          >
            {t(locale, "mod.hide")}
          </button>
        )}
      </div>
    );
  };

  const row = (c: CommentView, nested: boolean) => (
    <li
      key={c.id}
      id={`comment-${c.id}`}
      className={`scroll-mt-24 ${!nested ? "rounded-xl border border-line bg-bg/40 p-4" : ""} ${c.isAi && !nested ? "border-l-2 border-l-blue" : ""} ${
        c.score <= -3 ? "opacity-55" : ""
      }`}
      title={c.score <= -3 ? t(locale, "post.dimmed") : undefined}
    >
      {head(c)}
      {editingId === c.id ? (
        <form onSubmit={(e) => saveEdit(e, c.id)} className="mt-2 space-y-2">
          <input type="hidden" name="comment_id" value={c.id} />
          <textarea
            name="body"
            rows={3}
            required
            defaultValue={c.bodyMd}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-paper focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10"
          />
          <div className="flex gap-3 font-mono text-[11px]">
            <button
              type="submit"
              disabled={busyId === c.id}
              className="rounded-lg bg-blue px-3 py-1.5 font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 disabled:opacity-40"
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
        <div className="mt-2">{c.body}</div>
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
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[11px] text-blue transition-colors hover:bg-blue/10"
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
    <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 id="comments" className="font-mono text-sm font-semibold text-paper">
        {t(locale, "post.comments", { n: total })}
      </h2>
      <ul className="mt-5 space-y-3">{allThreads.map((c) => row(c, false))}</ul>

      {cursor !== null && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-6 rounded-lg border border-line px-4 py-2 font-mono text-xs text-grey transition-colors hover:border-blue hover:text-blue disabled:opacity-40"
        >
          {loadingMore
            ? t(locale, "post.submitting")
            : t(locale, "post.loadMore", { n: remaining })}
        </button>
      )}

      {loggedIn ? (
        <form ref={formRef} onSubmit={submitComment} className="mt-6 space-y-3 rounded-xl border border-line bg-bg/40 p-3 sm:p-4">
          <input type="hidden" name="post_id" value={postId} />
          {replyTo && (
            <>
              <input type="hidden" name="parent_id" value={replyTo.id} />
              <p className="flex items-center gap-2 font-mono text-[11px] text-grey">
                {t(locale, "post.replying", { name: replyTo.author })}
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label="取消回复 / Cancel reply"
                  className="flex size-7 items-center justify-center rounded-lg text-grey transition-colors hover:bg-card hover:text-paper"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </p>
            </>
          )}
          <textarea
            ref={taRef}
            name="body"
            rows={4}
            required
            placeholder={t(locale, "post.commentPh")}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10"
          />
          <button
            type="submit"
            disabled={posting}
            className="rounded-lg bg-blue px-5 py-2 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {posting ? t(locale, "post.submitting") : t(locale, "post.comment")}
          </button>
        </form>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-bg/40 p-4 text-sm text-grey">
          {t(locale, "post.loginToComment")}
          <a
            href="/api/auth/github"
            className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
          >
            GitHub
          </a>
          <a
            href="/api/auth/google"
            className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
          >
            Google
          </a>
        </p>
      )}
    </section>
  );
}
