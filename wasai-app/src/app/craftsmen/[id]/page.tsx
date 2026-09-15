import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCraftsmanRatingSummary } from "@/lib/reviews";
import StarRating from "@/components/StarRating";
import SetupNotice from "@/components/SetupNotice";
import type { CraftsmanProfile, Profile, Service, Review } from "@/lib/types";

export default async function CraftsmanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("role", "craftsman")
    .maybeSingle<Profile>();

  if (!profile) notFound();

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("*")
    .eq("profile_id", id)
    .maybeSingle<CraftsmanProfile>();

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("craftsman_id", id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .returns<Service[]>();

  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .eq("craftsman_id", id)
    .order("created_at", { ascending: false })
    .returns<Review[]>();

  const rating = await getCraftsmanRatingSummary(supabase, id);

  return (
    <div>
      <div className="rounded-lg border border-border bg-bg-elevated p-6">
        <h1 className="text-2xl font-bold">{profile.display_name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {profile.prefecture ?? "地域未設定"} ・ {craftsmanProfile?.grade ?? "資格未設定"}
          {craftsmanProfile?.years_experience != null
            ? ` ・ 経験${craftsmanProfile.years_experience}年`
            : ""}
        </p>
        <div className="mt-2">
          <StarRating rating={rating.average} count={rating.count} />
        </div>
        {profile.bio && <p className="mt-4 whitespace-pre-wrap text-sm">{profile.bio}</p>}
        {craftsmanProfile && craftsmanProfile.specialties.length > 0 && (
          <p className="mt-4 flex flex-wrap gap-1">
            {craftsmanProfile.specialties.map((s) => (
              <span key={s} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">
                {s}
              </span>
            ))}
          </p>
        )}
        {craftsmanProfile && craftsmanProfile.portfolio_urls.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold">実績写真</h2>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {craftsmanProfile.portfolio_urls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element -- external portfolio URLs, no Next Image domain config in this MVP
                <img key={url} src={url} alt="実績写真" className="aspect-square rounded-md object-cover" />
              ))}
            </div>
          </div>
        )}
        {craftsmanProfile && !craftsmanProfile.is_accepting_orders && (
          <p className="mt-4 text-sm text-warn">現在、新規受注を停止中です</p>
        )}
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-bold">出品中のサービス</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {(services ?? []).map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-bg-elevated p-4">
              <Link href={`/services/${s.id}`} className="font-semibold text-accent-strong hover:underline">
                {s.title}
              </Link>
              <p className="mt-1 text-xs text-ink-muted">{s.garment_type}</p>
              <p className="mt-2 font-bold">¥{s.price.toLocaleString()}〜</p>
            </li>
          ))}
          {(services ?? []).length === 0 && (
            <p className="text-sm text-ink-muted">現在出品中のサービスはありません。</p>
          )}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">レビュー</h2>
        <ul className="mt-3 space-y-3">
          {(reviews ?? []).map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-bg-elevated p-4">
              <StarRating rating={r.rating} count={1} />
              {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
            </li>
          ))}
          {(reviews ?? []).length === 0 && <p className="text-sm text-ink-muted">まだレビューがありません。</p>}
        </ul>
      </section>
    </div>
  );
}
