"use client";

/* 评论区(客户端):两级楼中楼 —— 顶层评论 + 缩进回复层(更深的回复由服务端
   拍平进所属顶层,并带「回复 @xx」标注)。
   列表数据在服务端组装:正文 Markdown 已渲成 ReactNode 随 props 传入;
   回复态在客户端:点「回复」设 parent → 输入框聚焦,提交走 server action。 */
import { useRef, useState } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import { createCommentAction } from "../actions";

export interface CommentView {
  id: number;
  isAi: boolean;
  author: string;
  avatarUrl: string;
  time: string;
  replyToAuthor: string | null;
  body: React.ReactNode;
}

export interface CommentThread extends CommentView {
  replies: CommentView[];
}

export default function CommentSection({
  postId,
  locale,
  loggedIn,
  total,
  threads,
}: {
  postId: number;
  locale: Locale;
  loggedIn: boolean;
  total: number;
  threads: CommentThread[];
}) {
  const [replyTo, setReplyTo] = useState<{ id: number; author: string } | null>(
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const startReply = (id: number, author: string) => {
    setReplyTo({ id, author });
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      taRef.current?.focus({ preventScroll: true });
    });
  };

  const replyBtn = (c: CommentView) =>
    loggedIn ? (
      <button
        type="button"
        onClick={() => startReply(c.id, c.author)}
        className="mt-1.5 font-mono text-[11px] text-grey transition-colors hover:text-blue"
      >
        {t(locale, "post.reply")}
      </button>
    ) : null;

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
    </div>
  );

  return (
    <section>
      <h2 id="comments" className="mt-10 font-mono text-sm text-grey">
        {t(locale, "post.comments", { n: total })}
      </h2>
      <ul className="mt-6 space-y-6">
        {threads.map((c) => (
          <li key={c.id} className={c.isAi ? "border-l-2 border-blue pl-4" : ""}>
            {head(c)}
            <div className="mt-2">{c.body}</div>
            {replyBtn(c)}
            {c.replies.length > 0 && (
              <ul className="ml-2 mt-4 space-y-4 border-l border-line pl-4">
                {c.replies.map((r) => (
                  <li key={r.id}>
                    {head(r)}
                    <div className="mt-1.5">{r.body}</div>
                    {replyBtn(r)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

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
