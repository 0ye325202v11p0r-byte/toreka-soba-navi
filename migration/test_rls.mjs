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

  // 6-9 added 2026-09-12 alongside the yuyu-tei kill-switch (app_settings)
  // and daily-tracking cron (yuyutei_sync_runs) tables. Both are new
  // tables not yet created in production as of this writing — if either
  // check below errors with something like "relation ... does not exist"
  // rather than a clean pass/fail, that's expected until
  // migration/README.md's manual setup step is done, not a real result.

  // 6. Anonymous read of app_settings SHOULD succeed (intentionally public
  // — src/lib/appSettings.ts needs to read this without authentication,
  // from server components that may run for a logged-out visitor).
  const { data: settingsData, error: settingsErr } = await supabase
    .from("app_settings")
    .select("key, value")
    .limit(5);
  console.log(
    "6. anon can read app_settings:",
    settingsErr ? `FAIL (${settingsErr.message})` : `OK (got ${settingsData.length} row(s))`
  );

  // 7. Anonymous write to app_settings should FAIL — this table is meant
  // to be flipped only via the Supabase SQL Editor (table owner) or the
  // service_role key, never by anything reachable with the public anon
  // key. A write succeeding here would mean anyone could re-enable a
  // takedown-disabled scraper, or disable it as harassment.
  const { error: settingsWriteErr } = await supabase
    .from("app_settings")
    .update({ value: false })
    .eq("key", "yuyutei_source_enabled");
  console.log(
    "7. anon CANNOT write app_settings (should fail):",
    settingsWriteErr ? "OK (blocked)" : "FAIL — WRITE SUCCEEDED, THIS IS A SECURITY HOLE (anyone could flip the kill-switch)"
  );

  // 8. Anonymous read of yuyutei_sync_runs should return nothing — same
  // authenticated-only policy as sync_runs (not anon-readable, unlike
  // cards/price_snapshots/app_settings).
  const { data: yuyuteiRunsData, error: yuyuteiRunsErr } = await supabase
    .from("yuyutei_sync_runs")
    .select("*");
  console.log(
    "8. anon reading yuyutei_sync_runs returns nothing:",
    yuyuteiRunsErr
      ? `ERROR (${yuyuteiRunsErr.message})`
      : `${yuyuteiRunsData.length === 0 ? "OK (empty)" : "FAIL — got " + yuyuteiRunsData.length + " rows"}`
  );

  // 9. Anonymous write to yuyutei_sync_runs should FAIL — only the cron
  // (service_role) may write here.
  const { error: yuyuteiRunsWriteErr } = await supabase.from("yuyutei_sync_runs").insert({
    total_count: 0,
    success_count: 0,
    fail_count: 0,
  });
  console.log(
    "9. anon CANNOT insert yuyutei_sync_runs (should fail):",
    yuyuteiRunsWriteErr ? "OK (blocked)" : "FAIL — INSERT SUCCEEDED, THIS IS A SECURITY HOLE"
  );

  console.log("\n=== done ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
