/* 社区右栏(仅 ≥xl):关于 / 7 日热门 / 社区数据 / 新成员,全部真实数据。
   用户可整体关掉(cookie kb_sidebar=0),关掉后留一条细轨按钮可重开。 */
import Link from "next/link";
import { MessageCircle, PanelRightClose, PanelRightOpen } from "lucide-react";
import { getSidebarData } from "@/src/lib/posts";
import { toggleSidebarAction } from "../actions";

function Widget({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-moon bg-white/[0.015] p-4">
      <h3 className="font-mono text-[10px] tracking-[0.25em] text-grey">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function RightSidebar({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <aside className="sticky top-8 hidden xl:block">
        <form action={toggleSidebarAction}>
          <button
            type="submit"
            title="显示侧栏"
            className="border border-moon p-2 text-grey transition-colors hover:border-blue hover:text-blue"
          >
            <PanelRightOpen size={15} />
          </button>
        </form>
      </aside>
    );
  }

  const data = await getSidebarData();
  return (
    <aside className="sticky top-8 hidden w-72 shrink-0 xl:block">
      <div className="space-y-4">
        <Widget title="关于 KIMI.BUILDERS">
          <p className="text-xs leading-relaxed text-grey">
            Kimi 用户自建的公益 builder 社区(非官方)。并肩探索,一起构建。
          </p>
          <div className="mt-3 flex gap-4 font-mono text-[11px]">
            <a
              href="https://github.com/kimi-builders"
              className="text-grey underline decoration-blue/50 underline-offset-4 hover:text-blue"
            >
              GitHub
            </a>
            <a
              href="https://github.com/kimi-builders/awesome-kimi-builders"
              className="text-grey underline decoration-blue/50 underline-offset-4 hover:text-blue"
            >
              Awesome
            </a>
          </div>
        </Widget>

        <Widget title="7 日热门">
          {data.hot.length === 0 ? (
            <p className="text-xs text-grey">还没有足够的讨论。</p>
          ) : (
            <ul className="space-y-2.5">
              {data.hot.map((h, i) => (
                <li key={h.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono text-[10px] text-grey">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={`/community/${h.id}`}
                    className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-blue"
                  >
                    {h.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-grey">
                    <MessageCircle size={11} />
                    {h.commentCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="社区数据">
          <div className="flex justify-between">
            {[
              { n: data.stats.members, l: "成员" },
              { n: data.stats.posts, l: "帖子" },
              { n: data.stats.comments, l: "评论" },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-mono text-lg font-semibold text-paper">
                  {s.n}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-grey">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </Widget>

        <Widget title="新成员">
          <div className="flex gap-2">
            {data.newMembers.map((m) => (
              <span key={m.handle} title={`@${m.handle}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.avatarUrl}
                  alt={`@${m.handle}`}
                  className="h-7 w-7 rounded-full border border-paper/10"
                />
              </span>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-grey">
            {data.newMembers.map((m) => `@${m.handle}`).join(" ")}
          </p>
        </Widget>

        <form action={toggleSidebarAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 font-mono text-[10px] text-grey transition-colors hover:text-paper"
          >
            <PanelRightClose size={12} />
            隐藏侧栏(留下的小按钮可重开)
          </button>
        </form>
      </div>
    </aside>
  );
}
