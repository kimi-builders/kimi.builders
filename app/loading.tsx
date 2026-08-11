export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10" aria-label="页面加载中 / Loading page">
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="h-3 w-24 animate-pulse rounded-full bg-moon" />
        <div className="mt-5 h-8 w-2/3 animate-pulse rounded-lg bg-moon" />
        <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-moon" />
        <div className="mt-2 h-4 w-4/5 animate-pulse rounded-full bg-moon" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-xl border border-line bg-moon" />
          <div className="h-32 animate-pulse rounded-xl border border-line bg-moon" />
        </div>
      </div>
    </main>
  );
}
