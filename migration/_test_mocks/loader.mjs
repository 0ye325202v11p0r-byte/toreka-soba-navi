// Node module-resolution hooks used only by
// migration/verify_cron_time_budget.mjs, so the real
// src/app/api/cron/refresh-prices/route.ts can be imported and exercised
// directly (not a hand-copied reproduction) with the Supabase client
// mocked out and TypeScript path alias "@/..." resolved without a bundler.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@supabase/supabase-js") {
    return {
      url: new URL("./supabase_js_mock.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    return {
      url: new URL(`../../src/${rel}.ts`, import.meta.url).href,
      shortCircuit: true,
    };
  }
  // Next.js's package.json has no "exports" map, so plain Node ESM
  // resolution can't find subpath imports like "next/server" the way
  // Next's own webpack/turbopack build does — it needs the literal ".js".
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // TypeScript/Next.js allow (and this project's convention uses)
    // extensionless relative imports between sibling .ts files under
    // src/lib/ (e.g. dashboardSummary.ts's `import ... from "./pnl"`) —
    // normal under the bundler's own module resolution, but plain Node ESM
    // has no such fallback and fails outright. Added 2026-09-13 when
    // dashboardSummary.ts became the first pure lib module tested this way
    // to import ANOTHER sibling lib module's real runtime function (not
    // just a type-only import, which gets erased before resolution ever
    // matters). Retries with ".ts" appended only for relative specifiers
    // with no extension already, so this doesn't mask a genuinely missing
    // package.
    if (
      err?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-zA-Z0-9]+$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
