/* 右栏 widget 的统一外壳:圆角细线卡片 + mono 大字距小标签。
   各上下文 rail(community/post/work/awesome/blog/learn)共用。
   note = 标题旁的灰色小注;action = 右侧链接/按钮。 */
export default function Widget({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] tracking-[0.25em] text-grey">
          {title}
        </h3>
        {action}
      </div>
      {note && <p className="mt-1 font-mono text-[10.5px] text-grey/70">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
