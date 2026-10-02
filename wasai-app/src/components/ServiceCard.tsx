import Link from "next/link";
import Avatar from "@/components/Avatar";
import GarmentChip from "@/components/GarmentChip";
import { garmentStyle } from "@/lib/garmentStyle";
import type { Service } from "@/lib/types";

export interface ServiceCardCraftsman {
  display_name: string;
  avatar_url: string | null;
  grade: string | null;
  ratingAverage: number | null;
  ratingCount: number;
}

// The whole card is the link — a bigger tap target on phones than the title
// alone. The colored top edge and chip follow the garment type.
export default function ServiceCard({ service, craftsman }: { service: Service; craftsman?: ServiceCardCraftsman }) {
  const { fg } = garmentStyle(service.garment_type);
  return (
    <li>
      <Link
        href={`/services/${service.id}`}
        className="block h-full overflow-hidden rounded-lg border border-border bg-bg-elevated transition-shadow hover:shadow-md"
        style={{ borderTopColor: fg, borderTopWidth: 4 }}
      >
        <div className="p-4">
          <GarmentChip garmentType={service.garment_type} />
          <p className="mt-2 font-bold leading-snug text-ink">{service.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{service.description}</p>
          {craftsman && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Avatar url={craftsman.avatar_url} name={craftsman.display_name} size={24} />
              <span className="min-w-0 truncate text-ink">{craftsman.display_name}</span>
              {craftsman.grade && craftsman.grade !== "資格なし" && (
                <span className="shrink-0 rounded border border-border px-1.5 text-xs text-ink-muted">{craftsman.grade}</span>
              )}
              {craftsman.ratingAverage != null && (
                <span className="ml-auto shrink-0 text-xs text-ink-muted">
                  <span className="text-star" aria-hidden>
                    ★
                  </span>
                  {craftsman.ratingAverage.toFixed(1)}（{craftsman.ratingCount}）
                </span>
              )}
            </div>
          )}
          <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
            <span className="text-xl font-bold text-ink">
              ¥{service.price.toLocaleString()}
              <span className="text-sm font-normal text-ink-muted">〜</span>
            </span>
            <span className="text-xs text-ink-muted">
              納期目安 {service.delivery_days}日 ・ 修正{service.revision_count}回まで
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
