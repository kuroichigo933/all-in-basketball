export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-56 rounded bg-surface" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6 space-y-4">
          <div className="h-6 w-40 rounded bg-raised" />
          <div className="h-32 rounded bg-raised" />
          <div className="h-10 rounded bg-raised" />
        </div>
        <div className="card overflow-hidden">
          <div className="p-5 space-y-2">
            <div className="h-4 w-24 rounded bg-raised" />
            <div className="h-6 w-48 rounded bg-raised" />
          </div>
          <div className="aspect-[4/3] bg-raised" />
        </div>
      </div>
    </div>
  );
}
