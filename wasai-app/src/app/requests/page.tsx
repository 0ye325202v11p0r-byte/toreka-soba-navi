import Link from "next/link";
import { formatBudget } from "@/lib/budget";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getRatingSummary } from "@/lib/reviews";
import StarRating from "@/components/StarRating";
import SetupNotice from "@/components/SetupNotice";
import Avatar from "@/components/Avatar";
import GarmentChip from "@/components/GarmentChip";
import { garmentStyle } from "@/lib/garmentStyle";
import { GARMENT_TYPES, type JobRequest, type Profile } from "@/lib/types";

type RequestRow = JobRequest & { profiles: Profile };

export const metadata = { title: "依頼掲示板" };

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; garment_type?: string; min_grade?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">依頼掲示板</h1>
        <SetupNotice />
      </div>
    );
  }

  const { q = "", garment_type = "", min_grade = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("requests")
    .select("*, profiles!inner(*)")
    .eq("status", "open")
    // 指名依頼 (sent to one craftsman) never go on the public board — RLS
    // already hides them from everyone else; this keeps them off for the
    // two people who can see them too.
    .is("directed_to", null);
  if (q) query = query.ilike("title", `%${q}%`);
  if (garment_type) query = query.eq("garment_type", garment_type);
  if (min_grade) query = query.eq("min_grade", min_grade);

  const { data, error } = await query.order("created_at", { ascending: false });
  const requests = (data ?? []) as unknown as RequestRow[];

  const clientRatings = await Promise.all(
    requests.map((r) => getRatingSummary(supabase, r.client_id))
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">依頼掲示板</h1>
        <Link href="/requests/new" className="text-sm text-link underline">
          依頼を投稿する
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        依頼者が募集中の見積り依頼一覧です。和裁士は気になる依頼に提案できます。
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
        <select name="min_grade" defaultValue={min_grade} className="rounded-md border border-border bg-bg px-2 py-1.5">
          <option value="">資格指定: すべて</option>
          <option value="1級">1級限定</option>
          <option value="2級">2級以上限定</option>
          <option value="3級">3級以上限定</option>
          <option value="その他資格">資格保有者限定</option>
        </select>
        <button type="submit" className="rounded-md bg-accent px-4 py-1.5 font-semibold text-bg-elevated">
          絞り込む
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-warn">読み込みに失敗しました: {error.message}</p>}

      <ul className="mt-6 space-y-3">
        {requests.map((r, i) => (
          <li
            key={r.id}
            className="relative rounded-lg border border-border bg-bg-elevated p-4 transition-shadow hover:shadow-md"
            style={{ borderTopColor: garmentStyle(r.garment_type).fg, borderTopWidth: 4 }}
          >
            <GarmentChip garmentType={r.garment_type} />
            <div className="mt-2 flex items-center gap-2">
              <Link
                href={`/requests/${r.id}`}
                className="font-semibold text-ink after:absolute after:inset-0 after:content-[''] hover:underline"
              >
                {r.title}
              </Link>
              {r.min_grade && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-strong">
                  {r.min_grade}以上限定
                </span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
              依頼者:
              <Avatar url={r.profiles.avatar_url} name={r.profiles.display_name} size={20} />
              {r.profiles.display_name}
              {r.deadline ? ` ・ 希望納期: ${r.deadline}` : ""}
            </p>
            <div className="mt-1">
              <StarRating rating={clientRatings[i]?.average ?? null} count={clientRatings[i]?.count ?? 0} href={`/reviews/${r.client_id}`} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{r.description}</p>
            {formatBudget(r.budget_min, r.budget_max) && (
              <p className="mt-2 text-sm font-semibold">予算: {formatBudget(r.budget_min, r.budget_max)}</p>
            )}
          </li>
        ))}
        {requests.length === 0 && !error && (
          <p className="text-sm text-ink-muted">現在募集中の依頼はありません。</p>
        )}
      </ul>
    </div>
  );
}
