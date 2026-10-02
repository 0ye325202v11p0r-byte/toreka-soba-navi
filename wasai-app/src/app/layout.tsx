import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

export const viewport: Viewport = {
  // Always light (see globals.css) — no dark variant.
  themeColor: "#ffffff",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — 和裁士と依頼者をつなぐマッチングサービス`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ["和裁", "和裁士", "着物", "仕立て", "お直し", "マッチング", "振袖", "訪問着"],
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    locale: "ja_JP",
    type: "website",
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-bg-elevated"
        >
          メインコンテンツへスキップ
        </a>
        <NavBar />
        <main id="main-content" tabIndex={-1} className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 outline-none">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
