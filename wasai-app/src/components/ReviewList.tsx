import StarRating from "@/components/StarRating";
import GarmentChip from "@/components/GarmentChip";
import type { RatingSummary, ReviewWithContext } from "@/lib/reviews";

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long" });

// The list behind a star rating: the summary on top, then each review with
// what was made and when.
export default function ReviewList({ summary, reviews }: { summary: RatingSummary; reviews: ReviewWithContext[] }) {
  if (reviews.length === 0) return <p className="text-sm text-ink-muted">まだレビューがありません。</p>;
  return (
    <div>
      <div className="text-base">
        <StarRating rating={summary.average} count={summary.count} />
      </div>
      <ul className="mt-3 space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-bg-elevated p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span aria-label={`5段階中${r.rating}`} className="text-star">
                {"★".repeat(r.rating)}
                <span className="text-border-strong">{"★".repeat(5 - r.rating)}</span>
              </span>
              {r.garment_type && <GarmentChip garmentType={r.garment_type} />}
              <span className="text-xs text-ink-muted">{monthLabel(r.created_at)}の取引</span>
            </div>
            {r.comment && <p className="mt-2 whitespace-pre-wrap text-sm">{r.comment}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
