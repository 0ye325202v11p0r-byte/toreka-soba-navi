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
// REVISED 2026-09-12 following Codex's independent static-code-review
// finding: the original single boolean-returning function conflated two
// different situations under "fail open" —
//   (a) the row genuinely doesn't exist (nobody has configured this yet —
//       correctly safe to default to "enabled", since no takedown request
//       could have been issued through a switch that was never set up)
//   (b) the row DOES exist (someone configured this, possibly to `false`)
//       but THIS PARTICULAR read attempt failed — timeout, network blip,
//       unexpected error shape, or a stored value that isn't literally
//       `true`/`false`
// Treating (b) the same as (a) meant a card already disabled via an
// explicit `false` could have scraping silently RESUME on any later run
// where the settings read merely happened to hiccup — the exact opposite
// of what a "stop guarantee" needs to mean. readYuyuteiSourceState() below
// distinguishes these as "unconfigured" (a) vs "unknown" (b); callers then
// choose deliberately how to treat each, rather than both collapsing into
// one fail-open boolean.
const SETTINGS_READ_TIMEOUT_MS = 5_000;

export type YuyuteiSourceState = "enabled" | "disabled" | "unconfigured" | "unknown";

// PostgREST reports a table missing from its schema cache as PGRST205;
// the underlying Postgres "undefined_table" error is 42P01. Both are
// checked, since which one actually reaches the client can depend on the
// PostgREST/Supabase version and request path — neither has been
// observed against a real deployment of this exact table (this project
// has no live Supabase access in this session).
//
// REVISED 2026-09-12 (Codex independent re-verification, THIRD pass):
// two earlier message-text fallbacks were each found too broad in turn —
// first a bare `includes("does not exist") || includes("schema cache")`,
// then a tightened "(table|relation) + (does not exist|could not find) +
// app_settings" combination that still matched Postgres's genuine
// undefined_column error (42703), whose message reads e.g. `column
// "app_settings.value" of relation "app_settings" does not exist` — this
// mentions "relation", "does not exist", AND "app_settings" while still
// being a column-level problem, not a missing table.
//
// Per Codex's guidance: stop trying to recognize "table is missing" from
// message text at all. Only the two known, unambiguous error CODES count;
// everything else (a different code, or no code) is "unknown", not
// "unconfigured" — deliberately erring toward failing closed (scraping
// stays off) for any error shape this project hasn't actually observed in
// production, rather than guessing from prose that keeps turning out to
// have another legitimate meaning. Once the app_settings table exists in
// production and a real error is actually observed, add compatibility
// for that SPECIFIC confirmed shape then — not preemptively from guesses.
function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code: unknown }).code) : "";
  if (code !== "42P01" && code !== "PGRST205") return false;
  // This function's only caller queries `app_settings` exclusively, so a
  // PGRST205/42P01 error from THAT query can only genuinely be about
  // app_settings — this name check is pure defense-in-depth against a
  // malformed or unexpected error object reusing one of these codes for
  // something else, not a general-purpose text heuristic.
  const message =
    "message" in error ? String((error as { message: unknown }).message).toLowerCase() : "";
  return message.includes("app_settings");
}

// Typed as the base SupabaseClient (default generics) rather than a
// hand-written structural interface — Supabase's query builder is a
// thenable, not a plain Promise, and a hand-rolled shape for it fights
// TypeScript's structural checking. Both callers' clients (the
// request-scoped server client from src/lib/supabase/server.ts, and the
// service_role admin client the cron route builds) are SupabaseClient
// instances, so this accepts either.
export async function readYuyuteiSourceState(supabase: SupabaseClient): Promise<YuyuteiSourceState> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "yuyutei_source_enabled")
      .abortSignal(AbortSignal.timeout(SETTINGS_READ_TIMEOUT_MS))
      .maybeSingle();
    if (error) return isMissingTableError(error) ? "unconfigured" : "unknown";
    if (!data) return "unconfigured"; // table exists, but no row for this key yet
    if (data.value === true) return "enabled";
    if (data.value === false) return "disabled";
    return "unknown"; // some other stored value — not confidently either state
  } catch {
    // Includes AbortSignal.timeout() firing, and any other thrown/network
    // error the client surfaces as an exception rather than {error}.
    return "unknown";
  }
}

// For DISPLAY-only callers (the public pages that decide whether to show
// already-collected yuyu-tei data — src/app/page.tsx, cards/[id]/page.tsx
// (both the page body and generateMetadata), compare/page.tsx, sitemap.ts,
// cards/[id]/opengraph-image.tsx): both "unconfigured" and "unknown" fail
// open (show the data). No external traffic decision is made by these
// callers, so a transient read failure hiding the entire catalog on every
// page load would be a disproportionate response to a DB hiccup — the
// worst case is briefly-stale visibility, not a broken stop guarantee.
export async function isYuyuteiSourceEnabled(supabase: SupabaseClient): Promise<boolean> {
  const state = await readYuyuteiSourceState(supabase);
  return state !== "disabled";
}

// For the ONE caller that actually sends new requests to yuyu-tei.jp
// (src/app/api/cron/refresh-yuyutei-prices/route.ts): this is the
// safety-critical gate Codex's review was about. Only a CONFIRMED
// "enabled" or a CONFIRMED "unconfigured" (the table/row genuinely doesn't
// exist — so no takedown request could have been issued through it)
// permit scraping to proceed. "unknown" — a read failure, timeout,
// exception, or an unrecognized stored value — must NOT permit scraping:
// we cannot rule out that an explicit `false` is sitting there and this
// read simply failed to observe it. This is deliberately stricter than
// isYuyuteiSourceEnabled() above.
//
// Trade-off this makes explicit: until the app_settings table is created
// in production (see migration/README.md), every check here returns
// "unconfigured" -> scraping proceeds normally, identical to today's
// behavior with no kill-switch at all. The stop guarantee only exists
// from the moment the table (and its default `true` row) is created
// onward; before that, there is nothing to fail closed *about* — there is
// no switch yet, only the absence of one, which is the same state as
// "not yet asked to stop."
export async function canScrapeYuyutei(supabase: SupabaseClient): Promise<boolean> {
  const state = await readYuyuteiSourceState(supabase);
  return state === "enabled" || state === "unconfigured";
}
