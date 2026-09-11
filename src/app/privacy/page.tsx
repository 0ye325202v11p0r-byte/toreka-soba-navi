import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">プライバシーポリシー</h1>
      <p className="mb-6 text-xs text-ink-faint">最終更新日：[ここに掲載日を記入]</p>

      <div className="mb-6 rounded-lg border border-dashed border-warn bg-warn-soft p-4 text-sm text-warn">
        ⚠️
        このページはテンプレートです。四角括弧「［　］」で囲まれた箇所（事業者情報・連絡先・最終更新日）は、公開前に必ずご自身の情報に置き換えてください。それ以外の本文は、本サイトが実際に収集・利用しているデータに基づいて記載しています。内容に不安がある場合は、公開前に専門家（弁護士等）にご確認ください。
      </div>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 font-bold">1. 事業者情報</h2>
          <p>
            本サービス「トレカ相場ナビ」（以下「本サービス」）は、［ここに事業者名・屋号を記入］（以下「当方」）が提供します。
          </p>
          <p className="mt-1">
            所在地：［ここに記入］
            <br />
            連絡先：［ここにメールアドレス等を記入］
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">2. 収集する情報</h2>
          <p>本サービスは、以下の情報を収集します。</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>メールアドレス</b>：ログイン（マジックリンク認証）のために、ログイン画面でご入力いただいたメールアドレスを収集します。パスワードは収集しません。
            </li>
            <li>
              <b>ポートフォリオ・ウォッチリストの登録内容</b>
              ：ログイン後にご自身で入力された、保有カードの取引記録（カード名・枚数・取得価格・日付）やウォッチリスト条件を保存します。これらはログインユーザー本人のみが閲覧できます（他の利用者からは見えません）。
            </li>
            <li>
              <b>アクセス解析データ</b>
              ：Vercel Analyticsを利用し、閲覧ページ・国/地域などの統計情報を取得しています。個人を特定するCookieは使用していません。
            </li>
            <li>
              <b>ログイン状態を保持するためのCookie</b>：ログイン機能（Supabase
              Auth）が、ログイン状態を維持するために必要なCookieを発行します。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-bold">3. 利用目的</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>ログイン機能の提供（メールアドレス宛にログイン用リンクを送信するため）</li>
            <li>ポートフォリオ・ウォッチリスト機能の提供（入力内容の保存・表示のため）</li>
            <li>サービス改善のための利用状況の把握（アクセス解析）</li>
            <li>お問い合わせへの対応</li>
          </ul>
          <p className="mt-2">
            収集した情報を、本サービスの提供・改善以外の目的（第三者への販売、広告配信等）に利用することはありません。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">4. 第三者への提供・委託先</h2>
          <p>本サービスは、以下の外部サービスを利用してデータを処理しています。</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>Supabase</b>（データベース・ログイン機能）：メールアドレス、ポートフォリオ・ウォッチリストの登録内容を保存しています。
            </li>
            <li>
              <b>Vercel</b>（ホスティング・アクセス解析）：本サービスの配信、およびVercel
              Analyticsによる利用状況の集計を行っています。
            </li>
          </ul>
          <p className="mt-2">上記以外の第三者への個人情報の提供は行いません（法令に基づく場合を除く）。</p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">5. データの保存期間・削除</h2>
          <p>
            登録された情報は、アカウントが存在する限り保存されます。アカウントの削除やデータの削除をご希望の場合は、下記の連絡先までお問い合わせください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">6. ご本人の権利</h2>
          <p>
            ご自身のメールアドレスやポートフォリオ・ウォッチリストの登録内容について、開示・訂正・削除をご希望の場合は、下記の連絡先までお問い合わせください。合理的な期間内に対応いたします。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">7. プライバシーポリシーの変更</h2>
          <p>
            本ポリシーの内容は、法令の変更やサービス内容の変更に応じて、予告なく変更することがあります。重要な変更がある場合は、本サービス上でお知らせします。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">8. お問い合わせ</h2>
          <p>本ポリシーに関するお問い合わせは、以下の連絡先までお願いいたします。</p>
          <p className="mt-1">［ここに連絡先メールアドレス等を記入］</p>
        </section>
      </div>
    </div>
  );
}
