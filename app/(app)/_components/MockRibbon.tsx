/* MOCK 预览条:设计打磨期(板块 _data.ts 模拟数据)页面顶部的诚实标记——
   排版可以先行,数据身份不能含糊。正式内容接管后连同各 _data.ts 一起删除。
   message:页面存在真实数据区块时传分区措辞(如 learn 详情:策展预览 + 真实记录)。 */
export default function MockRibbon({
  zh,
  message,
}: {
  zh: boolean;
  message?: string;
}) {
  return (
    <p
      role="note"
      className="mb-6 rounded-lg border border-dashed border-amber-500/40 bg-amber-400/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-amber-400"
    >
      {message ??
        (zh
          ? "设计预览 · 本页内容为模拟数据,仅用于打磨排版与交互,正式内容接管前不会当作真实记录"
          : "DESIGN PREVIEW · mock content for layout polish — not a real record until editorial data takes over")}
    </p>
  );
}
