/* 右栏 widget 的统一外壳:硬边细线卡片 + mono 大字距小标签。
   各上下文 rail(community/post/work/awesome/blog/learn)共用。 */
export default function Widget({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-card p-4">
      <h3 className="font-mono text-[10px] tracking-[0.25em] text-grey">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}
