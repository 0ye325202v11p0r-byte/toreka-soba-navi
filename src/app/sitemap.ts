import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { isYuyuteiSourceEnabled } from "@/lib/appSettings";

// Without this, Next prerenders sitemap.xml once at build time and it never
// changes until the next deploy — newly-added cards (via migration scripts,
// not the daily price cron) would be invisible to crawlers indefinitely.
// Regenerate at most once an hour.
export const revalidate = 3600;

// Public, anon-key client with no cookie/session dependency — sitemap
// generation has no request context to read cookies from, and cards are
// publicly readable anyway (same data the market list shows logged-out
// users), so this mirrors that same access level rather than the
// cookie-based server client used elsewhere.
function publicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

// Supabase/PostgREST caps a single select() at 1000 rows by default; the
// catalog is 3,270+ cards, so this must page through results (see
// README.md's "カードデータの収録範囲" for the full story on this bug class).
async function fetchAllCardIds() {
  const supabase = publicClient();
  let all: { id: string; updated_at: string; data_quality: string | null }[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    // .order() is required, not optional: without any ORDER BY, Postgres
    // makes no guarantee of consistent row order between the separate
    // range() calls this loop issues, so pages could skip or repeat rows.
    // Throwing on error (rather than silently breaking as if this page
    // were the last one) matters here too — the caller's try/catch falls
    // back to a static-only sitemap, which is a real fallback only if this
    // actually throws instead of returning a quietly-truncated card list.
    const { data, error } = await supabase
      .from("cards")
      .select("id, updated_at, data_quality")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data ?? []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  // Emergency kill-switch (see src/lib/appSettings.ts) — a sitemap entry is
  // itself a form of publishing a URL, so a disabled yuyu-tei-sourced card
  // (data_quality='partial') shouldn't be announced here even though the
  // page itself already 404s (cards/[id]/page.tsx) — this just keeps
  // crawlers from being pointed at a URL that will 404, on top of that.
  if (!(await isYuyuteiSourceEnabled(supabase))) {
    all = all.filter((c) => c.data_quality !== "partial");
  }
  return all;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/compare`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];

  let cardPages: MetadataRoute.Sitemap = [];
  try {
    const cards = await fetchAllCardIds();
    cardPages = cards.map((c) => ({
      url: `${SITE_URL}/cards/${c.id}`,
      lastModified: c.updated_at,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch {
    // if Supabase is unreachable at build/request time, still return the
    // static pages rather than failing the whole sitemap
  }

  return [...staticPages, ...cardPages];
}
