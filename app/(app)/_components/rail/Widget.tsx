/* The unified rail widget shell: a rounded hairline card + a small
   mono wide-tracked label. Shared by every context rail
   (community/post/work/awesome/blog/learn). note = the grey side note
   beside the title; action = the right-hand link/button. */
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
        <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-grey">
          {title}
        </h3>
        {action}
      </div>
      {note && <p className="mt-1 text-xs text-grey/70">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
