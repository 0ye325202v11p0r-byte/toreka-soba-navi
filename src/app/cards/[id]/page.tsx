import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { yen, pct, judgmentClasses, dataQualityLabel, isAutoTracked, safeJsonLdString, formatDateTime } from "@/lib/format";
import { isYuyuteiSourceEnabled } from "@/lib/appSettings";
import { computePnl } from "@/lib/pnl";
import { conditionMet } from "@/lib/watchlistRule";
import type { Card, PriceSnapshot, Transaction, WatchlistItem } from "@/lib/types";
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
  const { data: rawCard } = await supabase
    .from("cards")
    .select("name, rarity, set_name, current_price, data_quality")
    .eq("id", id)
    .single();
  // Emergency kill-switch (see src/lib/appSettings.ts) — generateMetadata()
  // is a separate code path from the page component below (Next.js calls
  // both independently; the page body's notFound() doesn't retroactively
  // stop this function from having already put the card's name/price into
  // <title>/<meta description>/OGP tags). A disabled yuyu-tei-sourced card
  // must 404 here too, not just in the visible page body.
  const card =
    rawCard && rawCard.data_quality === "partial" && !(await isYuyuteiSourceEnabled(supabase))
      ? null
      : rawCard;
  if (!card) return { title: "カード詳細" };
  const title = card.name;
  const description = `${card.name}（${card.rarity}・${card.set_name}）の価格推移。現在価格 ${yen(card.current_price)}。`;
  const url = `${SITE_URL}/cards/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
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

  // Emergency kill-switch (see src/lib/appSettings.ts) — the "stop
  // republishing their data" half of complying with a yuyu-tei takedown
  // request. A direct link to a specific yuyu-tei-sourced card must 404
  // just as thoroughly as it's excluded from the market list.
  if (c.data_quality === "partial" && !(await isYuyuteiSourceEnabled(supabase))) {
    notFound();
  }

  const dq = dataQualityLabel(c.data_quality);
  const history = (snapshots ?? []) as PriceSnapshot[];

  // "Your status" panel (added 2026-09-13, part of the dashboard/roadmap
  // work to make the app feel personalized everywhere, not just on
  // /dashboard) — shown only to a logged-in user who actually holds or
  // watches THIS card, so an anonymous visitor or an unrelated card sees
  // nothing extra. Scoped queries (this one card_id only), not the full
  // transaction/watchlist history, since that's all this panel needs.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let myHolding: { quantity: number; avgCost: number; costBasis: number } | null = null;
  let myRealizedPnl = 0;
  let myWatchItem: WatchlistItem | null = null;
  let myWatchTriggered = false;
  if (user) {
    const [{ data: myTxns }, { data: myWatch }] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", user.id).eq("card_id", id),
      supabase.from("watchlist_items").select("*").eq("user_id", user.id).eq("card_id", id),
    ]);
    const pnl = computePnl((myTxns ?? []) as Transaction[]);
    myHolding = pnl.holdings[0] ?? null;
    myRealizedPnl = pnl.realizedPnl;
    myWatchItem = ((myWatch ?? [])[0] as WatchlistItem | undefined) ?? null;
    if (myWatchItem) {
      myWatchTriggered = conditionMet(myWatchItem.alert_rule, {
        pctVsAvg30: c.pct_vs_avg30,
        currentPrice: c.current_price,
      });
    }
  }
  const hasMyStatus = myHolding !== null || myRealizedPnl !== 0 || myWatchItem !== null;

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
          dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }}
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
          {!isAutoTracked(c) && (
            <span className="max-w-[220px] text-right text-[11px] text-ink-faint">
              自動更新の対象外です。表示中の価格は登録時点のものです。
            </span>
          )}
          <span className="text-xs text-ink-faint">
            最終更新：{formatDateTime(c.updated_at)}
          </span>
        </div>
      </div>

      {hasMyStatus && (
        <div className="mb-6 rounded-lg border border-accent bg-accent-soft p-4">
          <div className="mb-1 text-xs font-semibold text-accent-strong">👤 あなたの状況</div>
          <div className="space-y-1 text-sm">
            {myHolding && (
              <p>
                保有中：{myHolding.quantity}枚・平均取得単価 {yen(myHolding.avgCost)}・評価額{" "}
                {yen((c.current_price ?? 0) * myHolding.quantity)}・含み損益{" "}
                <span
                  className={
                    (c.current_price ?? 0) * myHolding.quantity - myHolding.costBasis >= 0
                      ? "text-good"
                      : "text-warn"
                  }
                >
                  {yen((c.current_price ?? 0) * myHolding.quantity - myHolding.costBasis)}
                </span>
              </p>
            )}
            {myRealizedPnl !== 0 && (
              <p>
                このカードの確定損益（実現損益）：{" "}
                <span className={myRealizedPnl >= 0 ? "text-good" : "text-warn"}>{yen(myRealizedPnl)}</span>
              </p>
            )}
            {myWatchItem && (
              <p>
                ウォッチ中
                {myWatchTriggered && (
                  <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">
                    ✅ 条件成立中
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <Link href="/dashboard" className="text-accent-strong hover:underline">
              ダッシュボードで見る →
            </Link>
            <Link href="/portfolio" className="text-accent-strong hover:underline">
              ポートフォリオで見る →
            </Link>
            {/* Quick-add (2026-09-13): always offered here too, even for a
                user who already holds/watches this card — buying more, or
                adding a second watch threshold, are both legitimate. See
                WatchlistClient.tsx/PortfolioClient.tsx's initialCardId for
                how ?card= is consumed (server-validated, never trusted
                as-is). */}
            <Link href={`/watchlist?card=${c.id}`} className="text-accent-strong hover:underline">
              ＋ ウォッチリストに追加
            </Link>
            <Link href={`/portfolio?card=${c.id}`} className="text-accent-strong hover:underline">
              ＋ 取引を記録
            </Link>
          </div>
        </div>
      )}

      {!hasMyStatus && (
        // No holding/watch/realized history for this card yet — still
        // offer the same quick-add entry points (this is exactly the "I
        // just found this card and want to start tracking it" moment the
        // links exist for), just without the accent-colored "your status"
        // framing above, since there's no status to report. Shown
        // regardless of login state — an anonymous visitor just gets
        // routed through /login first, same as clicking any other
        // authenticated-only link on this site.
        <div className="mb-6 flex flex-wrap gap-3 text-xs">
          <Link href={`/watchlist?card=${c.id}`} className="text-accent hover:underline">
            ＋ ウォッチリストに追加
          </Link>
          <Link href={`/portfolio?card=${c.id}`} className="text-accent hover:underline">
            ＋ 取引を記録
          </Link>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label="現在価格"
          value={yen(c.current_price)}
          hint={
            c.low30 != null && c.change_amt30 != null && c.change_amt30 > 0
              ? `30日安値${yen(c.low30)}から+${yen(c.change_amt30)}`
              : undefined
          }
        />
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
        {/* "平均" only describes data_quality==='real' cards (複数店舗の
            平均価格, onepiece-card-atari.jp) — this text used to claim it
            unconditionally for every card, including single-shop
            'partial'/'flat' cards (yuyu-tei), which is exactly the kind of
            provenance-overclaiming this review has been finding and fixing
            elsewhere (found 2026-09-12, following a direct question about
            whether yuyu-tei being the only second source was disclosed
            clearly enough). This checks data_quality (the provenance axis)
            rather than isAutoTracked (the cron-scope axis) — a "real" card
            is a multi-shop average by how it was sourced, independent of
            whether the cron can currently re-fetch it. */}
        {c.data_quality === "real" ? (
          <>🏪 上記はカードショップの店頭平均価格です。メルカリ等の個人間フリマの実売価格はこれより低いことがあります。</>
        ) : (
          <>🏪 上記は単一店舗の店頭価格（参考値）です。複数店舗の平均ではありません。メルカリ等の個人間フリマの実売価格はこれより低いことがあります。</>
        )}
      </div>

      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
          `${c.name} の現在価格は${yen(c.current_price)}（30日平均比${pct(c.pct_vs_avg30)}）`
        )}&url=${encodeURIComponent(`${SITE_URL}/cards/${c.id}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-4 inline-block text-xs text-accent hover:underline"
      >
        𝕏でこの価格をシェア →
      </a>

      {history.length > 1 ? (
        <PriceChart snapshots={history} avgCost={myHolding?.avgCost} />
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

      {c.source_url && (
        <a
          href={c.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm text-accent hover:underline"
        >
          掲載店舗のページで見る →
        </a>
      )}

      {c.source_note && <p className="mt-4 text-xs text-ink-faint">{c.source_note}</p>}
    </div>
  );
}

function StatBox({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-faint">{hint}</div>}
    </div>
  );
}
