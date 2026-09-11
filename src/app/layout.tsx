import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { SITE_URL } from "@/lib/site";

const SITE_NAME = "トレカ相場ナビ";
const SITE_DESCRIPTION =
  "ONE PIECEカードゲームの実測相場を毎日追跡。保有カードの含み損益・実現損益を自動計算するポートフォリオ、価格変動を知らせるウォッチリスト、複数カード比較も無料で使えます。";

// tints mobile browser chrome (e.g. Android Chrome's address bar) with the
// brand color, matching --accent / --bg from globals.css per color scheme
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efe7d2" },
    { media: "(prefers-color-scheme: dark)", color: "#14191f" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "ワンピースカード",
    "ONE PIECEカードゲーム",
    "相場",
    "価格推移",
    "トレカ",
    "ポートフォリオ",
    "損益管理",
  ],
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <NavBar />
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
