export default function StarRating({
  rating,
  count,
}: {
  rating: number | null;
  count: number;
}) {
  if (rating === null || count === 0) {
    return <span className="text-sm text-ink-faint">まだ評価がありません</span>;
  }

  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span aria-hidden className="text-star">
        {"★".repeat(rounded)}
        {"☆".repeat(5 - rounded)}
      </span>
      <span className="text-ink-muted">
        {rating.toFixed(1)}（{count}件）
      </span>
    </span>
  );
}
