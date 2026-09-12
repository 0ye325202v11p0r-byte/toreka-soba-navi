import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { yen, pct } from "@/lib/format";
import { isYuyuteiSourceEnabled } from "@/lib/appSettings";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ImageResponse (next/og) is rendered by Satori, which only understands
// inline styles — no Tailwind classes, no external stylesheet — so colors
// are hardcoded here rather than reusing judgmentClasses()/dataQualityLabel()
// from src/lib/format.ts (those return Tailwind class names).
function judgmentColor(judgment: string | null): { bg: string; fg: string } {
  if (judgment === "割安") return { bg: "#d9e9dd", fg: "#1f6e52" };
  if (judgment === "割高") return { bg: "#f0dacb", fg: "#a2431f" };
  return { bg: "#e7d3a6", fg: "#7e5514" };
}

export default async function CardOpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: rawCard } = await supabase
    .from("cards")
    .select("name, rarity, set_name, current_price, pct_vs_avg30, judgment, data_quality")
    .eq("id", id)
    .single();

  // Emergency kill-switch (see src/lib/appSettings.ts) — this route fetches
  // independently of src/app/cards/[id]/page.tsx (which already 404s a
  // disabled yuyu-tei-sourced card), so it needs its own check: otherwise
  // a direct request for this specific image URL would still render the
  // card's name/price even while the page itself is taken down (found
  // during a broader pass after shipping the kill-switch).
  const card =
    rawCard && rawCard.data_quality === "partial" && !(await isYuyuteiSourceEnabled(supabase))
      ? null
      : rawCard;

  const name = card?.name ?? "トレカ相場ナビ";
  // rarity/set_name are non-null for every card today, but the DB schema
  // allows null — guard so a future gap in either doesn't literally render
  // the word "null" onto the shared image.
  const subtitle = card ? [card.rarity, card.set_name].filter(Boolean).join(" ・ ") || null : null;
  const colors = judgmentColor(card?.judgment ?? null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#efe7d2",
          fontFamily: "sans-serif",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: "#63625a" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "#a9741f",
              color: "#fbf7ea",
              fontSize: 22,
              fontWeight: 700,
              marginRight: 12,
            }}
          >
            ¥
          </div>
          トレカ相場ナビ
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#1e2a38", lineHeight: 1.2 }}>
            {name}
          </div>
          {subtitle && (
            <div style={{ display: "flex", fontSize: 28, color: "#63625a", marginTop: 12 }}>{subtitle}</div>
          )}
        </div>

        {card?.current_price != null && (
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 24, color: "#63625a" }}>現在価格</div>
              <div style={{ display: "flex", fontSize: 80, fontWeight: 700, color: "#1e2a38" }}>
                {yen(card.current_price)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              {card.pct_vs_avg30 != null && (
                <div style={{ display: "flex", fontSize: 36, color: "#63625a", marginBottom: 12 }}>
                  30日平均比 {pct(card.pct_vs_avg30)}
                </div>
              )}
              {card.judgment && (
                <div
                  style={{
                    display: "flex",
                    fontSize: 32,
                    fontWeight: 700,
                    color: colors.fg,
                    background: colors.bg,
                    borderRadius: 999,
                    padding: "10px 32px",
                  }}
                >
                  {card.judgment}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    ),
    { ...size }
  );
}
