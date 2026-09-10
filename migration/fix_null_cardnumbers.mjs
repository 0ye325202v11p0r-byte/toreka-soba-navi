import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // c59, c68, c55: verified today's price matches our DB exactly — just
  // backfill the card_number + source_url so Phase 2 can track them going
  // forward. No price change needed.
  const exact = [
    {
      id: "c59",
      card_number: "PRB02-D22",
      source_url:
        "https://onepiece-card-atari.jp/expansion/one-piece-card-the-best-vol2/card/prb-02-d22/d-sp",
    },
    {
      id: "c68",
      card_number: "PRB02-D17",
      source_url:
        "https://onepiece-card-atari.jp/expansion/one-piece-card-the-best-vol2/card/prb-02-d17/d-sp",
    },
    {
      id: "c55",
      card_number: "PRB02-D18",
      source_url:
        "https://onepiece-card-atari.jp/expansion/one-piece-card-the-best-vol2/card/prb-02-d18/d-sp",
    },
  ];

  for (const c of exact) {
    const { error } = await supabase
      .from("cards")
      .update({
        card_number: c.card_number,
        source_url: c.source_url,
        data_quality: "real",
      })
      .eq("id", c.id);
    if (error) console.error(c.id, error);
    else console.log("backfilled", c.id, c.card_number);
  }

  // c29 Nami: our stored 5,600 was one shop's high listing, not the
  // multi-shop average (4,090). Correct it to the average and backfill URL.
  const { error: e29 } = await supabase
    .from("cards")
    .update({
      card_number: "PRB02-012",
      current_price: 4090,
      source_url:
        "https://onepiece-card-atari.jp/expansion/one-piece-card-the-best-vol2/card/prb02-012/r-p",
      data_quality: "real",
      source_note:
        "onepiece-card-atari.jp の個別カードページを参照。以前保存されていた¥5,600は複数店平均ではなく単一店舗の最高値だったため、複数店平均値（¥4,090）に修正しました。",
      updated_at: new Date().toISOString(),
    })
    .eq("id", "c29");
  if (e29) console.error("c29", e29);
  else console.log("fixed c29 price 5600 -> 4090");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
