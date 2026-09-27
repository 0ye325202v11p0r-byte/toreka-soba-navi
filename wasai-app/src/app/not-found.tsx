import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p className="mt-2 text-sm text-ink-muted">お探しのページは存在しないか、削除された可能性があります。</p>
      <Link href="/" className="mt-4 inline-block text-accent-strong underline">
        トップへ戻る
      </Link>
    </div>
  );
}
