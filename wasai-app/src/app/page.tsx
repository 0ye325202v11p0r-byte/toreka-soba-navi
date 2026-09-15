import Link from "next/link";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

export default function HomePage() {
  return (
    <div>
      <section className="rounded-xl border border-border bg-bg-elevated p-8 text-center">
        <h1 className="text-3xl font-bold text-accent-strong">{SITE_NAME}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-muted">{SITE_DESCRIPTION}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-accent px-5 py-2.5 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors"
          >
            無料で登録する
          </Link>
          <Link
            href="/craftsmen"
            className="rounded-md border border-border px-5 py-2.5 font-semibold hover:bg-bg-sunken transition-colors"
          >
            和裁士を探す
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-elevated p-5">
          <h2 className="font-bold text-accent-strong">中抜きゼロ</h2>
          <p className="mt-2 text-sm text-ink-muted">
            教室や問屋を介さず、和裁士自身が価格を決めて依頼者と直接やり取りできます。
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-elevated p-5">
          <h2 className="font-bold text-accent-strong">実績・資格で信頼を可視化</h2>
          <p className="mt-2 text-sm text-ink-muted">
            資格級位・得意分野・実績写真・レビューをプロフィールに掲載し、価格だけでなく技術で選ばれます。
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-elevated p-5">
          <h2 className="font-bold text-accent-strong">2つの依頼方法</h2>
          <p className="mt-2 text-sm text-ink-muted">
            決まったメニューから選ぶ「出品」と、要望を伝えて見積りを募る「依頼掲示板」の両方に対応。
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">使い方</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg-elevated p-5">
            <h3 className="font-semibold">依頼者の方</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
              <li>無料登録（依頼者として）</li>
              <li>和裁士の出品から選ぶ、または依頼掲示板に投稿して提案を待つ</li>
              <li>チャットで詳細をすり合わせて仕立てを依頼</li>
              <li>納品確認後、レビューを投稿</li>
            </ol>
          </div>
          <div className="rounded-lg border border-border bg-bg-elevated p-5">
            <h3 className="font-semibold">和裁士の方</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
              <li>無料登録（和裁士として）してプロフィール・資格・実績を掲載</li>
              <li>固定価格のサービスを出品、または依頼掲示板から気になる案件に提案</li>
              <li>チャットで詳細をすり合わせて受注</li>
              <li>納品後、レビューで実績を積み上げる</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
