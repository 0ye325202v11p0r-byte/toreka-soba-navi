// Shared yuyu-tei.jp (遊々亭) set-list-page parsing logic, used by both:
//   - migration/scrape_yuyutei.mjs (one-time catalog expansion — inserts
//     new `cards` rows)
//   - src/app/api/cron/refresh-yuyutei-prices/route.ts (daily price
//     tracking for cards already inserted from this source)
// Kept in one place so a future yuyu-tei markup change only needs fixing
// once — this exact regex used to live duplicated in the migration script
// only; extracted here (2026-09-12) when the daily-tracking cron needed the
// identical parsing logic, to avoid two copies silently drifting apart
// (the same "test/import the real thing, don't reimplement" principle this
// project already applies to pnl.ts/priceStats.ts).
//
// Verified against a live fetch of https://yuyu-tei.jp/sell/opc/s/op01 on
// 2026-09-12 (134 card listings matched, prices/names parsed correctly) —
// the page structure this regex depends on was still current as of that
// check.

export const YUYUTEI_USER_AGENT =
  "TorekaSobaNaviBot/1.0 (+https://github.com/0ye325202v11p0r-byte/toreka-soba-navi; catalog expansion for a personal One Piece TCG tracker; price data only, no image/content reproduction)";

// The full set of yuyu-tei set-list pages this project has ever scraped
// (migration/README.md: OP01-17 main sets, all ST starter decks, all EB
// extra boosters, scraped 2026-09-11). Used both by the one-time migration
// script (subset via --sets) and the daily cron (always all of them, since
// re-fetching a set page is cheap — one request per set, not per card).
export const ALL_YUYUTEI_SETS = [
  ...Array.from({ length: 17 }, (_, i) => `op${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 36 }, (_, i) => `st${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 4 }, (_, i) => `eb${String(i + 1).padStart(2, "0")}`),
];

export const RARITY_MAP: Record<string, string> = {
  "P-SEC": "SECパラレル",
  SEC: "SEC",
  "P-SR": "SRパラレル",
  SR: "SR",
  "P-R": "Rパラレル",
  R: "R",
  UC: "UC",
  C: "C",
  "P-L": "Lパラレル",
  L: "L",
  "P-SP": "SPパラレル",
  SP: "SP",
  "P-UC": "UCパラレル",
  "P-C": "Cパラレル",
  TR: "TR",
  "P-TR": "TRパラレル",
};

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export interface ParsedYuyuteiCard {
  setSlug: string;
  numericId: string;
  cardNumber: string;
  name: string;
  rarityLabel: string | null;
  price: number;
  url: string;
}

// Parses one set-list page: groups are announced by a rarity header, each
// followed by a run of .card-product blocks until the next header.
export function parseSetPage(html: string): { setName: string | null; cards: ParsedYuyuteiCard[] } {
  const titleMatch = html.match(/<title>\[[a-z0-9]+\]([^|<]+)/i);
  const setName = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null;

  const cards: ParsedYuyuteiCard[] = [];
  let currentRarityLabel: string | null = null;

  // walk the document as a stream of "rarity header" and "card block" tokens
  const tokenRe =
    /class="py-2 d-inline-block px-2 me-2 text-white fw-bold">([^<]+)<|href="https:\/\/yuyu-tei\.jp\/sell\/opc\/card\/([a-z0-9]+)\/(\d+)"><div\s+class="position-relative product-img">\s*<img\s+src="([^"]+)"\s+alt="([^"]+)"[^>]*class="card[^"]*"\/>[\s\S]{0,400}?<span\s+class="d-block border border-dark p-1 w-100 text-center my-2">([^<]+)<\/span>\s*<a\s+href="[^"]+"><h4 class="text-primary fw-bold">([^<]+)<\/h4>\s*<\/a>\s*<strong\s+class="d-block text-end\s*">\s*([\d,]+)\s*円/g;

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html))) {
    if (m[1] !== undefined) {
      currentRarityLabel = m[1].trim();
      continue;
    }
    const [, , setSlug, numericId, , , cardNumber, name, priceStr] = m;
    cards.push({
      setSlug,
      numericId,
      cardNumber: cardNumber.trim(),
      name: decodeHtmlEntities(name.trim()),
      rarityLabel: currentRarityLabel,
      price: Number(priceStr.replace(/,/g, "")),
      url: `https://yuyu-tei.jp/sell/opc/card/${setSlug}/${numericId}`,
    });
  }

  return { setName, cards };
}
