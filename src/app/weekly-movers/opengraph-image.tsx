import { ImageResponse } from "next/og";
import { pct } from "@/lib/format";
import { fetchWeeklyMovers } from "./page";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function WeeklyMoversOpengraphImage() {
  const { gainers, losers } = await fetchWeeklyMovers();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#efe7d2",
          fontFamily: "sans-serif",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: "#63625a", marginBottom: 24 }}>
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
          トレカ相場ナビ ｜ 今週の値上がり・値下がりランキング
        </div>

        <div style={{ display: "flex", flex: 1, gap: 32 }}>
          <MoverColumn heading="📈 値上がり" items={gainers} color="#1f6e52" />
          <MoverColumn heading="📉 値下がり" items={losers} color="#a2431f" />
        </div>
      </div>
    ),
    { ...size }
  );
}

function MoverColumn({
  heading,
  items,
  color,
}: {
  heading: string;
  items: { name: string; pct_vs_avg30: number }[];
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#1e2a38", marginBottom: 16 }}>
        {heading}
      </div>
      {items.map((c, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 26,
            color: "#1e2a38",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", maxWidth: 320, overflow: "hidden" }}>
            {i + 1}. {c.name}
          </div>
          <div style={{ display: "flex", fontWeight: 700, color }}>{pct(c.pct_vs_avg30)}</div>
        </div>
      ))}
    </div>
  );
}
