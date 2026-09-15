import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import { GARMENT_TYPES, type Service, type Profile } from "@/lib/types";

type ServiceRow = Service & { profiles: Profile };

export const metadata = { title: "出品一覧" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; garment_type?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">出品一覧</h1>
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">出品一覧</h1>
        <Link href="/services/new" className="text-sm text-accent-strong underline">
          和裁士の方はサービスを出品する
        </Link>
      </div>

      <form className="mt-4 flex gap-3 rounded-lg border border-border bg-bg-elevated p-4 text-sm">
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
        {services.map((s) => (
          <li key={s.id} className="rounded-lg border border-border bg-bg-elevated p-4">
            <Link href={`/services/${s.id}`} className="font-semibold text-accent-strong hover:underline">
              {s.title}
            </Link>
            <p className="mt-1 text-xs text-ink-muted">
              {s.garment_type} ・ {s.profiles.display_name}
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{s.description}</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-bold">¥{s.price.toLocaleString()}〜</span>
              <span className="text-ink-faint">納期目安 {s.delivery_days}日</span>
            </div>
          </li>
        ))}
        {services.length === 0 && !error && (
          <p className="text-sm text-ink-muted">まだ出品がありません。</p>
        )}
      </ul>
    </div>
  );
}
