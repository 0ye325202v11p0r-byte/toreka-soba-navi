import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import ServiceCard from "@/components/ServiceCard";
import { GARMENT_TYPES, type Service, type Profile } from "@/lib/types";

type ServiceRow = Service & { profiles: Profile };

export const metadata = { title: "仕立てメニュー" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; garment_type?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">仕立てメニュー</h1>
        <SetupNotice />
      </div>
    );
  }

  const { q = "", garment_type = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("services")
    .select("*, profiles!inner(*)")
    .eq("status", "published");
  if (q) query = query.ilike("title", `%${q}%`);
  if (garment_type) query = query.eq("garment_type", garment_type);

  const { data, error } = await query.order("created_at", { ascending: false });
  const services = (data ?? []) as unknown as ServiceRow[];

  // Grade and rating per craftsman for the cards — one query each for the
  // whole page rather than one per card.
  const craftsmanIds = Array.from(new Set(services.map((s) => s.craftsman_id)));
  const grades = new Map<string, string | null>();
  const ratings = new Map<string, { sum: number; count: number }>();
  if (craftsmanIds.length > 0) {
    const [{ data: cps }, { data: revs }] = await Promise.all([
      supabase.from("craftsman_profiles").select("profile_id, grade").in("profile_id", craftsmanIds),
      supabase.from("reviews").select("reviewee_id, rating").in("reviewee_id", craftsmanIds),
    ]);
    for (const c of cps ?? []) grades.set(c.profile_id, c.grade);
    for (const r of revs ?? []) {
      const cur = ratings.get(r.reviewee_id) ?? { sum: 0, count: 0 };
      ratings.set(r.reviewee_id, { sum: cur.sum + r.rating, count: cur.count + 1 });
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">仕立てメニュー</h1>
        <Link href="/services/new" className="text-sm text-link underline">
          和裁士の方はメニューを作る
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        和裁士が内容と値段を決めて用意している仕立て・お直しのメニューです。気に入ったものがあれば、そのまま申し込めます。
        作りたいものに合うメニューがなければ、
        <Link href="/requests" className="text-link underline">
          依頼掲示板
        </Link>
        で募集するか、和裁士に直接相談できます。
      </p>

      <form className="mt-4 flex flex-wrap gap-3 rounded-lg border border-border bg-bg-elevated p-4 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="タイトルで検索"
          className="rounded-md border border-border bg-bg px-2 py-1.5"
        />
        <select name="garment_type" defaultValue={garment_type} className="rounded-md border border-border bg-bg px-2 py-1.5">
          <option value="">種類: すべて</option>
          {GARMENT_TYPES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-accent px-4 py-1.5 font-semibold text-bg-elevated">
          絞り込む
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-warn">読み込みに失敗しました: {error.message}</p>}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {services.map((s) => {
          const r = ratings.get(s.craftsman_id);
          return (
            <ServiceCard
              key={s.id}
              service={s}
              craftsman={{
                display_name: s.profiles.display_name,
                avatar_url: s.profiles.avatar_url,
                grade: grades.get(s.craftsman_id) ?? null,
                ratingAverage: r ? r.sum / r.count : null,
                ratingCount: r?.count ?? 0,
              }}
            />
          );
        })}
        {services.length === 0 && !error && (
          <p className="text-sm text-ink-muted">まだメニューがありません。</p>
        )}
      </ul>
    </div>
  );
}
