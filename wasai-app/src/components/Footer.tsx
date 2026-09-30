import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { PLATFORM_FEE_RATE, REPEAT_PLATFORM_FEE_RATE } from "@/lib/stripe";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-elevated">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-ink-faint">
        <p>
          {SITE_NAME}は和裁士と依頼者を直接つなぐマッチングサービスです。お支払いは、Stripeを通じて運営者が和裁士に代わって受け取り、取引完了後に手数料（初回
          {Math.round(PLATFORM_FEE_RATE * 100)}%、同じ相手との2回目以降は{Math.round(REPEAT_PLATFORM_FEE_RATE * 100)}%）を差し引いて和裁士へお渡しします（利用規約第5条）。
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/terms" className="hover:underline">
            利用規約
          </Link>
          <Link href="/privacy" className="hover:underline">
            プライバシーポリシー
          </Link>
          <Link href="/tokushoho" className="hover:underline">
            特定商取引法に基づく表示
          </Link>
        </nav>
        <p className="mt-2">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
