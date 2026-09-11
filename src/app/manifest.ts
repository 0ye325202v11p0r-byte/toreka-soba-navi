import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "トレカ相場ナビ",
    short_name: "トレカ相場ナビ",
    // see layout.tsx's SITE_DESCRIPTION comment: "実測相場を毎日追跡"
    // overclaimed for the 74% single-shop/never-updated part of the
    // catalog (fixed 2026-09-12)
    description: "ONE PIECEカードゲームの価格情報サイト（実測データと参考価格をデータ品質表示付きで掲載）。",
    start_url: "/",
    display: "standalone",
    background_color: "#efe7d2",
    theme_color: "#a9741f",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
