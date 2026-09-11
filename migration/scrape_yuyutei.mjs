// Second data source: yuyu-tei.jp (a real card shop's "sell" — i.e. shop-
// sells-to-customer — listing pages). Investigated and approved by the user
// on 2026-09-11 as a supplementary source once onepiece-card-atari.jp's own
// individual-card pages (sitemap-cards.xml, 894 URLs) were fully exhausted.
//
// robots.txt has no blanket Disallow for generic crawlers (only named-bot
// rate limits). /info/rule (their site rules) prohibits unauthorized
// reproduction of "images and content/text" but says nothing about
// automated access — this script only extracts the bare price number and
// card identity (name/number/rarity), never their images or article text,
// consistent with how this project has always used onepiece-card-atari.jp.
//
// IMPORTANT — this source is structurally different from the primary one:
//   - It's a live shop's current listing price (today only), not a
//     multi-shop tracked average with historical charts. There is no
//     backfill possible: every card added from here starts with exactly
//     ONE snapshot (today) and will only grow a real history going forward
//     if it keeps getting scraped (not yet wired into the daily cron —
//     that's a separate follow-up, not done by this script).
//   - One fetch per SET (not per card) returns every card in that set with
//     its rarity and price in one page — much more efficient, but means
//     dedup happens per-set, not per-card via a sitemap diff.
//   - Rarity labels differ: plain "R"/"UC"/"C"/"SR"/"L"/"SEC"/"SP" (no
//     パラレル suffix) for the base/common print, "P-R"/"P-SR"/etc. for the
//     parallel print. This script maps P-X -> Xパラレル and plain X -> X,
//     matching the rarity strings already used elsewhere in this project.
//   - Every card is inserted with data_quality='partial' and
//     history_is_estimated=true, and is EXCLUDED from avg30/avg90/judgment
//     computation (those need real history) — current_price is set, the
//     rest left null, exactly like this project already treats c9.
//
// Safety: re-checks existing (card_number, rarity) keys from Supabase
// before every insert, so any overlap with the primary source (e.g. a "SP"
// or "SEC" card yuyu-tei also lists) is safely skipped, never duplicated.
//
// Usage: node migration/scrape_yuyutei.mjs [--sets op01,op02,...] [--dry-run]

import { createClient } from "@supabase/supabase-js";
import { appendFileSync } from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const setsArgIdx = args.indexOf("--sets");
const DEFAULT_SETS = Array.from({ length: 17 }, (_, i) => `op${String(i + 1).padStart(2, "0")}`);
const SETS = setsArgIdx >= 0 ? args[setsArgIdx + 1].split(",") : DEFAULT_SETS;

const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT =
  "TorekaSobaNaviBot/1.0 (+https://github.com/0ye325202v11p0r-byte/toreka-soba-navi; catalog expansion for a personal One Piece TCG tracker; price data only, no image/content reproduction)";
const LOG_PATH = new URL("./scrape_yuyutei.log", import.meta.url);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + "\n");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Supabase/PostgREST caps a single select() at 1000 rows by default. Once
// the catalog passed 1000 cards (during this exact expansion), an
// unpaginated fetch here silently returned only a subset of existing
// (id, card_number, rarity) rows — corrupting both the dedup check (missed
// real duplicates) and the next-id counter (collided with real ids),
// causing an entire scrape run to fail every single insert on a primary-key
// conflict. Postgres's PK constraint rejected every bad write, so no data
// was corrupted, but paginate properly so future runs actually insert.
async function fetchAllCards() {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, card_number, rarity")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

const RARITY_MAP = {
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

// Parses one set-list page: groups are announced by a rarity header, each
// followed by a run of .card-product blocks until the next header.
function parseSetPage(html) {
  const titleMatch = html.match(/<title>\[[a-z0-9]+\]([^|<]+)/i);
  const setName = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null;

  const cards = [];
  let currentRarityLabel = null;

  // walk the document as a stream of "rarity header" and "card block" tokens
  const tokenRe =
    /class="py-2 d-inline-block px-2 me-2 text-white fw-bold">([^<]+)<|href="https:\/\/yuyu-tei\.jp\/sell\/opc\/card\/([a-z0-9]+)\/(\d+)"><div\s+class="position-relative product-img">\s*<img\s+src="([^"]+)"\s+alt="([^"]+)"[^>]*class="card[^"]*"\/>[\s\S]{0,400}?<span\s+class="d-block border border-dark p-1 w-100 text-center my-2">([^<]+)<\/span>\s*<a\s+href="[^"]+"><h4 class="text-primary fw-bold">([^<]+)<\/h4>\s*<\/a>\s*<strong\s+class="d-block text-end\s*">\s*([\d,]+)\s*円/g;

  let m;
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

async function main() {
  log(`starting yuyu-tei scrape: sets=${SETS.join(",")} dry-run=${DRY_RUN}`);

  const existing = await fetchAllCards();
  const nums = existing.map((c) => parseInt(c.id.replace("c", ""), 10)).filter((n) => !isNaN(n));
  let nextId = Math.max(...nums) + 1;
  const existingKeys = new Set(existing.map((c) => `${(c.card_number ?? "").toUpperCase()}|${c.rarity}`));

  let totalFound = 0;
  let inserted = 0;
  let skippedDupe = 0;
  let skippedUnknownRarity = 0;

  for (const setSlug of SETS) {
    let html;
    try {
      const res = await fetch(`https://yuyu-tei.jp/sell/opc/s/${setSlug}`, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        log(`SET FETCH FAILED ${setSlug}: HTTP ${res.status}`);
        await sleep(1500);
        continue;
      }
      html = await res.text();
    } catch (err) {
      log(`SET FETCH ERROR ${setSlug}: ${err.message}`);
      await sleep(1500);
      continue;
    }

    const { setName, cards } = parseSetPage(html);
    totalFound += cards.length;
    log(`${setSlug} (${setName ?? "?"}): found ${cards.length} card listings`);

    let skippedCrossSet = 0;
    for (const c of cards) {
      const rarity = RARITY_MAP[c.rarityLabel];
      if (!rarity) {
        skippedUnknownRarity++;
        continue;
      }
      // normalize e.g. "OP13-118" from card_number; some listings append
      // extra descriptors in parentheses to the name, not the number, so
      // card_number itself should already be clean
      const cardNumber = c.cardNumber.toUpperCase();

      // some set-list pages embed bonus/reprint cards whose card_number
      // belongs to a DIFFERENT original set (e.g. a "Don!!" card reprinted
      // inside this box but numbered from its original debut set). Their
      // true set_name is that original set, not this page's — rather than
      // guess, skip them here the same way this project already treats
      // other cross-set ambiguity (accuracy over completeness)
      const numberSetPrefix = cardNumber.match(/^([A-Z]+\d+)/)?.[1]?.toLowerCase();
      if (numberSetPrefix && numberSetPrefix !== setSlug) {
        skippedCrossSet++;
        continue;
      }
      const key = `${cardNumber}|${rarity}`;
      if (existingKeys.has(key)) {
        skippedDupe++;
        continue;
      }
      if (!c.price || c.price <= 0) {
        continue; // sold-out/no-price listings carry no usable price
      }

      if (DRY_RUN) {
        log(`WOULD INSERT ${cardNumber} ${rarity} — ${c.name} ¥${c.price.toLocaleString("ja-JP")}`);
        existingKeys.add(key);
        inserted++;
        continue;
      }

      const id = `c${nextId++}`;
      const { error: cardErr } = await supabase.from("cards").insert({
        id,
        name: c.name,
        rarity,
        set_name: setName,
        card_number: cardNumber,
        source_url: c.url,
        current_price: c.price,
        avg30: null,
        avg90: null,
        pct_vs_avg30: null,
        pct_vs_avg90: null,
        low30: null,
        change_amt30: null,
        judgment: null,
        trend_direction: null,
        data_quality: "partial",
        history_is_estimated: true,
        ai_verdict: null,
        ai_verdict_text: null,
        ai_verdict_at: null,
        source_note:
          "このカードは遊々亭の店頭販売価格（1店舗・単発）のみを元にした参考値です。複数店舗の平均を追跡する他のカードとは性質が異なり、統計値（30日/90日平均など）はまだ算出できるだけの履歴がありません。",
      });
      if (cardErr) {
        log(`DB INSERT FAILED ${cardNumber} ${rarity}: ${cardErr.message}`);
        continue;
      }
      const { error: snapErr } = await supabase
        .from("price_snapshots")
        .insert({ card_id: id, snapshot_date: TODAY, price: c.price });
      if (snapErr) {
        log(`SNAPSHOT INSERT FAILED ${cardNumber} ${rarity}: ${snapErr.message}`);
        continue;
      }

      existingKeys.add(key);
      inserted++;
      log(`OK ${id} ${cardNumber} ${rarity} (${setName}) — ${c.name} ¥${c.price.toLocaleString("ja-JP")}`);
    }

    log(`  ${setSlug}: skippedCrossSet=${skippedCrossSet}`);
    await sleep(1500); // polite rate limit — one request per set, still spaced out
  }

  log(
    `\nDONE. sets=${SETS.length} totalListingsFound=${totalFound} inserted=${inserted} skippedDupe=${skippedDupe} skippedUnknownRarity=${skippedUnknownRarity}`
  );
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
