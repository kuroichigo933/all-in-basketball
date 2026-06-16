export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-40 rounded bg-surface" />
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="aspect-[4/3] bg-raised" />
            <div className="p-3 space-y-2">
              <div className="h-5 w-3/4 rounded bg-raised" />
              <div className="h-3 w-1/2 rounded bg-raised" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
