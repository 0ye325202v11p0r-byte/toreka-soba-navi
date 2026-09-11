import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { yen, pct, judgmentClasses, dataQualityLabel } from "@/lib/format";
import type { Card, PriceSnapshot } from "@/lib/types";
import { SITE_URL } from "@/lib/site";
import PriceChart from "@/components/PriceChart";
import SetupNotice from "@/components/SetupNotice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return { title: "カード詳細" };
  const { id } = await params;
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("cards")
    .select("name, rarity, set_name, current_price")
    .eq("id", id)
    .single();
  if (!card) return { title: "カード詳細" };
  const title = card.name;
  const description = `${card.name}（${card.rarity}・${card.set_name}）の価格推移。現在価格 ${yen(card.current_price)}。`;
  const url = `${SITE_URL}/cards/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: card }, { data: snapshots }] = await Promise.all([
    supabase.from("cards").select("*").eq("id", id).single(),
    supabase
      .from("price_snapshots")
      .select("*")
      .eq("card_id", id)
      .order("snapshot_date", { ascending: true }),
  ]);

  if (!card) notFound();

  const c = card as Card;
  const dq = dataQualityLabel(c.data_quality);
  const history = (snapshots ?? []) as PriceSnapshot[];

  const jsonLd =
    c.current_price && c.current_price > 0
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: c.name,
          sku: c.id,
          category: c.set_name ?? undefined,
          url: `${SITE_URL}/cards/${c.id}`,
          offers: {
            "@type": "Offer",
            price: c.current_price,
            priceCurrency: "JPY",
            url: `${SITE_URL}/cards/${c.id}`,
            priceValidUntil: new Date(
              new Date(c.updated_at).getTime() + 7 * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .slice(0, 10),
          },
        }
      : null;

  return (
    <div>
      {jsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <div className="mt-1 text-sm text-ink-muted">
            {c.rarity} ・ {c.set_name} {c.card_number ? `・ ${c.card_number}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs ${dq.cls}`}>{dq.label}</span>
          <span className="text-xs text-ink-faint">
            最終更新：{new Date(c.updated_at).toLocaleString("ja-JP")}
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="現在価格" value={yen(c.current_price)} />
        <StatBox label="30日平均" value={yen(c.avg30)} />
        <StatBox label="90日平均" value={`${yen(c.avg90)}（${pct(c.pct_vs_avg90)}）`} />
        <div className="rounded-lg border border-border bg-bg-elevated p-3">
          <div className="text-xs text-ink-muted">判定</div>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${judgmentClasses(c.judgment)}`}>
            {c.judgment ?? "—"}
          </span>
        </div>
      </div>

      <div className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">
        🏪 上記はカードショップの店頭平均価格です。メルカリ等の個人間フリマの実売価格はこれより低いことがあります。
      </div>

      {history.length > 1 ? (
        <PriceChart snapshots={history} />
      ) : history.length === 1 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-ink-faint">
          {history[0].snapshot_date} に記録された{yen(history[0].price)}が唯一のデータです。推移を表示するにはもう数回分の記録が必要です。
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-ink-faint">
          価格履歴データがまだありません（移行前、またはこのカードは新規追加分です）。
        </div>
      )}

      {c.ai_verdict_text && (
        <div className="mt-6 rounded-lg border border-border bg-bg-elevated p-4">
          <div className="mb-2 text-sm font-semibold text-ink-muted">🤖 AI判定・コメント</div>
          <span className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${judgmentClasses(c.ai_verdict)}`}>
            AI判定：{c.ai_verdict}
          </span>
          {c.ai_verdict_at && (
            <span className="ml-2 text-xs text-ink-faint">{c.ai_verdict_at} 生成</span>
          )}
          <p className="mt-1 text-sm">{c.ai_verdict_text}</p>
        </div>
      )}

      {c.source_note && <p className="mt-4 text-xs text-ink-faint">{c.source_note}</p>}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
    </div>
  );
}
