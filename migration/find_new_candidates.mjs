// Parses the raw sitemap-cards.xml dump, compares every card URL against what's
// already in Supabase, and prints the list of genuinely new candidates (with
// their reconstructed card_number/rarity/set_name) as JSON to stdout.
//
// Usage: node migration/find_new_candidates.mjs > migration/new_candidates.json

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// reverse of backfill_source_urls.mjs's SET_SLUG / RARITY_CODE
const SLUG_TO_SET = {
  "500-yeas-in-the-future": "500年後の未来",
  "anime-25th-collection": "アニメ25周年コレクション",
  "egghead-crisis": "エッグヘッドクライシス",
  "heroines-edition": "ヒロインズエディション",
  "memorial-collection": "メモリアルコレクション",
  "romance-dawn": "ロマンスドーン",
  "one-piece-card-the-best": "ワンピースカード ザベスト",
  "one-piece-card-the-best-vol2": "ワンピースカード ザベスト 2",
  "the-worlds-strongest-warriors": "世界最強の戦士",
  "two-legends": "二つの伝説",
  "wings-of-captain": "双璧の覇者",
  "carrying-on-his-will": "受け継がれる意志",
  "legacy-of-the-master": "師弟の絆",
  "mighty-enemies": "強大な敵",
  "emperors-in-the-new-world": "新たなる皇帝",
  "awakening-of-the-new-era": "新時代の主役",
  "the-time-of-battle": "決戦の刻",
  "royal-blood": "王族の血統",
  "adventure-on-kamis-island": "神の島の冒険",
  "a-fist-of-divine-speed": "神速の拳",
  "the-azure-seas-seven": "蒼海の七傑",
  "kingdoms-of-intrigue": "謀略の王国",
  "paramount-war": "頂上決戦",
};

const CODE_TO_RARITY = {
  "c-p": "Cパラレル",
  "d-sp": "Dスーパーパラレル",
  "gsp": "GSP",
  "l-p": "Lパラレル",
  "p-fp": "Pフルアートパラレル",
  "p-p": "Pパラレル",
  "r-p": "Rパラレル",
  "r-fp": "Rフルアートパラレル",
  "sec": "SEC",
  "sec-p": "SECパラレル",
  "sp": "SP",
  "sr": "SR",
  "sr-p": "SRパラレル",
  "tr": "TR",
  "uc-p": "UCパラレル",
  "uc-fp": "UCフルアートパラレル",
};

const xml = readFileSync(new URL("./sitemap-cards-raw.xml", import.meta.url), "utf-8");
const re = /<loc>(https:\/\/onepiece-card-atari\.jp\/expansion\/([a-z0-9-]+)\/card\/([a-z0-9-]+)\/([a-z0-9-]+))<\/loc>/g;
let m;
const allUrls = [];
while ((m = re.exec(xml))) {
  allUrls.push({ url: m[1], setSlug: m[2], cardSlug: m[3], rarityCode: m[4] });
}
console.error(`total sitemap card URLs: ${allUrls.length}`);

async function main() {
  const { data: existing, error } = await supabase
    .from("cards")
    .select("card_number, rarity")
    .not("card_number", "is", null);
  if (error) throw error;
  const existingSet = new Set(existing.map((c) => `${c.card_number.toUpperCase()}|${c.rarity}`));

  const candidates = [];
  let unknownSlug = 0;
  let unknownRarity = 0;
  for (const u of allUrls) {
    const setName = SLUG_TO_SET[u.setSlug];
    const rarity = CODE_TO_RARITY[u.rarityCode];
    if (!setName) {
      unknownSlug++;
      continue;
    }
    if (!rarity) {
      unknownRarity++;
      continue;
    }
    const cardNumber = u.cardSlug.toUpperCase();
    const key = `${cardNumber}|${rarity}`;
    if (existingSet.has(key)) continue;
    candidates.push({ url: u.url, setSlug: u.setSlug, setName, cardNumber, rarity, rarityCode: u.rarityCode });
  }

  console.error(`existing DB entries: ${existingSet.size}`);
  console.error(`unknown set slug: ${unknownSlug}, unknown rarity code: ${unknownRarity}`);
  console.error(`NEW candidates: ${candidates.length}`);

  const bySet = {};
  for (const c of candidates) bySet[c.setName] = (bySet[c.setName] ?? 0) + 1;
  console.error(JSON.stringify(bySet, null, 2));

  console.log(JSON.stringify(candidates, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
