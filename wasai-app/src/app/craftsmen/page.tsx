import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getRatingSummary } from "@/lib/reviews";
import StarRating from "@/components/StarRating";
import VerifiedBadge from "@/components/VerifiedBadge";
import Avatar from "@/components/Avatar";
import SetupNotice from "@/components/SetupNotice";
import { GARMENT_TYPES, PREFECTURES, type CraftsmanProfile, type Profile } from "@/lib/types";

type CraftsmanRow = CraftsmanProfile & { profiles: Profile };

export const metadata = { title: "和裁士を探す" };

export default async function CraftsmenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; specialty?: string; prefecture?: string; grade?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">和裁士を探す</h1>
        <SetupNotice />
      </div>
    );
  }

  const { q = "", specialty = "", prefecture = "", grade = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("craftsman_profiles").select("*, profiles!inner(*)");
  if (q) query = query.ilike("profiles.display_name", `%${q}%`);
  if (specialty) query = query.contains("specialties", [specialty]);
  if (prefecture) query = query.eq("profiles.prefecture", prefecture);
  if (grade) query = query.eq("grade", grade);

  const { data, error } = await query.order("updated_at", { ascending: false });
  const craftsmen = (data ?? []) as unknown as CraftsmanRow[];

  const ratings = await Promise.all(
    craftsmen.map((c) => getRatingSummary(supabase, c.profile_id))
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">和裁士を探す</h1>
      <p className="mt-1 text-sm text-ink-muted">
        得意な着物の種類・地域・資格級位で絞り込めます。
      </p>

      <form className="mt-4 flex flex-wrap gap-3 rounded-lg border border-border bg-bg-elevated p-4 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="名前で検索"
          className="rounded-md border border-border bg-bg px-2 py-1.5"
        />
        <select name="specialty" defaultValue={specialty} className="rounded-md border border-border bg-bg px-2 py-1.5">
          <option value="">得意分野: すべて</option>
          {GARMENT_TYPES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select name="prefecture" defaultValue={prefecture} className="rounded-md border border-border bg-bg px-2 py-1.5">
          <option value="">地域: すべて</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name="grade" defaultValue={grade} className="rounded-md border border-border bg-bg px-2 py-1.5">
          <option value="">資格: すべて</option>
          <option value="1級">1級</option>
          <option value="2級">2級</option>
          <option value="3級">3級</option>
          <option value="その他資格">その他資格</option>
        </select>
        <button type="submit" className="rounded-md bg-accent px-4 py-1.5 font-semibold text-bg-elevated">
          絞り込む
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-warn">読み込みに失敗しました: {error.message}</p>}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {craftsmen.map((c, i) => (
          <li key={c.profile_id} className="rounded-lg border border-border bg-bg-elevated p-4">
            <div className="flex items-center gap-2">
              <Avatar url={c.profiles.avatar_url} name={c.profiles.display_name} />
              <Link href={`/craftsmen/${c.profile_id}`} className="text-lg font-semibold text-accent-strong hover:underline">
                {c.profiles.display_name}
              </Link>
              {c.grade_verified && <VerifiedBadge />}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {c.profiles.prefecture ?? "地域未設定"} ・ {c.grade ?? "資格未設定"}
              {c.years_experience != null ? ` ・ 経験${c.years_experience}年` : ""}
            </p>
            {c.specialties.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1">
                {c.specialties.map((s) => (
                  <span key={s} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">
                    {s}
                  </span>
                ))}
              </p>
            )}
            <div className="mt-2">
              <StarRating rating={ratings[i]?.average ?? null} count={ratings[i]?.count ?? 0} />
            </div>
            {!c.is_accepting_orders && (
              <p className="mt-2 text-xs text-warn">現在、新規受注を停止中です</p>
            )}
          </li>
        ))}
        {craftsmen.length === 0 && !error && (
          <p className="text-sm text-ink-muted">条件に一致する和裁士がまだいません。</p>
        )}
      </ul>
    </div>
  );
}
