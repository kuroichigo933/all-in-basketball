export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-64 rounded bg-surface" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="mx-auto h-10 w-16 rounded bg-raised" />
            <div className="mx-auto mt-2 h-3 w-20 rounded bg-raised" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-6 space-y-3">
            <div className="h-4 w-24 rounded bg-raised" />
            <div className="h-7 w-2/3 rounded bg-raised" />
            <div className="h-4 w-full rounded bg-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
