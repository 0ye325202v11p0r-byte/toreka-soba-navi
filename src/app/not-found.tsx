import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="mb-2 text-2xl font-bold">ページが見つかりません</h1>
      <p className="mb-6 text-sm text-ink-muted">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link
        href="/"
        className="rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong"
      >
        相場一覧へ戻る
      </Link>
    </div>
  );
}
