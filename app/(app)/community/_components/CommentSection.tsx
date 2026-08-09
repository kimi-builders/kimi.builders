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
import { useRouter } from "next/navigation";
import { ArrowBigUp } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import VoteCluster from "./VoteCluster";
import {
  createCommentAction,
  deleteCommentAction,
  loadMoreCommentsAction,
  updateCommentAction,
} from "../actions";

export interface CommentView {
  id: number;
  authorId: number | null;
  isAi: boolean;
  author: string;
  handle: string | null;
  avatarUrl: string;
  time: string;
  edited: boolean;
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
  total,
  threads,
  nextCursor,
  upIds,
  downIds,
}: {
  postId: number;
  locale: Locale;
  meId: number | null;
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

  const head = (c: CommentView) => (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-grey">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={c.avatarUrl}
        alt=""
        className={`h-5 w-5 ${c.isAi ? "rounded" : "rounded-full"}`}
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
        <span className="border border-blue px-1 py-px text-[9px] tracking-wider text-blue">
          AI
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
              className="transition-colors hover:text-red-400 disabled:opacity-40"
            >
              {busy ? t(locale, "post.submitting") : t(locale, "post.delete")}
            </button>
          </>
        )}
      </div>
    );
  };

  const row = (c: CommentView, nested: boolean) => (
    <li
      key={c.id}
      id={`comment-${c.id}`}
      className={`scroll-mt-24 ${c.isAi && !nested ? "border-l-2 border-blue pl-4" : ""} ${
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
            className="w-full border border-line bg-transparent px-3 py-2 text-sm text-paper focus:border-blue focus:outline-none"
          />
          <div className="flex gap-3 font-mono text-[11px]">
            <button
              type="submit"
              disabled={busyId === c.id}
              className="border border-blue px-3 py-1 text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
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
      {nested === false && (c as CommentThread).replies?.length > 0 && (
        <ul className="ml-2 mt-4 space-y-4 border-l border-line pl-4">
          {(c as CommentThread).replies.map((r) => row(r, true))}
        </ul>
      )}
    </li>
  );

  return (
    <section>
      <h2 id="comments" className="mt-10 font-mono text-sm text-grey">
        {t(locale, "post.comments", { n: total })}
      </h2>
      <ul className="mt-6 space-y-6">{allThreads.map((c) => row(c, false))}</ul>

      {cursor !== null && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-8 border border-line px-5 py-1.5 font-mono text-xs text-grey transition-colors hover:border-blue hover:text-blue disabled:opacity-40"
        >
          {loadingMore
            ? t(locale, "post.submitting")
            : t(locale, "post.loadMore", { n: remaining })}
        </button>
      )}

      {loggedIn ? (
        <form ref={formRef} onSubmit={submitComment} className="mt-10 space-y-3">
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
                  className="text-grey transition-colors hover:text-paper"
                >
                  ×
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
            className="w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none"
          />
          <button
            type="submit"
            disabled={posting}
            className="border border-blue px-5 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
          >
            {posting ? t(locale, "post.submitting") : t(locale, "post.comment")}
          </button>
        </form>
      ) : (
        <p className="mt-10 border-t border-line pt-6 text-sm text-grey">
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
