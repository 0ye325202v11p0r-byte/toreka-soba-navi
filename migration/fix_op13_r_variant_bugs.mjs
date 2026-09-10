// Fixes 2 cards (c500 OP13-080-R, c503 OP13-091-R) discovered by
// audit_supabase_data.mjs's >90% divergence check during the 2026-09-11
// catalog expansion. Both show the exact same signature as the earlier
// c9/c2 print-variant-confusion bugs: a consistent ~11-month history in the
// 16,000-42,800 range that suddenly crashes to ~1,380-1,680 in just the
// last 2 snapshots (08/29, 09/10).
//
// WebSearch cross-reference confirmed the site tracks TWO distinct physical
// variants under near-identical URLs for at least one sibling card
// (OP13-091 マーカス・マーズ聖 vs OP13-091-R): a regular white-text parallel
// (~800-1,980円 per yuyu-tei/mercard listings) and a red-foil "コラボ版"
// fetching ~10,000円+ (C-labo). The "-R" page's own chart history (16K-42K
// for 11 months) matches the collab-tier valuation, not the ~1,380-1,547円
// current listings — meaning the site's own tracking appears to have
// started blending in the wrong (common-tier) listing for just these two
// specific "-R" cards in the last 2 snapshots. Two sibling "-R" cards from
// the same set (c501 OP13-084-R, c502 OP13-089-R) show NO such crash and
// stay consistently in the 17K-42K range through their latest snapshot, so
// this is not a wholesale problem with all "-R" cards — just these two.
//
// Same treatment as c9: mark data_quality='flat', null out the
// stats that would be computed from the contaminated mixed series, keep
// only a single reference price (the last value from BEFORE the apparent
// contamination, consistent with the sibling -R cards' own current price
// scale), remove source_url so the daily cron doesn't keep re-poisoning it,
// and add a source_note disclosing the limitation.
//
// Usage: node migration/fix_op13_r_variant_bugs.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const FIXES = [
  {
    id: "c500",
    name: "イーザンバロン・V・ナス寿郎聖(赤文字)",
    lastGoodPrice: 34800, // last snapshot before the 08/29 crash (was 34800 on 08/16, matches sibling -R cards' scale)
  },
  {
    id: "c503",
    name: "マーカス・マーズ聖(赤文字)",
    lastGoodPrice: 34800,
  },
];

async function main() {
  for (const f of FIXES) {
    // drop the contaminated snapshots (everything from 2026-08-29 onward,
    // where the crash begins), keeping the consistent 27-point history
    const { error: delErr } = await supabase
      .from("price_snapshots")
      .delete()
      .eq("card_id", f.id)
      .gte("snapshot_date", "2026-08-29");
    if (delErr) {
      console.error(`FAILED delete snapshots ${f.id}:`, delErr.message);
      continue;
    }

    const { error: updErr } = await supabase
      .from("cards")
      .update({
        name: f.name,
        current_price: f.lastGoodPrice,
        avg30: null,
        avg90: null,
        pct_vs_avg30: null,
        pct_vs_avg90: null,
        low30: null,
        change_amt30: null,
        judgment: null,
        trend_direction: null,
        data_quality: "flat",
        history_is_estimated: false,
        ai_verdict: null,
        ai_verdict_text: null,
        ai_verdict_at: null,
        source_url: null,
        source_note:
          "このカードは印刷バリエーション（赤文字/白文字など）が複数存在する可能性があり、直近の価格情報に別バリエーションの価格が混在している疑いがあるため、自動更新を停止し直近の信頼できる実測値のみを参考値として表示しています。",
      })
      .eq("id", f.id);
    if (updErr) {
      console.error(`FAILED update card ${f.id}:`, updErr.message);
      continue;
    }

    console.log(`OK fixed ${f.id} — ${f.name}, reference price ¥${f.lastGoodPrice.toLocaleString("ja-JP")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
