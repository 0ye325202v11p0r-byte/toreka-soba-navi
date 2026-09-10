// Security sanity check: use the PUBLIC anon key (never the service role
// key) to confirm RLS actually blocks what it should. This simulates what
// an attacker with just the browser's anon key could attempt.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log("=== RLS security check (using anon/publishable key) ===\n");

  // 1. Public read of cards should succeed (intended)
  const { data: readCards, error: readErr } = await supabase
    .from("cards")
    .select("id")
    .limit(1);
  console.log(
    "1. anon can read cards:",
    readErr ? `FAIL (${readErr.message})` : `OK (got ${readCards.length} row)`
  );

  // 2. Anonymous write to cards should FAIL
  const { error: writeCardErr } = await supabase
    .from("cards")
    .update({ current_price: 1 })
    .eq("id", "c1");
  console.log(
    "2. anon CANNOT write cards (should fail):",
    writeCardErr ? "OK (blocked)" : "FAIL — WRITE SUCCEEDED, THIS IS A SECURITY HOLE"
  );

  // 3. Anonymous (unauthenticated) read of another user's portfolio-like
  // table should return zero rows (RLS filters by auth.uid(), and anon has
  // no uid) — not an error, just empty.
  const { data: txData, error: txErr } = await supabase.from("transactions").select("*");
  console.log(
    "3. anon reading transactions returns nothing:",
    txErr ? `ERROR (${txErr.message})` : `${txData.length === 0 ? "OK (empty)" : "FAIL — got " + txData.length + " rows"}`
  );

  // 4. Anonymous insert into transactions should fail (no auth.uid() to match)
  const { error: txInsertErr } = await supabase.from("transactions").insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    card_id: "c1",
    type: "buy",
    quantity: 1,
    price_per_unit: 100,
  });
  console.log(
    "4. anon CANNOT insert transactions (should fail):",
    txInsertErr ? "OK (blocked)" : "FAIL — INSERT SUCCEEDED, THIS IS A SECURITY HOLE"
  );

  // 5. Anonymous read of subscriptions should return nothing
  const { data: subData, error: subErr } = await supabase.from("subscriptions").select("*");
  console.log(
    "5. anon reading subscriptions returns nothing:",
    subErr ? `ERROR (${subErr.message})` : `${subData.length === 0 ? "OK (empty)" : "FAIL — got " + subData.length + " rows"}`
  );

  console.log("\n=== done ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
