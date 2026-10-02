import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SITE_NAME } from "@/lib/site";
import SetupNotice from "@/components/SetupNotice";

export const metadata = {
  title: "和裁 仕立て代の相場",
  description: "実際に成立した取引データから集計した、着物の種類別の仕立て代相場。",
};

// Public, no sign-in required — see supabase/schema.sql's market_rate_summary()
// for why this is safe to expose without leaking any single transaction's
// price (categories with under 3 completed orders are excluded there).
export const revalidate = 3600;

interface MarketRateRow {
  garment_type: string;
  order_count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
}

export default async function MarketRatesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">和裁 仕立て代の相場</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("market_rate_summary");
  const rows = (data ?? []) as MarketRateRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold">和裁 仕立て代の相場</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {SITE_NAME}上で実際に成立・完了した取引データから集計した、着物の種類別の仕立て代相場です。
        個別の取引価格が特定されないよう、成立件数が3件未満の種類は表示していません。
      </p>

      {error && <p className="mt-4 text-sm text-warn">読み込みに失敗しました: {error.message}</p>}

      {rows.length === 0 && !error ? (
        <p className="mt-6 rounded-lg border border-border bg-bg-elevated p-4 text-sm text-ink-muted">
          まだ十分な取引データが集まっていません。取引が成立し次第、順次公開されます。
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-bg-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="px-3 py-3 font-medium">種類</th>
                <th className="px-3 py-3 font-medium">成立件数</th>
                <th className="px-3 py-3 font-medium">平均価格</th>
                <th className="px-3 py-3 font-medium">価格の幅</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.garment_type} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 font-semibold">{r.garment_type}</td>
                  <td className="px-3 py-3 text-ink-muted">{r.order_count}件</td>
                  <td className="px-3 py-3 font-bold">¥{Math.round(r.avg_price).toLocaleString()}</td>
                  <td className="px-3 py-3 text-ink-muted">
                    {r.min_price === r.max_price
                      ? `¥${r.min_price.toLocaleString()}`
                      : `¥${r.min_price.toLocaleString()}〜¥${r.max_price.toLocaleString()}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
