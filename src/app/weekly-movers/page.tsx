import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { pct } from "@/lib/format";
import { findTopMovers } from "@/lib/movers";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

const TITLE = "今週の値上がり・値下がりランキング";
const DESCRIPTION =
  "ONE PIECEカードゲームの実測相場データから、直近30日平均比で最も値上がり・値下がりしているカードをランキング形式で毎時更新。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

function publicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export default async function WeeklyMoversPage() {
  const supabase = publicClient();
  // Scoped to data_quality='real' only (unlike the homepage's MoverStrip,
  // which includes 'partial' cards when the yuyu-tei source is enabled) —
  // this page's whole premise is "which cards genuinely moved," and 'real'
  // cards are the ones with a true multi-shop daily-tracked average
  // (isAutoTracked()'s own reasoning applies here too, just scoped tighter
  // since this is the one page whose entire content IS the ranking, not a
  // small supplementary widget on a page with plenty of other content).
  const { data, error } = await supabase
    .from("cards")
    .select("id, name, pct_vs_avg30")
    .eq("data_quality", "real")
    .not("pct_vs_avg30", "is", null);

  const cards = data ?? [];
  const { gainers, losers } = findTopMovers(cards, 10);
  const shareText = encodeURIComponent(
    `ONE PIECEカードゲームの今週の相場動向をチェック${gainers[0] ? `｜値上がり首位：${gainers[0].name}` : ""}`
  );
  const shareUrl = encodeURIComponent(`${SITE_URL}/weekly-movers`);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{TITLE}</h1>
      <p className="mb-6 text-sm text-ink-muted">{DESCRIPTION}</p>

      {error && (
        <div className="rounded-lg bg-warn-soft p-4 text-warn">データの読み込みに失敗しました：{error.message}</div>
      )}

      {!error && gainers.length === 0 && losers.length === 0 && (
        <p className="text-sm text-ink-faint">対象カードがありません。</p>
      )}

      {!error && (gainers.length > 0 || losers.length > 0) && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RankingList title="📈 値上がりランキング（30日平均比）" items={gainers} tone="good" />
            <RankingList title="📉 値下がりランキング（30日平均比）" items={losers} tone="warn" />
          </div>

          <a
            href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-elevated hover:bg-accent-strong"
          >
            Xでシェア →
          </a>
        </>
      )}

      <p className="mt-6 text-xs text-ink-faint">
        「実測データ」品質のカードのみを対象に、直近30日平均比で算出しています。投資助言ではありません。
      </p>
    </div>
  );
}

function RankingList({
  title,
  items,
  tone,
}: {
  title: string;
  items: { id: string; name: string; pct_vs_avg30: number }[];
  tone: "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4">
      <h2 className="mb-3 text-sm font-bold text-ink-muted">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-faint">対象カードがありません。</p>
      ) : (
        <ol className="space-y-2">
          {items.map((c, i) => (
            <li key={c.id}>
              <Link href={`/cards/${c.id}`} className="flex items-center justify-between text-sm hover:text-accent">
                <span className="truncate">
                  <span className="mr-2 text-ink-faint">{i + 1}.</span>
                  {c.name}
                </span>
                <span className={`ml-2 shrink-0 font-mono ${tone === "good" ? "text-good" : "text-warn"}`}>
                  {pct(c.pct_vs_avg30)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Re-exported for the sibling opengraph-image.tsx route, which needs the
// exact same "real, non-null pct_vs_avg30" scoping to stay consistent with
// what this page itself shows — kept here rather than duplicated so the two
// can never silently drift apart. Scoped to data_quality='real' only, so
// the yuyu-tei kill-switch (see appSettings.ts) never applies to this query
// in the first place — nothing to additionally check here.
export async function fetchWeeklyMovers() {
  const supabase = publicClient();
  const { data } = await supabase
    .from("cards")
    .select("id, name, pct_vs_avg30")
    .eq("data_quality", "real")
    .not("pct_vs_avg30", "is", null);
  return findTopMovers(data ?? [], 3);
}
