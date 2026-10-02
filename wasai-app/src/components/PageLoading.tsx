// Shown the moment a link is tapped while the next page renders on the
// server (loading.tsx). Without a loading boundary Next.js doesn't prefetch
// dynamic pages at all and the old page just sits there until the new one
// arrives — the "ヌメっとした" feel from the trial. A few gray blocks in the
// rough shape of a page say "it's coming" without flashing real-looking
// content.
export default function PageLoading() {
  return (
    <div role="status" aria-live="polite" data-page-loading className="animate-pulse">
      <span className="sr-only">読み込み中…</span>
      <div className="h-7 w-48 rounded bg-bg-sunken" />
      <div className="mt-3 h-4 w-full max-w-md rounded bg-bg-sunken" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <div className="h-4 w-16 rounded-full bg-bg-sunken" />
            <div className="mt-3 h-5 w-3/4 rounded bg-bg-sunken" />
            <div className="mt-2 h-4 w-full rounded bg-bg-sunken" />
            <div className="mt-4 h-6 w-24 rounded bg-bg-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
