import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { yen, pct, judgmentClasses, dataQualityLabel } from "@/lib/format";
import type { Card } from "@/lib/types";
import SetupNotice from "@/components/SetupNotice";

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
  const { data: cards, error } = await supabase
    .from("cards")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">相場一覧</h1>
      <p className="mb-6 text-sm text-ink-muted">
        表示価格はカードショップの店頭平均販売価格です。メルカリ等の個人間フリマの実売価格はこれより低いことがあります。
      </p>

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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-bg-sunken text-left text-ink-muted">
              <tr>
                <th className="px-3 py-2">カード</th>
                <th className="px-3 py-2">レアリティ</th>
                <th className="px-3 py-2 text-right">現在価格</th>
                <th className="px-3 py-2 text-right">30日平均比</th>
                <th className="px-3 py-2">判定</th>
                <th className="px-3 py-2">データ品質</th>
              </tr>
            </thead>
            <tbody>
              {(cards as Card[]).map((c) => {
                const dq = dataQualityLabel(c.data_quality);
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-bg-elevated">
                    <td className="px-3 py-2">
                      <Link href={`/cards/${c.id}`} className="font-medium text-ink hover:text-accent">
                        {c.name}
                      </Link>
                      <div className="text-xs text-ink-faint">{c.set_name}</div>
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{c.rarity}</td>
                    <td className="px-3 py-2 text-right font-mono">{yen(c.current_price)}</td>
                    <td className="px-3 py-2 text-right font-mono">{pct(c.pct_vs_avg30)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${judgmentClasses(c.judgment)}`}>
                        {c.judgment ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${dq.cls}`}>{dq.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
