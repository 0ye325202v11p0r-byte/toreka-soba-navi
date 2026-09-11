import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { MarketListCard } from "@/lib/types";
import SetupNotice from "@/components/SetupNotice";
import TodaysPicks from "@/components/TodaysPicks";
import MoverStrip from "@/components/MoverStrip";
import MarketTable from "@/components/MarketTable";

export const revalidate = 60;

export default async function MarketListPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">相場一覧</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Supabase/PostgREST caps a single select() at 1000 rows by default. The
  // catalog passed 1000 cards in the 2026-09-11 expansion (2,622 total) —
  // an unpaginated or under-limited query here would silently hide most of
  // the catalog from the market list and its client-side search/filter
  // (both operate only on whatever rows this query returns).
  let cards: MarketListCard[] = [];
  let error: { message: string } | null = null;
  {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error: pageErr } = await supabase
        .from("cards")
        // TodaysPicks/MoverStrip/MarketTable only ever touch these 8
        // columns — select("*") was pulling every column (including
        // ai_verdict_text, a full paragraph per card) for all ~3,270 rows
        // on every request to the highest-traffic page for no reason.
        .select("id, name, rarity, set_name, current_price, pct_vs_avg30, judgment, data_quality")
        .order("name", { ascending: true })
        .order("id", { ascending: true }) // deterministic tiebreak for range() pagination
        .range(from, from + pageSize - 1);
      if (pageErr) {
        error = pageErr;
        break;
      }
      cards = cards.concat((data ?? []) as MarketListCard[]);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">相場一覧</h1>
      <p className="mb-4 text-sm text-ink-muted">
        表示価格はカードショップの店頭販売価格です。カードによって、複数店舗の平均価格を毎日追跡している「実測データ」と、単一店舗・一時点の価格のみで自動更新されない「参考価格」が混在します（各カードのデータ品質バッジでご確認いただけます）。メルカリ等の個人間フリマの実売価格はこれより低いことがあります。
      </p>

      {!user && (
        <div className="mb-6 rounded-lg border border-accent bg-accent-soft p-4">
          <p className="text-sm text-accent-strong">
            <b>相場を見るだけなら無料です。</b>ログインすると、保有カードの<b>収支（含み損益・実現損益）を自動計算するポートフォリオ</b>と、
            <b>価格が動いたら知らせるウォッチリスト</b>が使えるようになります。
          </p>
          <Link
            href="/login"
            className="mt-2 inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-elevated hover:bg-accent-strong"
          >
            無料でログイン →
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-warn-soft p-4 text-warn">
          データの読み込みに失敗しました：{error.message}
          <br />
          <span className="text-xs">
            Supabaseの環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）が設定されているか確認してください。
          </span>
        </div>
      )}

      {!error && (!cards || cards.length === 0) && (
        <div className="rounded-lg bg-accent-soft p-4 text-accent-strong">
          まだカードデータがありません。移行スクリプトでArtifactからデータを取り込んでください。
        </div>
      )}

      {cards && cards.length > 0 && (
        <>
          <TodaysPicks cards={cards} />
          <MoverStrip cards={cards} />
          <div className="mb-3 flex justify-end">
            <Link href="/compare" className="text-sm text-accent hover:underline">
              複数カードを比較する →
            </Link>
          </div>
        </>
      )}

      {cards && cards.length > 0 && <MarketTable cards={cards} />}
    </div>
  );
}
