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
  return nextResolve(specifier, context);
}
