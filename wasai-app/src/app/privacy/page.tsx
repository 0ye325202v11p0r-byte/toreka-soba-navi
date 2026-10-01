import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { BUSINESS_LABEL, CONTACT_PATH } from "@/lib/legal";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  // /termsと同じ理由——弁護士の確認が済むまでは検索エンジンに拾われない
  // ようにしておく。
  robots: { index: false, follow: true },
};

const PPC_US_URL = "https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">プライバシーポリシー</h1>
      <p className="mb-6 text-xs text-ink-faint">最終更新日：2026年9月29日</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 font-bold">1. 事業者情報</h2>
          <p>
            本サービス「{SITE_NAME}」（以下「本サービス」）は、「{SITE_NAME}」の運営者（以下「当方」）が提供し、当方が個人情報の取扱いの責任を負います。
          </p>
          <p className="mt-1">
            事業者：{BUSINESS_LABEL}
            <br />
            運営者の氏名・住所：ご請求をいただいた場合には、遅滞なくお答えします。
            <br />
            連絡先：
            <a href={CONTACT_PATH} className="text-link underline">
              お問い合わせフォーム
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">2. 取得する情報</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>メールアドレス・パスワード</b>
              ：ログインのために取得します。パスワードは認証基盤（Supabase
              Auth）によって元に戻せない形（ハッシュ化）で保管され、当方を含め誰も元のパスワードを読み取ることはできません。
            </li>
            <li>
              <b>プロフィール情報</b>
              ：表示名・自己紹介・都道府県、および和裁士の場合は資格級位・経験年数・得意分野・実績写真・受注状況等、ご自身で入力された内容です。これらは公開プロフィールとして、他の利用者が閲覧できます。
            </li>
            <li>
              <b>資格証明書の画像/PDF</b>
              ：和裁士が任意で登録した場合に、当方による確認（プロフィールへの「確認済み」表示）のためにのみ使用します。他の利用者には公開しません。
            </li>
            <li>
              <b>依頼・提案・出品・取引・メッセージ・レビューの内容</b>
              ：ご自身が投稿・入力した内容です。依頼・出品・レビューは他の利用者が閲覧できます。取引メッセージは、その取引の当事者（依頼者・和裁士）だけが閲覧できます。
            </li>
            <li>
              <b>決済に関する情報</b>
              ：取引代金の決済と和裁士への引渡しは、決済代行会社（Stripe）のシステムで行います。クレジットカード番号等は当方のサーバーには保存されず、Stripeが管理します。当方が保持するのは、取引の識別番号・金額・決済の状況等です。和裁士が振込先を設定する際の本人確認書類・銀行口座の情報は、Stripeが直接取得・管理し、当方は受け取りません。
            </li>
            <li>
              <b>同意の記録</b>
              ：利用規約・プライバシーポリシーへの同意、および和裁士の代金受領に関する同意（利用規約第5条）について、同意した日時と規約の版を記録します。
            </li>
            <li>
              <b>アクセスに関する技術情報</b>
              ：本サービスへのアクセス時に、IPアドレス、ブラウザの種類、アクセス日時等が、ホスティング事業者・データベース事業者の記録（ログ）に残ります。
            </li>
            <li>
              <b>ログイン状態を保持するためのCookie</b>
              ：ログイン状態を維持するために必要なCookieを使用します。広告や行動の追跡を目的としたCookieは使用していません。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-bold">3. 利用目的</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>ログイン機能の提供（本人確認）</li>
            <li>依頼者・和裁士のマッチング機能の提供（依頼・提案・出品・取引・メッセージ・レビュー・通知の表示）</li>
            <li>取引代金の決済、和裁士への引渡し、キャンセル時の返金</li>
            <li>和裁士の資格級位の確認と表示</li>
            <li>不正利用の防止（連絡先交換の検知、アクセス記録の確認等）</li>
            <li>利用規約等への同意の記録・確認</li>
            <li>お問い合わせ・苦情への対応、重要なお知らせの連絡、サービスの改善</li>
          </ul>
          <p className="mt-2">取得した情報を、第三者への販売や広告配信に利用することはありません。</p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">4. 第三者への提供</h2>
          <p>当方は、次の場合を除き、ご本人の同意なく個人データを第三者に提供しません。</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>法令に基づく場合</li>
            <li>人の生命・身体・財産の保護のために必要で、ご本人の同意を得ることが難しい場合</li>
            <li>次項の委託先に、利用目的の達成に必要な範囲で取扱いを任せる場合</li>
          </ul>
          <p className="mt-2">
            なお、取引が始まると、取引メッセージ等を通じて、取引相手にご自身の表示名や、ご自身が送った内容（着物の送り先住所など）が伝わります。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">5. 外部の事業者への委託と、外国での取扱い</h2>
          <p>本サービスは、次の外部事業者に個人データの取扱いの一部を任せています。いずれも米国の事業者です。</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium">事業者（所在国）</th>
                  <th className="py-2 pr-3 font-medium">任せている内容</th>
                  <th className="py-2 font-medium">データの主な保存・処理場所</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border align-top">
                  <td className="py-2 pr-3">Supabase, Inc.（米国）</td>
                  <td className="py-2 pr-3">データベース・ログイン機能・画像の保存（登録された情報のほぼすべて）</td>
                  <td className="py-2">日本（東京）</td>
                </tr>
                <tr className="border-b border-border align-top">
                  <td className="py-2 pr-3">Vercel Inc.（米国）</td>
                  <td className="py-2 pr-3">本サービスの配信・画面の表示処理（処理の過程で上記の情報が通過します）</td>
                  <td className="py-2">日本（東京）。配信の仕組み上、アクセスの記録などは国外の拠点でも扱われます</td>
                </tr>
                <tr className="align-top">
                  <td className="py-2 pr-3">Stripe, Inc.およびその関連会社（米国）</td>
                  <td className="py-2 pr-3">決済・返金・和裁士への引渡し（氏名・メールアドレス・決済手段・和裁士の本人確認情報等）</td>
                  <td className="py-2">米国ほか</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            米国には、日本の個人情報保護法に相当する、連邦全体に適用される包括的な個人情報保護の法律はなく、分野ごとの法律や州法（カリフォルニア州の法律など）によって保護されています。詳しくは、個人情報保護委員会の
            <a href={PPC_US_URL} target="_blank" rel="noopener noreferrer" className="text-link underline">
              外国制度（アメリカ合衆国）
            </a>
            のページをご覧ください。各事業者は、それぞれのプライバシーポリシー・データ保護に関する契約に基づいて個人情報を取り扱います。
          </p>
          <p className="mt-2">
            登録時に本ポリシーに同意いただくことで、上記の外国にある事業者への個人データの提供に同意いただいたものとして取り扱います。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">6. 安全管理のために講じている措置</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>基本方針</b>：個人情報を適切に取り扱うため、本ポリシーを定め、関係する法令・ガイドラインを守ります。
            </li>
            <li>
              <b>体制</b>：当方（運営者本人）が責任者として個人データを取り扱います。万一、漏えい等が起きた場合は、法令に従い、個人情報保護委員会への報告とご本人への通知を行います。
            </li>
            <li>
              <b>技術的な対策</b>
              ：通信の暗号化（https）、ご本人と取引相手以外が取引情報を見られないようにするデータベースの設定、パスワードのハッシュ化、クレジットカード情報を保持しない仕組み、秘密の鍵をサーバー側でのみ管理する仕組み、決済の管理画面への二段階認証を導入しています。
            </li>
            <li>
              <b>物理的な対策</b>：管理に使う端末には画面ロックを設定し、紛失・盗難に注意して管理します。
            </li>
            <li>
              <b>外国での取扱いの把握</b>：第5項のとおり、委託先の所在国と、その国の個人情報保護制度を把握したうえで安全管理を行います。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-bold">7. 保存期間・削除</h2>
          <p>
            登録された情報は、アカウントが存在する間保存します。アカウントの削除やデータの削除をご希望の場合は、第8項の方法でご連絡ください。ただし、取引記録など、税法等の法令により保存が義務付けられている情報は、その期間中は保存を続けます。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">8. 開示・訂正・利用停止等のご請求</h2>
          <p>
            ご自身の個人データについて、利用目的の通知、開示（第三者提供の記録の開示を含みます）、内容の訂正・追加・削除、利用の停止・消去、第三者への提供の停止をご請求いただけます。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>ご請求の方法</b>：
              <a href={`${CONTACT_PATH}?category=個人情報の開示等の請求`} className="text-link underline">
                お問い合わせフォーム
              </a>
              で種類「個人情報の開示等の請求」を選び、ご請求の内容を書いてお送りください。
            </li>
            <li>
              <b>ご本人の確認</b>
              ：和裁マッチにログインした状態での送信であること、または登録しているメールアドレスへのご連絡で確認します。必要な場合は、追加の確認をお願いすることがあります。代理人によるご請求の場合は、代理権を確認できる書面（委任状など）をお送りいただきます。
            </li>
            <li>
              <b>お答えの方法</b>：原則として、電子メールで遅滞なくお答えします。
            </li>
            <li>
              <b>手数料</b>：無料です。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-bold">9. 苦情・ご相談の窓口</h2>
          <p>
            個人情報の取扱いに関する苦情・ご相談は、
            <a href={CONTACT_PATH} className="text-link underline">
              お問い合わせフォーム
            </a>
            からご連絡ください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-bold">10. 本ポリシーの変更</h2>
          <p>
            法令やサービス内容の変更に応じて、本ポリシーを変更することがあります。重要な変更をする場合は、変更の内容と実施日を、実施日より前に本サービス上でお知らせします。利用目的を変更する場合は、法令で認められる範囲で行い、変更後の利用目的をお知らせします。
          </p>
        </section>
      </div>
    </div>
  );
}
