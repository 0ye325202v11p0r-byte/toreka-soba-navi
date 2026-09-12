import type { SupabaseClient } from "@supabase/supabase-js";

// Emergency kill-switch for the yuyu-tei data source. Addresses a
// residual gap flagged when the user accepted the legal risk of scraping
// yuyu-tei.jp (README.md "遊々亭ソースの法務リスクについて", 2026-09-12):
// accepting the risk is not the same as having a way to comply quickly if
// yuyu-tei ever actually asks this project to stop. This flag is meant to
// be flipped in seconds (a single UPDATE in the Supabase SQL Editor — no
// redeploy needed) and take effect on the very next request or cron run:
//   update public.app_settings set value = 'false'::jsonb
//     where key = 'yuyutei_source_enabled';
//
// Deliberately fails OPEN (returns true / "still enabled") if the
// app_settings table doesn't exist yet, or the row is missing, or the
// query errors — the absence of this table/row means "not configured",
// not "a takedown request was received". Only an explicit `false` value
// actually disables the source. This mirrors how the rest of this
// project's data_quality checks fail safe in the *opposite* direction
// (assume untracked/unverified on doubt) — here, "doubt" about a
// safety-relevant kill switch must not itself trip the switch, or a
// transient DB hiccup would silently take down a whole data source with
// no one asking for that.
//
// Two call sites care about this, for two different reasons:
//   - src/app/api/cron/refresh-yuyutei-prices/route.ts: MUST check this
//     before making any request to yuyu-tei.jp at all — this is the "stop
//     sending them traffic" half of a takedown request.
//   - src/app/page.tsx / src/app/cards/[id]/page.tsx: check this to
//     exclude/hide already-collected yuyu-tei-sourced (data_quality=
//     'partial') cards from public pages — this is the "stop republishing
//     their data" half.
// Typed as the base SupabaseClient (default generics) rather than a
// hand-written structural interface — Supabase's query builder is a
// thenable, not a plain Promise, and a hand-rolled shape for it fights
// TypeScript's structural checking. Both callers' clients (the
// request-scoped server client from src/lib/supabase/server.ts, and the
// service_role admin client the cron route builds) are SupabaseClient
// instances, so this accepts either.
export async function isYuyuteiSourceEnabled(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "yuyutei_source_enabled")
      .maybeSingle();
    if (error || !data) return true; // table/row missing, or query failed -> fail open
    return data.value !== false;
  } catch {
    return true; // network/client error -> fail open
  }
}
