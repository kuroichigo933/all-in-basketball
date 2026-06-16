export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded bg-surface" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-6 space-y-3">
            <div className="h-6 w-3/4 rounded bg-raised" />
            <div className="h-4 w-full rounded bg-raised" />
            <div className="h-3 w-1/3 rounded bg-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
