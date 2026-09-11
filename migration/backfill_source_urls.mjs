// One-time backfill: reconstruct each card's onepiece-card-atari.jp URL from
// its set_name + rarity + card_number, so the Phase 2 cron scraper knows
// where to fetch each card's latest price from.
//
// Cards whose card_number carries a non-standard suffix (e.g. "-G", "-S",
// "-TEAM", "-1") are deliberately skipped rather than guessed — a wrong URL
// is worse than no URL, since the scraper would silently start tracking the
// wrong card's price. Those stay source_url = null and are simply excluded
// from Phase 2's automated refresh for now; they can be backfilled by hand
// later the same way c9 was fixed.
//
// Usage: node migration/backfill_source_urls.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SET_SLUG = {
  "500年後の未来": "500-yeas-in-the-future",
  "アニメ25周年コレクション": "anime-25th-collection",
  "エッグヘッドクライシス": "egghead-crisis",
  "ヒロインズエディション": "heroines-edition",
  "メモリアルコレクション": "memorial-collection",
  "ロマンスドーン": "romance-dawn",
  "ワンピースカード ザベスト": "one-piece-card-the-best",
  "ワンピースカード ザベスト 2": "one-piece-card-the-best-vol2",
  "世界最強の戦士": "the-worlds-strongest-warriors",
  "二つの伝説": "two-legends",
  "双璧の覇者": "wings-of-captain",
  "受け継がれる意志": "carrying-on-his-will",
  "師弟の絆": "legacy-of-the-master",
  "強大な敵": "mighty-enemies",
  "新たなる皇帝": "emperors-in-the-new-world",
  "新時代の主役": "awakening-of-the-new-era",
  "決戦の刻": "the-time-of-battle",
  "王族の血統": "royal-blood",
  "神の島の冒険": "adventure-on-kamis-island",
  "神速の拳": "a-fist-of-divine-speed",
  "蒼海の七傑": "the-azure-seas-seven",
  "謀略の王国": "kingdoms-of-intrigue",
  "頂上決戦": "paramount-war",
};

const RARITY_CODE = {
  "Cパラレル": "c-p",
  "Dスーパーパラレル": "d-sp",
  "GSP": "gsp",
  "Lパラレル": "l-p",
  "Pフルアートパラレル": "p-fp",
  "Pパラレル": "p-p",
  "Rパラレル": "r-p",
  "Rフルアートパラレル": "r-fp",
  "SEC": "sec",
  "SECパラレル": "sec-p",
  "SP": "sp",
  "SR": "sr",
  "SRパラレル": "sr-p",
  "TR": "tr",
  "UCパラレル": "uc-p",
  "UCフルアートパラレル": "uc-fp",
};

// card_number values we consider "standard": letters+digits, a hyphen, more
// digits, nothing else (e.g. "OP15-047", "EB04-013"). Anything with an
// extra trailing suffix ("-R", "-G", "-TEAM", "-1", ...) is skipped.
const STANDARD_CARD_NUMBER = /^[A-Z]{1,4}\d{1,3}-\d{2,3}$/;

// Supabase/PostgREST caps a single select() at 1000 rows by default; the
// catalog passed 1000 cards in the 2026-09-11 expansion, so this must
// paginate or it will silently skip real cards past row 1000.
async function fetchAllCards() {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, set_name, rarity, card_number")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const cards = await fetchAllCards();

  let updated = 0;
  let skippedNoSlug = 0;
  let skippedNoCode = 0;
  let skippedNoNumber = 0;
  let skippedNonStandard = 0;
  const updates = [];

  for (const c of cards) {
    const slug = SET_SLUG[c.set_name];
    const code = RARITY_CODE[c.rarity];
    if (!c.card_number) {
      skippedNoNumber++;
      continue;
    }
    if (!slug) {
      skippedNoSlug++;
      continue;
    }
    if (!code) {
      skippedNoCode++;
      continue;
    }
    if (!STANDARD_CARD_NUMBER.test(c.card_number)) {
      skippedNonStandard++;
      continue;
    }
    const url = `https://onepiece-card-atari.jp/expansion/${slug}/card/${c.card_number.toLowerCase()}/${code}`;
    updates.push({ id: c.id, source_url: url });
  }

  console.log(`total cards: ${cards.length}`);
  console.log(`will update: ${updates.length}`);
  console.log(
    `skipped — no set slug: ${skippedNoSlug}, no rarity code: ${skippedNoCode}, no card_number: ${skippedNoNumber}, non-standard card_number: ${skippedNonStandard}`
  );

  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    for (const u of batch) {
      const { error: upErr } = await supabase
        .from("cards")
        .update({ source_url: u.source_url })
        .eq("id", u.id);
      if (upErr) {
        console.error("failed", u.id, upErr.message);
        continue;
      }
      updated++;
    }
    console.log(`  ${Math.min(i + 100, updates.length)}/${updates.length}`);
  }

  console.log(`done. updated ${updated} cards with source_url.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
