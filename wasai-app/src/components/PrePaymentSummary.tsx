import Link from "next/link";
import { CANCELLATION_SUMMARY, ORDER_CONFIRMATION_POINT } from "@/lib/orderTerms";

// The final-confirmation disclosures (特定商取引法12条の6) shown right above
// every button that leads to Stripe Checkout — see src/lib/orderTerms.ts.
export default function PrePaymentSummary({ price, delivery }: { price: number; delivery: string }) {
  return (
    <div className="rounded-md border border-border bg-bg p-3 text-sm leading-relaxed">
      <p className="mb-2 font-semibold text-ink">お申込み前にご確認ください</p>
      <dl className="space-y-1.5 text-ink-muted">
        <div>
          <dt className="inline font-medium text-ink">数量・お支払い金額：</dt>
          <dd className="inline">
            1件 ¥{price.toLocaleString()}
            （手数料などを別に請求することはありません。着物の送料は和裁士との取り決めによります）
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink">お支払い方法・時期：</dt>
          <dd className="inline">次の決済画面でクレジットカード等によりお支払いいただきます（その場で決済）。</dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink">提供時期：</dt>
          <dd className="inline">{delivery}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink">キャンセル：</dt>
          <dd className="inline">
            {CANCELLATION_SUMMARY}詳しくは
            <Link href="/terms" target="_blank" className="text-accent-strong underline">
              利用規約
            </Link>
            第7条をご覧ください。
          </dd>
        </div>
      </dl>
      <p className="mt-2 font-medium text-ink">{ORDER_CONFIRMATION_POINT}</p>
    </div>
  );
}
