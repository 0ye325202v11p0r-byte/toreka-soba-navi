import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "トレカ相場ナビ",
    short_name: "トレカ相場ナビ",
    description: "ONE PIECEカードゲームの実測相場を毎日追跡。",
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
