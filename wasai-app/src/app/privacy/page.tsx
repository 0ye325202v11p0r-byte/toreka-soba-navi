import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  // /termsと同じ理由——事業者名・所在地が確定するまでは検索エンジンに
  // 拾われないようにする。
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">プライバシーポリシー</h1>
      <p className="mb-6 text-xs text-ink-faint">最終更新日：2026年9月15日</p>

      <div className="mb-6 rounded-lg border border-dashed border-warn bg-warn-soft p-4 text-sm text-warn">
        ⚠️
        事業者名・所在地は「［ここに記入］」のプレースホルダーのままです。実態に基づき入力し、プレースホルダーのまま一般公開しないでください。
      </div>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 font-bold">1. 事業者情報</h2>
          <p>本サービス「{SITE_NAME}」（以下「本サービス」）は、{SITE_NAME}運営者（以下「当方」）が提供します。</p>
          <p className="mt-1">
            事業者名：［ここに記入］
            <br />
            所在地：［ここに記入］
            <br />
            連絡先：0ye325202v11p0r@gmail.com
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">2. 収集する情報</h2>
          <p>本サービスは、以下の情報を収集します。</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>メールアドレス・パスワード</b>
              ：ログイン機能（メールアドレス＋パスワード方式）のために収集します。パスワードは認証基盤（Supabase
              Auth）によって安全な形式（ハッシュ化）で保管され、当方を含め第三者が元のパスワードを読み取ることはできません。
            </li>
            <li>
              <b>プロフィール情報</b>
              ：表示名・自己紹介・都道府県、および和裁士アカウントの場合は資格級位・経験年数・得意分野・実績写真のURL・受注可否等、ご自身で入力された内容を保存します。これらは依頼者/和裁士としての公開プロフィールとして、他の利用者から閲覧できる場合があります。
            </li>
            <li>
              <b>資格証明書の画像/PDFのURL</b>
              ：和裁士が任意で登録した場合に、運営による確認（プロフィールへの「確認済み」表示の付与）目的にのみ使用します。この情報自体を他の利用者に公開することはありません。
            </li>
            <li>
              <b>依頼・提案・出品・取引・メッセージ・レビューの内容</b>
              ：本サービスの機能を利用する過程でご自身が投稿・入力した内容を保存します。依頼・出品・レビューは他の利用者から閲覧可能な公開情報として扱われます。取引メッセージは、当該取引の当事者（依頼者・和裁士）のみが閲覧できます。
            </li>
            <li>
              <b>決済に関する情報</b>
              ：取引代金の決済・和裁士への送金は、決済代行会社（Stripe,
              Inc.）のシステムを通じて行われます。クレジットカード番号等の決済手段そのものの情報は当方のサーバーには保存されず、Stripe側で管理されます。当方は、取引の識別子・金額・決済状況等の情報のみを保持します。
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
            <li>ログイン機能の提供（アカウント認証）</li>
            <li>依頼者・和裁士間のマッチング機能の提供（依頼・提案・出品・取引・メッセージ・レビュー・通知の表示）</li>
            <li>取引代金の決済処理、および和裁士への送金</li>
            <li>和裁士の資格級位に関する確認・プロフィールへの表示</li>
            <li>不正利用の防止（連絡先交換の検知等）</li>
            <li>お問い合わせへの対応、サービス改善</li>
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
              <b>Supabase</b>（データベース・ログイン機能）：本サービスに登録されたほぼ全ての情報を保存しています。
            </li>
            <li>
              <b>Stripe, Inc.</b>（決済・送金）：取引代金の決済処理、および和裁士への送金のために、氏名・メールアドレス・決済手段の情報等を提供しています。Stripeにおけるデータの取扱いは、Stripe自身のプライバシーポリシーに従います。
            </li>
            <li>
              <b>Vercel</b>（ホスティング）：本サービスの配信を行っています。
            </li>
          </ul>
          <p className="mt-2">上記以外の第三者への個人情報の提供は行いません（法令に基づく場合を除く）。</p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">5. データの保存期間・削除</h2>
          <p>
            登録された情報は、アカウントが存在する限り保存されます。アカウントの削除やデータの削除をご希望の場合は、下記の連絡先までお問い合わせください。ただし、取引記録等、法令（税法等）により一定期間の保存が義務付けられる情報については、当該期間中は保存を継続する場合があります。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">6. ご本人の権利</h2>
          <p>
            ご自身の登録情報について、開示・訂正・削除をご希望の場合は、下記の連絡先までお問い合わせください。合理的な期間内に対応いたします。
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
          <p className="mt-1">0ye325202v11p0r@gmail.com</p>
        </section>
      </div>
    </div>
  );
}
