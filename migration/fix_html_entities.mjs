// One-time cleanup: the initial yuyu-tei scrape (before scrape_yuyutei.mjs
// was patched to decode HTML entities in card names) inserted some names
// with literal "&amp;", "&quot;" etc. still in them. Fixes them in place.
//
// Usage: node migration/fix_html_entities.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

async function main() {
  const { data, error } = await supabase
    .from("cards")
    .select("id, name, set_name")
    .or("name.like.%&amp;%,name.like.%&quot;%,name.like.%&#039;%,name.like.%&lt;%,name.like.%&gt;%,set_name.like.%&amp;%");
  if (error) throw error;

  console.log(`found ${data.length} rows with encoded entities`);
  let fixed = 0;
  for (const row of data) {
    const newName = decodeHtmlEntities(row.name);
    const newSetName = row.set_name ? decodeHtmlEntities(row.set_name) : row.set_name;
    if (newName === row.name && newSetName === row.set_name) continue;
    const { error: updErr } = await supabase
      .from("cards")
      .update({ name: newName, set_name: newSetName })
      .eq("id", row.id);
    if (updErr) {
      console.error(`FAILED ${row.id}:`, updErr.message);
      continue;
    }
    console.log(`fixed ${row.id}: "${row.name}" -> "${newName}"`);
    fixed++;
  }
  console.log(`\ndone. fixed ${fixed}/${data.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
