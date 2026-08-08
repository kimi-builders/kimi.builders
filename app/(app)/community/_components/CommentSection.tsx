"use client";

/* 评论区(客户端):两级楼中楼 —— 顶层评论 + 缩进回复层(更深的回复由服务端
   拍平进所属顶层,并带「回复 @xx」标注)。
   每条评论:顶/踩 + 回复;自己的评论可行内编辑、删除(confirm 后软删)。
   净分 ≤ -3 的评论淡化显示。锚点 id=comment-<id> 供消息通知精准定位。
   列表数据在服务端组装:正文 Markdown 已渲成 ReactNode 随 props 传入。 */
import { useRef, useState } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import {
  createCommentAction,
  deleteCommentAction,
  setCommentReactionAction,
  updateCommentAction,
} from "../actions";

export interface CommentView {
  id: number;
  authorId: number | null;
  isAi: boolean;
  author: string;
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
  upIds,
  downIds,
}: {
  postId: number;
  locale: Locale;
  meId: number | null;
  total: number;
  threads: CommentThread[];
  upIds: number[];
  downIds: number[];
}) {
  const [replyTo, setReplyTo] = useState<{ id: number; author: string } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const loggedIn = meId !== null;
  const up = new Set(upIds);
  const down = new Set(downIds);

  const startReply = (id: number, author: string) => {
    setReplyTo({ id, author });
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      taRef.current?.focus({ preventScroll: true });
    });
  };

  const head = (c: CommentView) => (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-grey">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={c.avatarUrl}
        alt=""
        className={`h-5 w-5 ${c.isAi ? "rounded" : "rounded-full"}`}
      />
      <span className="text-paper">{c.author}</span>
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
    return (
      <div className="mt-1.5 flex items-center gap-4 font-mono text-[11px] text-grey">
        {loggedIn ? (
          <form action={setCommentReactionAction} className="inline-flex items-center gap-1">
            <input type="hidden" name="comment_id" value={c.id} />
            <button
              type="submit"
              name="kind"
              value="up"
              aria-label={t(locale, up.has(c.id) ? "post.unup" : "post.up")}
              className={`transition-colors ${up.has(c.id) ? "text-blue" : "text-grey hover:text-blue"}`}
            >
              <ArrowBigUp size={13} fill={up.has(c.id) ? "currentColor" : "none"} />
            </button>
            <span className="min-w-3 text-center">{c.score}</span>
            <button
              type="submit"
              name="kind"
              value="down"
              aria-label={t(locale, down.has(c.id) ? "post.undown" : "post.down")}
              className={`transition-colors ${down.has(c.id) ? "text-paper" : "text-grey hover:text-paper"}`}
            >
              <ArrowBigDown size={13} fill={down.has(c.id) ? "currentColor" : "none"} />
            </button>
          </form>
        ) : (
          <span className="inline-flex items-center gap-1" title={t(locale, "post.loginToUpvote")}>
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
              onClick={() => setEditingId(editingId === c.id ? null : c.id)}
              className="transition-colors hover:text-blue"
            >
              {t(locale, "post.edit")}
            </button>
            <form
              action={deleteCommentAction}
              className="inline-flex"
              onSubmit={(e) => {
                if (!window.confirm(t(locale, "post.commentDeleteConfirm")))
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="comment_id" value={c.id} />
              <button type="submit" className="transition-colors hover:text-red-400">
                {t(locale, "post.delete")}
              </button>
            </form>
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
        <form
          action={updateCommentAction}
          onSubmit={() => setEditingId(null)}
          className="mt-2 space-y-2"
        >
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
              className="border border-blue px-3 py-1 text-blue transition-colors hover:bg-blue hover:text-bg"
            >
              {t(locale, "post.save")}
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
      <ul className="mt-6 space-y-6">{threads.map((c) => row(c, false))}</ul>

      {loggedIn ? (
        <form
          ref={formRef}
          action={createCommentAction}
          onSubmit={() => setReplyTo(null)}
          className="mt-10 space-y-3"
        >
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
            className="border border-blue px-5 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
          >
            {t(locale, "post.comment")}
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
