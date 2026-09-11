// Follow-up to fix_op13_r_variant_bugs.mjs (2026-09-11): that fix correctly
// flagged c9/c500/c503 as data_quality='flat' (single manually-chosen
// reference price, no real source) because the original onepiece-card-atari.jp
// history for these "-R" (赤文字/red-text) card numbers turned out to be
// contaminated by the white-text common variant's listings.
//
// While investigating the low-priority "find a real source for these 3
// cards" item, found that yuyu-tei.jp carries a DISTINCT "特別パラレル"
// (special parallel) product listing for each of these three — a separate
// product ID from the regular white-text パラレル listing already tracked
// as OP13-080/083/091 (no -R suffix). Confirmed via WebFetch against the
// live pages (card name, card number, and "特別パラレル" rarity label all
// match), and cross-referenced against cardrush-op.jp's listings which
// explicitly label the equivalent product "赤文字" for the same card
// numbers. This is a genuine, sourced, single-shop data point — upgrades
// these 3 cards from an unsourced manual reference (data_quality='flat')
// to the same honest "1店舗の参考価格" treatment already used for the
// other 2,423 yuyu-tei-sourced cards (data_quality='partial').
//
// Usage: node migration/fix_akaji_variants_real_source.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TODAY = new Date().toISOString().slice(0, 10);
const NOTE =
  "このカードは遊々亭の「特別パラレル」商品ページ（店頭販売価格・1店舗・単発）を元にした参考値です。白文字版とは別の商品として遊々亭でも区別されています。複数店舗の平均を追跡する他のカードとは性質が異なり、統計値（30日/90日平均など）はまだ算出できるだけの履歴がありません。";

const FIXES = [
  {
    id: "c9",
    card_number: "OP13-083-R",
    source_url: "https://yuyu-tei.jp/sell/opc/card/op13/10105",
    price: 24800,
  },
  {
    id: "c500",
    card_number: "OP13-080-R",
    source_url: "https://yuyu-tei.jp/sell/opc/card/op13/10099",
    price: 24800,
  },
  {
    id: "c503",
    card_number: "OP13-091-R",
    source_url: "https://yuyu-tei.jp/sell/opc/card/op13/10119",
    price: 24800,
  },
];

async function main() {
  for (const f of FIXES) {
    const { error: updErr } = await supabase
      .from("cards")
      .update({
        current_price: f.price,
        data_quality: "partial",
        history_is_estimated: true,
        source_url: f.source_url,
        source_note: NOTE,
        updated_at: new Date().toISOString(),
      })
      .eq("id", f.id);
    if (updErr) {
      console.error(`FAILED update ${f.id}:`, updErr.message);
      continue;
    }

    // replace any old snapshot(s) with a single verified point for today
    await supabase.from("price_snapshots").delete().eq("card_id", f.id);
    const { error: snapErr } = await supabase
      .from("price_snapshots")
      .insert({ card_id: f.id, snapshot_date: TODAY, price: f.price });
    if (snapErr) {
      console.error(`FAILED snapshot ${f.id}:`, snapErr.message);
      continue;
    }

    console.log(`OK ${f.id} (${f.card_number}) -> data_quality=partial, ¥${f.price.toLocaleString("ja-JP")}, source=${f.source_url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
