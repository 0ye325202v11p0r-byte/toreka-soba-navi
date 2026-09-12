// Regression test for src/lib/appSettings.ts — the emergency kill-switch
// for the yuyu-tei data source.
//
// Revised 2026-09-12 following Codex's independent static-code-review
// finding: the original single boolean-returning function conflated
// "not configured yet" (table/row missing — safe to default to enabled)
// with "couldn't verify right now" (a settings row DOES exist, possibly
// set to false, but this read attempt failed) — both fell back to
// "enabled", meaning a genuinely disabled switch could look re-enabled
// after a transient read error. This test verifies the fix:
// readYuyuteiSourceState() distinguishes 4 states, isYuyuteiSourceEnabled()
// (display pages) still fails open on "unconfigured"/"unknown", and
// canScrapeYuyutei() (the actual scraping cron's gate) does NOT — it
// requires positive confirmation of "enabled" or "unconfigured" and
// fails CLOSED on "unknown" (query error other than a missing table,
// thrown exception, timeout, or an unrecognized stored value).
//
// Imports the REAL src/lib/appSettings.ts. Run:
// `node --experimental-strip-types migration/verify_app_settings.mjs`
import { readYuyuteiSourceState, isYuyuteiSourceEnabled, canScrapeYuyutei } from "../src/lib/appSettings.ts";

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}

// abortSignal() is the last call before the query actually executes (the
// real code always ends with `.abortSignal(...).maybeSingle()`), so the
// mock's result/behavior is supplied there.
function chainToResult(result) {
  return {
    eq: () => chainToResult(result),
    abortSignal: () => ({
      maybeSingle: async () => {
        if (typeof result === "function") return result();
        return result;
      },
    }),
  };
}

function mockClient(result) {
  return { from: () => ({ select: () => chainToResult(result) }) };
}

function mockClientThatThrowsOnFrom() {
  return {
    from: () => {
      throw new Error("network error");
    },
  };
}

// ---- readYuyuteiSourceState: the 4 states ----
{
  const s = await readYuyuteiSourceState(mockClient({ data: { value: true }, error: null }));
  assertEqual(s, "enabled", "T1 explicit value:true -> 'enabled'");
}
{
  const s = await readYuyuteiSourceState(mockClient({ data: { value: false }, error: null }));
  assertEqual(s, "disabled", "T2 explicit value:false -> 'disabled'");
}
{
  const s = await readYuyuteiSourceState(mockClient({ data: null, error: null }));
  assertEqual(s, "unconfigured", "T3 row missing, no error -> 'unconfigured'");
}
{
  const s = await readYuyuteiSourceState(
    mockClient({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.app_settings' in the schema cache" } })
  );
  assertEqual(s, "unconfigured", "T4 PostgREST schema-cache-miss error -> 'unconfigured' (table doesn't exist yet)");
}
{
  const s = await readYuyuteiSourceState(
    mockClient({ data: null, error: { code: "42P01", message: 'relation "app_settings" does not exist' } })
  );
  assertEqual(s, "unconfigured", "T5 raw Postgres undefined_table error -> 'unconfigured'");
}
{
  const s = await readYuyuteiSourceState(mockClient({ data: null, error: { code: "500", message: "internal server error" } }));
  assertEqual(s, "unknown", "T6 a generic/unrelated query error -> 'unknown' (NOT the same as unconfigured)");
}
{
  const s = await readYuyuteiSourceState({
    from: () => {
      throw new Error("boom");
    },
  });
  assertEqual(s, "unknown", "T7 client throws synchronously -> 'unknown'");
}
{
  const s = await readYuyuteiSourceState(
    mockClient(() => {
      throw new Error("aborted: signal timed out");
    })
  );
  assertEqual(s, "unknown", "T8 the query itself throws (simulating AbortSignal.timeout firing) -> 'unknown'");
}
{
  const s = await readYuyuteiSourceState(mockClient({ data: { value: "true" }, error: null }));
  assertEqual(s, "unknown", "T9 a non-boolean stored value -> 'unknown' (not confidently either state)");
}
{
  const s = await readYuyuteiSourceState(mockClient({ data: { value: null }, error: null }));
  assertEqual(s, "unknown", "T10 value:null stored -> 'unknown'");
}

// ---- Precision of isMissingTableError (Codex independent re-verification,
// second pass, 2026-09-12): the table exists but SOMETHING ELSE is wrong
// must classify as 'unknown', never 'unconfigured' — the app_settings
// table being present but broken in some other way still means a
// takedown request COULD have been issued through it, so this must not
// be treated the same as "nobody has set this up yet". The previous
// message-substring fallback (`includes("does not exist")` or
// `includes("schema cache")` alone) was too broad and would have
// misclassified several of these as 'unconfigured'. ----
{
  // Real PostgREST PGRST204 message shape for a missing COLUMN (not the
  // table) — table exists, this column doesn't. Contains "schema cache"
  // (the old fallback's trigger) but says nothing about a missing table.
  const s = await readYuyuteiSourceState(
    mockClient({
      data: null,
      error: { code: "PGRST204", message: "Could not find the 'value' column of 'app_settings' in the schema cache" },
    })
  );
  assertEqual(s, "unknown", "T10b column-missing error (PGRST204, names app_settings, mentions 'schema cache') -> 'unknown', NOT 'unconfigured'");
}
{
  // A schema-cache-flavored error that doesn't name this table at all.
  const s = await readYuyuteiSourceState(
    mockClient({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.some_other_table' in the schema cache" } })
  );
  assertEqual(s, "unknown", "T10c a DIFFERENT table's schema-cache-miss error -> 'unknown' (doesn't confirm app_settings is missing)");
}
{
  // Names app_settings and says "does not exist", but about a function,
  // not the table — PGRST202 is "could not find a function", not a
  // missing-table code, and was WRONGLY included as one in the original
  // implementation (fixed in this same pass).
  const s = await readYuyuteiSourceState(
    mockClient({ data: null, error: { code: "PGRST202", message: "Could not find the function public.app_settings_helper() does not exist" } })
  );
  assertEqual(s, "unknown", "T10d function-not-found error (PGRST202), even naming app_settings loosely -> 'unknown', NOT 'unconfigured'");
}
{
  // Generic ambiguous message containing "schema cache" but naming
  // neither this table nor a missing-table condition specifically.
  const s = await readYuyuteiSourceState(mockClient({ data: null, error: { code: "500", message: "schema cache reload in progress" } }));
  assertEqual(s, "unknown", "T10e ambiguous 'schema cache' message not about app_settings being missing -> 'unknown'");
}

// ---- isYuyuteiSourceEnabled: display pages, fails open on unconfigured/unknown ----
assertEqual(await isYuyuteiSourceEnabled(mockClient({ data: { value: true }, error: null })), true, "T11 display: enabled -> true");
assertEqual(await isYuyuteiSourceEnabled(mockClient({ data: { value: false }, error: null })), false, "T12 display: disabled -> false (this is the only way to actually hide anything)");
assertEqual(await isYuyuteiSourceEnabled(mockClient({ data: null, error: null })), true, "T13 display: unconfigured -> true (fail open)");
assertEqual(
  await isYuyuteiSourceEnabled(mockClient({ data: null, error: { code: "500", message: "oops" } })),
  true,
  "T14 display: unknown (generic error) -> true (fail open — no external traffic decision here)"
);
assertEqual(await isYuyuteiSourceEnabled(mockClientThatThrowsOnFrom()), true, "T15 display: client throws -> true (fail open)");

// ---- canScrapeYuyutei: the scraping cron's gate, fails CLOSED on unknown ----
assertEqual(await canScrapeYuyutei(mockClient({ data: { value: true }, error: null })), true, "T16 cron: enabled -> true (may scrape)");
assertEqual(await canScrapeYuyutei(mockClient({ data: { value: false }, error: null })), false, "T17 cron: disabled -> false (must NOT scrape)");
assertEqual(
  await canScrapeYuyutei(mockClient({ data: null, error: null })),
  true,
  "T18 cron: unconfigured (table/row genuinely absent) -> true (no takedown could have been issued through a switch that doesn't exist)"
);
// The critical property from Codex's review: a settings row that IS
// configured, but whose value this specific read couldn't determine, must
// NOT be treated the same as "confirmed enabled".
assertEqual(
  await canScrapeYuyutei(mockClient({ data: null, error: { code: "500", message: "internal server error" } })),
  false,
  "T19 cron: unknown (generic query error, NOT a missing-table error) -> false — must fail CLOSED, not resume scraping on a hunch"
);
assertEqual(
  await canScrapeYuyutei(mockClientThatThrowsOnFrom()),
  false,
  "T20 cron: client throws synchronously -> false — must fail CLOSED"
);
assertEqual(
  await canScrapeYuyutei(
    mockClient(() => {
      throw new Error("aborted: signal timed out");
    })
  ),
  false,
  "T21 cron: settings read times out -> false — must fail CLOSED, a disabled switch must not look re-enabled just because this read was slow"
);
assertEqual(
  await canScrapeYuyutei(mockClient({ data: { value: "not-a-boolean" }, error: null })),
  false,
  "T22 cron: unrecognized stored value -> false — must fail CLOSED rather than assume enabled"
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
console.log("\nAll appSettings.ts checks completed.");
