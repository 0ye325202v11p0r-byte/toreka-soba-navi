// Rule-based "AI verdict" text generator — mirrors the logic used when the
// card data was first authored, but expressed in TypeScript so Phase 2's
// cron can regenerate it every time prices update instead of leaving a
// stale paragraph whose numbers drift out of sync with the actual avg30/
// avg90/judgment shown elsewhere on the page.
import type { Judgment } from "./types";

export function buildVerdictText(params: {
  name: string;
  currentPrice: number;
  avg30: number;
  avg90: number;
  pctVsAvg30: number;
  pctVsAvg90: number;
  judgment: Judgment;
}): string {
  const { currentPrice, avg30, avg90, pctVsAvg30, pctVsAvg90, judgment } = params;

  const direction = judgment === "割安" ? "下回る" : judgment === "割高" ? "上回る" : "近い";
  const magnitude =
    Math.abs(pctVsAvg30) > 40 ? "大きく" : Math.abs(pctVsAvg30) > 20 ? "やや" : "";
  const moveVerb = judgment === "割安" ? "下がっています" : judgment === "割高" ? "上がっています" : "推移しています";

  const sameDirection =
    (pctVsAvg30 >= 0 && pctVsAvg90 >= 0) || (pctVsAvg30 <= 0 && pctVsAvg90 <= 0);
  const trendSentence = sameDirection
    ? `90日平均比でも${pctVsAvg90 > 0 ? "+" : ""}${pctVsAvg90.toFixed(1)}%と同様に${pctVsAvg90 >= 0 ? "プラス" : "マイナス"}方向で推移しており、短期的な一時的な動きというより、ある程度の期間をかけて価格が${judgment === "割高" ? "切り上がって" : judgment === "割安" ? "落ち着いて" : "安定して"}きた可能性があります。`
    : `一方で90日平均比では${pctVsAvg90 > 0 ? "+" : ""}${pctVsAvg90.toFixed(1)}%と逆方向になっており、直近の値動きと中期的なトレンドの方向感が一致していません。短期的な変動の可能性もあるため注意が必要です。`;

  const advice =
    judgment === "割高"
      ? "高値掴みを避けるため、急いで購入せず値動きが落ち着くタイミングも選択肢に入れるとよさそうです。"
      : judgment === "割安"
        ? "店舗仕入れ状況などで短期的に価格が動くこともあるため、購入を検討する際は複数店舗の掲載も確認したうえで判断することをおすすめします。"
        : "目立った過熱・冷え込みは見られず、現時点では急いで判断する必要は薄いと考えられます。";

  const openLine =
    direction === "近い"
      ? `30日平均${Math.round(avg30).toLocaleString("ja-JP")}円に対し現在の店舗掲載価格が${Math.round(currentPrice).toLocaleString("ja-JP")}円（${pctVsAvg30 > 0 ? "+" : ""}${pctVsAvg30.toFixed(1)}%）。平均から大きくは乖離しておらず、比較的落ち着いた値動きです。`
      : `30日平均${Math.round(avg30).toLocaleString("ja-JP")}円に対し現在の店舗掲載価格が${Math.round(currentPrice).toLocaleString("ja-JP")}円（${pctVsAvg30 > 0 ? "+" : ""}${pctVsAvg30.toFixed(1)}%）。平均を${magnitude}${direction}水準まで${moveVerb}。`;

  void avg90; // kept in the signature for callers that want it available
  return `${openLine}${trendSentence}${advice}`;
}
