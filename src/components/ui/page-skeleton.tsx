function Block({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`rounded-control bg-subtle animate-pulse ${className}`} />
  );
}

/** Shared App Router fallback. It reserves page structure while authenticated data loads. */
export function PageSkeleton() {
  return (
    <main aria-label="Loading page" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-2">
        <Block className="h-4 w-28" />
        <Block className="h-10 w-64 max-w-full" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-card border-line bg-surface shadow-card border p-6">
            <Block className="h-4 w-24" />
            <Block className="mt-4 h-8 w-32" />
            <Block className="mt-3 h-4 w-40 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, panel) => (
          <div key={panel} className="rounded-card border-line bg-surface shadow-card border p-6">
            <Block className="h-6 w-40" />
            <div className="mt-6 flex flex-col gap-4">
              {Array.from({ length: 5 }, (_, row) => (
                <div
                  key={row}
                  className="border-line flex items-center gap-4 border-b pb-4 last:border-0"
                >
                  <Block className="size-10 shrink-0 rounded-full" />
                  <div className="flex-1">
                    <Block className="h-4 w-2/3" />
                    <Block className="mt-2 h-3 w-1/2" />
                  </div>
                  <Block className="h-6 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
