import Link from "next/link";

export default function StarRating({
  rating,
  count,
  href,
}: {
  rating: number | null;
  count: number;
  // Where the list of these reviews is. The link sits above a card's
  // whole-card link (relative z-10), so tapping the stars opens the reviews
  // and tapping anywhere else still opens the card.
  href?: string;
}) {
  if (rating === null || count === 0) {
    return <span className="text-sm text-ink-faint">まだ評価がありません</span>;
  }

  const rounded = Math.round(rating);
  const body = (
    <>
      <span aria-hidden className="text-star">
        {"★".repeat(rounded)}
        {"☆".repeat(5 - rounded)}
      </span>
      <span className={href ? "text-link underline" : "text-ink-muted"}>
        {rating.toFixed(1)}（{count}件）
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="relative z-10 inline-flex items-center gap-1 text-sm" aria-label={`評価 ${rating.toFixed(1)}（${count}件）の一覧を見る`}>
        {body}
      </Link>
    );
  }
  return <span className="inline-flex items-center gap-1 text-sm">{body}</span>;
}
