// Stand-in for "@supabase/supabase-js", redirected to here by loader.mjs for
// migration/verify_cron_time_budget.mjs only. createClient() reads a client
// object the test script places on globalThis right before each GET() call,
// so each scenario can configure fresh mock behavior.
export function createClient() {
  if (!globalThis.__SUPABASE_MOCK__) {
    throw new Error("supabase mock not configured — set globalThis.__SUPABASE_MOCK__ before calling GET()");
  }
  return globalThis.__SUPABASE_MOCK__;
}
