import { SITE_NAME } from "@/lib/site";
import { PLATFORM_FEE_RATE } from "@/lib/stripe";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-elevated">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-ink-faint">
        <p>
          {SITE_NAME}は和裁士と依頼者を直接つなぐマッチングサービスです。お支払いはStripeを通じてプラットフォームが一旦お預かりし（エスクロー）、取引完了後に手数料（
          {Math.round(PLATFORM_FEE_RATE * 100)}%）を差し引いて和裁士へ送金します。
        </p>
        <p className="mt-2">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
