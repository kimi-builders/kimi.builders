function Skeleton({ className }: { className: string }) {
  return <div className={`bg-line/70 motion-safe:animate-pulse ${className}`} aria-hidden="true" />;
}

export default function UsageLoading() {
  return (
    <div className="usage-dashboard" role="status" aria-label="正在加载用量 / Loading usage">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-[min(72vw,32rem)]" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-line pb-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-20" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="border border-line bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-5 h-6 w-28" />
            <Skeleton className="mt-3 h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-4 border border-line bg-card p-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
