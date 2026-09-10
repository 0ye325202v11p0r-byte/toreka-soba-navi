import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TODAY = new Date("2026-09-10T00:00:00Z");
const RAW = `
2026/09/10: 1380
2026/08/29: 1680
2026/08/16: 1830
2026/08/03: 2180
2026/07/21: 2180
2026/07/08: 1880
2026/06/25: 1647
2026/06/12: 1514
2026/05/30: 1580
2026/05/17: 1430
2026/05/04: 1530
2026/04/21: 1580
2026/04/08: 1580
2026/03/26: 1480
2026/03/13: 1647
2026/02/27: 1730
2026/02/14: 1930
2026/02/01: 1847
2026/01/19: 1754
2026/01/06: 1664
2025/12/24: 1624
2025/12/11: 1482
2025/11/28: 1735
2025/11/15: 1835
2025/11/02: 1720
2025/10/20: 1824
2025/10/07: 2410
2025/09/24: 2487
2025/09/10: 2604
`;

function parseSeries(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const [d, p] = line.split(":").map((s) => s.trim());
      const [y, m, dd] = d.split("/").map(Number);
      return { date: new Date(Date.UTC(y, m - 1, dd)), price: Number(p.replace(/,/g, "")) };
    })
    .sort((a, b) => a.date - b.date);
}

async function main() {
  const series = parseSeries(RAW);
  const cardId = "c2";

  await supabase.from("price_snapshots").delete().eq("card_id", cardId);

  const rows = series.map((s) => ({
    card_id: cardId,
    snapshot_date: s.date.toISOString().slice(0, 10),
    price: s.price,
  }));
  const { error: insErr } = await supabase.from("price_snapshots").insert(rows);
  if (insErr) throw insErr;

  const prices = series.map((s) => s.price);
  const last30 = prices.slice(-30);
  const avg30 = last30.reduce((a, b) => a + b, 0) / last30.length;
  const avg90 = prices.reduce((a, b) => a + b, 0) / prices.length;
  const current = prices[prices.length - 1];
  const pct30 = Math.round(((current - avg30) / avg30) * 1000) / 10;
  const pct90 = Math.round(((current - avg90) / avg90) * 1000) / 10;
  const low30 = Math.min(...last30);
  const judgment = pct30 > 15 ? "割高" : pct30 < -15 ? "割安" : "適正";
  const trend = pct30 > 3 ? "rising" : pct30 < -3 ? "declining" : "flat";

  const { error: updErr } = await supabase
    .from("cards")
    .update({
      card_number: "OP13-084",
      current_price: current,
      avg30: Math.round(avg30),
      avg90: Math.round(avg90),
      pct_vs_avg30: pct30,
      pct_vs_avg90: pct90,
      low30,
      change_amt30: current - low30,
      judgment,
      trend_direction: trend,
      data_quality: "real",
      source_url:
        "https://onepiece-card-atari.jp/expansion/carrying-on-his-will/card/op13-084/r-p",
      source_note:
        "onepiece-card-atari.jp の個別カードページに掲載された実際の相場スナップショットを取得（2026年9月時点で修正済み）。以前保存されていた¥34,800という値は誤りで、実際の相場（¥1,380前後）に修正しました。",
      updated_at: new Date().toISOString(),
    })
    .eq("id", cardId);
  if (updErr) throw updErr;

  console.log("fixed c2:", current, Math.round(avg30), Math.round(avg90), judgment);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
