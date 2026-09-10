import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { yen, pct, judgmentClasses, dataQualityLabel } from "@/lib/format";
import type { Card, PriceSnapshot } from "@/lib/types";
import PriceChart from "@/components/PriceChart";
import SetupNotice from "@/components/SetupNotice";

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

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <div className="mt-1 text-sm text-ink-muted">
            {c.rarity} ・ {c.set_name} {c.card_number ? `・ ${c.card_number}` : ""}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${dq.cls}`}>{dq.label}</span>
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

      {history.length > 0 ? (
        <PriceChart snapshots={history} />
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
          <p className="text-sm">{c.ai_verdict_text}</p>
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
