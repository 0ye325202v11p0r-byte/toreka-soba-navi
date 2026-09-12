// Regression test for src/lib/format.ts's safeJsonLdString() — escapes "<"
// before embedding JSON-LD via dangerouslySetInnerHTML, so scraped
// third-party text (card names come from expand_catalog.mjs/
// scrape_yuyutei.mjs parsing external sites' HTML) can't close the
// <script type="application/ld+json"> tag early and inject new HTML.
// Found via self-review, 2026-09-12 — not a confirmed exploited case, but a
// real gap: plain JSON.stringify() does not escape "<".
//
// Imports the REAL src/lib/format.ts. Run: `node --experimental-strip-types
// migration/verify_format.mjs`. A MODULE_TYPELESS_PACKAGE_JSON warning on
// stderr is expected and harmless.
import { safeJsonLdString } from "../src/lib/format.ts";

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) process.exitCode = 1;
}

// T1: the attack this exists to prevent — a name containing a literal
// "</script>" must not appear as literal "<" in the output text (it must
// come out as the escaped \u003c sequence instead).
{
  const evil = { name: "Evil</script><script>alert(1)</script>" };
  const out = safeJsonLdString(evil);
  assertEqual(out.includes("<"), false, "T1 no literal '<' character survives in the output string");
  // Only "<" needs escaping (not ">") — the browser's HTML tokenizer looks
  // for a literal "<" to begin recognizing any tag at all, so neutralizing
  // "<" alone is sufficient; the trailing ">" is inert without it.
  assertEqual(out.includes("\\u003c/script>"), true, "T1b the escaped form of </script> ('\\u003c/script>') is present instead");
}

// T2: round-trips correctly — a consumer that JSON.parse()s the emitted
// string (as a browser's structured-data parser, or a test, would) must
// get back the exact original object, "<" included.
{
  const original = { name: "A < B", ok: true, n: 5 };
  const out = safeJsonLdString(original);
  const parsed = JSON.parse(out);
  assertEqual(JSON.stringify(parsed), JSON.stringify(original), "T2 JSON.parse(safeJsonLdString(x)) round-trips to x");
}

// T3: ordinary data with no "<" at all is unaffected byte-for-byte except
// for the escaping logic simply having nothing to do.
{
  const plain = { a: 1, b: "hello", c: [1, 2, 3] };
  assertEqual(safeJsonLdString(plain), JSON.stringify(plain), "T3 plain data with no '<' matches plain JSON.stringify output");
}

// T4: multiple occurrences of "<" all get escaped, not just the first.
{
  const multi = { s: "<<<script>>>" };
  const out = safeJsonLdString(multi);
  assertEqual((out.match(/</g) ?? []).length, 0, "T4 every '<' occurrence is escaped, not just the first");
}

console.log("\nAll format.ts (safeJsonLdString) checks completed.");
