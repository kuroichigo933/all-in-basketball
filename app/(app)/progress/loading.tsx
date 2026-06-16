export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded bg-surface" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="mx-auto h-10 w-16 rounded bg-raised" />
            <div className="mx-auto mt-2 h-3 w-20 rounded bg-raised" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="h-6 w-40 rounded bg-raised" />
            <div className="mt-4 aspect-[500/470] rounded bg-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
