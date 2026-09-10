// Re-run the same style of statistical anomaly detection used earlier in
// this project, but against the live Supabase data (post-migration,
// post-Phase-2-verification), to catch anything the manual spot-checks
// might have missed.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: cards, error } = await supabase.from("cards").select("*");
  if (error) throw error;
  console.log("total cards:", cards.length);

  // 1. Duplicate (card_number, rarity)
  const byKey = new Map();
  for (const c of cards) {
    if (!c.card_number) continue;
    const key = `${c.card_number.toUpperCase()}|${c.rarity}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(c.id);
  }
  const dupes = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
  console.log("\n=== duplicate (card_number, rarity) ===");
  dupes.forEach(([k, ids]) => console.log(k, ids));
  console.log("count:", dupes.length);

  // 2. currentPrice vs avg30 divergence > 90%
  console.log("\n=== currentPrice vs avg30 divergence > 90% ===");
  let bigDiv = 0;
  for (const c of cards) {
    if (c.current_price == null || c.avg30 == null || c.avg30 <= 0) continue;
    const pct = (Math.abs(c.current_price - c.avg30) / c.avg30) * 100;
    if (pct > 90) {
      console.log(c.id, c.name, "cur=", c.current_price, "avg30=", c.avg30, "pct=", pct.toFixed(1));
      bigDiv++;
    }
  }
  console.log("count:", bigDiv);

  // 3. extreme prices
  console.log("\n=== extreme price values (<50 or >5,000,000) ===");
  let extreme = 0;
  for (const c of cards) {
    if (c.current_price != null && (c.current_price < 50 || c.current_price > 5000000)) {
      console.log(c.id, c.name, "currentPrice=", c.current_price);
      extreme++;
    }
  }
  console.log("count:", extreme);

  // 4. missing critical fields
  console.log("\n=== missing critical fields ===");
  let missing = 0;
  for (const c of cards) {
    const miss = ["name", "rarity", "current_price"].filter((f) => c[f] == null);
    if (miss.length) {
      console.log(c.id, c.name, "missing:", miss);
      missing++;
    }
  }
  console.log("count:", missing);

  // 5. cards with source_url but no price_snapshots at all (Phase 2 blind spot)
  console.log("\n=== cards with source_url but zero price_snapshots ===");
  const cardsWithUrl = cards.filter((c) => c.source_url);
  let zeroSnap = 0;
  for (const c of cardsWithUrl) {
    const { count } = await supabase
      .from("price_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("card_id", c.id);
    if (!count) {
      console.log(c.id, c.name);
      zeroSnap++;
    }
  }
  console.log("count:", zeroSnap);

  // 6. cards with data_quality 'flat' (should only be c9 by design now)
  console.log("\n=== data_quality = flat ===");
  const flat = cards.filter((c) => c.data_quality === "flat");
  flat.forEach((c) => console.log(c.id, c.name));
  console.log("count:", flat.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
