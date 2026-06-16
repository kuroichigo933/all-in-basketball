export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-56 rounded bg-surface" />
      <div className="mb-8 h-4 w-2/3 rounded bg-surface" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="h-5 w-3/4 rounded bg-raised" />
            <div className="h-3 w-full rounded bg-raised" />
            <div className="h-7 w-12 rounded bg-raised" />
          </div>
        ))}
      </div>
      <div className="mt-8 h-6 w-36 rounded bg-surface" />
      <div className="mt-4 grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square rounded bg-surface" />
        ))}
      </div>
    </div>
  );
}
