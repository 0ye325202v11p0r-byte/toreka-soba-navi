import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import { GARMENT_TYPES, type JobRequest, type Profile } from "@/lib/types";

type RequestRow = JobRequest & { profiles: Profile };

export const metadata = { title: "依頼掲示板" };

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ garment_type?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">依頼掲示板</h1>
        <SetupNotice />
      </div>
    );
  }

  const { garment_type = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("requests")
    .select("*, profiles!inner(*)")
    .eq("status", "open");
  if (garment_type) query = query.eq("garment_type", garment_type);

  const { data, error } = await query.order("created_at", { ascending: false });
  const requests = (data ?? []) as unknown as RequestRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">依頼掲示板</h1>
        <Link href="/requests/new" className="text-sm text-accent-strong underline">
          依頼を投稿する
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        依頼者が募集中の見積り依頼一覧です。和裁士は気になる依頼に提案できます。
      </p>

      <form className="mt-4 flex gap-3 rounded-lg border border-border bg-bg-elevated p-4 text-sm">
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

      <ul className="mt-6 space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-bg-elevated p-4">
            <Link href={`/requests/${r.id}`} className="font-semibold text-accent-strong hover:underline">
              {r.title}
            </Link>
            <p className="mt-1 text-xs text-ink-muted">
              {r.garment_type} ・ 依頼者: {r.profiles.display_name}
              {r.deadline ? ` ・ 希望納期: ${r.deadline}` : ""}
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{r.description}</p>
            {(r.budget_min || r.budget_max) && (
              <p className="mt-2 text-sm font-semibold">
                予算: {r.budget_min ? `¥${r.budget_min.toLocaleString()}` : "〜"}
                {" 〜 "}
                {r.budget_max ? `¥${r.budget_max.toLocaleString()}` : ""}
              </p>
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
