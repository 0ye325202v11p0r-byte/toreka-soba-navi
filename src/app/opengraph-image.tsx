import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#efe7d2",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "#a9741f",
            color: "#fbf7ea",
            fontSize: 80,
            fontWeight: 700,
            marginBottom: 32,
          }}
        >
          ¥
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#1e2a38" }}>トレカ相場ナビ</div>
        <div style={{ display: "flex", fontSize: 32, color: "#63625a", marginTop: 16 }}>
          ONE PIECEカードゲームの実測相場を毎日追跡
        </div>
      </div>
    ),
    { ...size }
  );
}
