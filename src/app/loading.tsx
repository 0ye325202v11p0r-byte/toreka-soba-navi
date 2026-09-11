export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-label="読み込み中" role="status">
      <div className="h-7 w-40 rounded bg-bg-sunken" />
      <div className="h-4 w-72 max-w-full rounded bg-bg-sunken" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-bg-sunken" />
        ))}
      </div>
    </div>
  );
}
