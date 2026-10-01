import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getRatingSummary } from "@/lib/reviews";
import StarRating from "@/components/StarRating";
import VerifiedBadge from "@/components/VerifiedBadge";
import Avatar from "@/components/Avatar";
import SetupNotice from "@/components/SetupNotice";
import { getCurrentUser } from "@/lib/auth";
import FavoriteButton from "./FavoriteButton";
import { CRAFTSMAN_PUBLIC_COLUMNS } from "@/lib/types";
import type { CraftsmanPublicProfile, CraftsmanRate, Profile, Service, Review } from "@/lib/types";

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
    .select(CRAFTSMAN_PUBLIC_COLUMNS)
    .eq("profile_id", id)
    .maybeSingle<CraftsmanPublicProfile>();

  let activeOrderCount = 0;
  if (craftsmanProfile?.max_concurrent_orders != null) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("craftsman_id", id)
      .eq("status", "in_progress");
    activeOrderCount = count ?? 0;
  }

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
    .eq("reviewee_id", id)
    .order("created_at", { ascending: false })
    .returns<Review[]>();

  const { data: rates } = await supabase
    .from("craftsman_rates")
    .select("*")
    .eq("craftsman_id", id)
    .returns<CraftsmanRate[]>();

  const rating = await getRatingSummary(supabase, id);

  // 「相談する」 and お気に入り are for clients (and signed-out visitors, who
  // are sent to log in first); a craftsman doesn't order from a craftsman.
  const current = await getCurrentUser();
  const viewerRole = current?.profile?.role ?? null;
  let favorited = false;
  if (viewerRole === "client") {
    const { data: fav } = await supabase
      .from("favorites")
      .select("craftsman_id")
      .eq("client_id", current!.id)
      .eq("craftsman_id", id)
      .maybeSingle();
    favorited = Boolean(fav);
  }
  const consultHref = `/requests/new?to=${id}`;
  const canTakeWork =
    craftsmanProfile?.is_accepting_orders !== false &&
    !(craftsmanProfile?.max_concurrent_orders != null && activeOrderCount >= craftsmanProfile.max_concurrent_orders);

  return (
    <div>
      <div className="rounded-lg border border-border bg-bg-elevated p-6">
        <div className="flex items-center gap-3">
          <Avatar url={profile.avatar_url} name={profile.display_name} size={56} />
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{profile.display_name}</h1>
            {craftsmanProfile?.grade_verified && <VerifiedBadge />}
          </div>
        </div>
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
        {rates && rates.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold">料金の目安</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {rates.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span className="text-ink-muted">{r.garment_type}</span>
                  <span className="font-semibold">¥{r.price.toLocaleString()}〜</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-faint">実際の料金は依頼内容により前後します。</p>
          </div>
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
        {craftsmanProfile?.is_accepting_orders && craftsmanProfile.max_concurrent_orders != null && (
          <p className={`mt-4 text-sm ${activeOrderCount >= craftsmanProfile.max_concurrent_orders ? "text-warn" : "text-ink-muted"}`}>
            現在の受注状況: {activeOrderCount}/{craftsmanProfile.max_concurrent_orders}件
            {activeOrderCount >= craftsmanProfile.max_concurrent_orders && "（満枠のため新規受注を停止中）"}
          </p>
        )}
      </div>

      {viewerRole !== "craftsman" && (
        <section className="mt-6 rounded-lg border border-border bg-bg-elevated p-4">
          <h2 className="text-lg font-bold">この和裁士に相談する</h2>
          <p className="mt-1 text-sm text-ink-muted">
            出品にないお仕立て・お直しや、寸法・生地のことなど、この和裁士にだけ相談できます。和裁士から見積り（提案）が届きます。相談の内容は掲示板には表示されません。
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {canTakeWork ? (
              <Link
                href={viewerRole ? consultHref : `/login?next=${encodeURIComponent(consultHref)}`}
                className="rounded-md bg-accent px-4 py-3 text-center font-semibold text-bg-elevated hover:bg-accent-strong transition-colors"
              >
                相談する
              </Link>
            ) : (
              <p className="rounded-md bg-warn-soft px-4 py-3 text-center text-sm text-warn">
                現在、新しい相談・依頼を受け付けていません
              </p>
            )}
            {viewerRole === "client" ? (
              <FavoriteButton craftsmanId={id} favorited={favorited} />
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/craftsmen/${id}`)}`}
                className="rounded-md border border-border px-4 py-3 text-center text-sm font-semibold hover:bg-bg-sunken"
              >
                ☆ お気に入りに追加（ログイン）
              </Link>
            )}
          </div>
        </section>
      )}

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
