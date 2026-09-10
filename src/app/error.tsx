"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="mb-2 text-2xl font-bold">エラーが発生しました</h1>
      <p className="mb-1 text-sm text-ink-muted">
        予期しない問題が発生しました。もう一度お試しください。
      </p>
      {error.message && (
        <p className="mb-6 max-w-md text-xs text-ink-faint">{error.message}</p>
      )}
      <button
        onClick={() => reset()}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong"
      >
        もう一度試す
      </button>
    </div>
  );
}
