import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { PLATFORM_FEE_RATE, REPEAT_PLATFORM_FEE_RATE } from "@/lib/stripe";
import { AUTO_COMPLETE_AFTER_DAYS } from "@/lib/escrow";
import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/legal";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表示",
  // /terms・/privacyと同じ理由——プレースホルダーのままでは検索エンジンに
  // 拾われないようにする。
  robots: { index: false, follow: true },
};

const ROWS: { label: string; value: React.ReactNode }[] = [
  { label: "販売事業者", value: OPERATOR_NAME },
  { label: "運営統括責任者", value: "柏木 涼" },
  {
    label: "所在地",
    value: (
      <>
        ご請求をいただいた場合には、遅滞なく開示いたします。
        <br />
        <span className="text-xs text-ink-faint">
          開示のご請求は下記メールアドレスで受け付けます。
        </span>
      </>
    ),
  },
  {
    label: "電話番号",
    value: (
      <>
        ご請求をいただいた場合には、遅滞なく開示いたします。
        <br />
        <span className="text-xs text-ink-faint">※所在地と同様の代替表示です。下記メールアドレスが常設の問い合わせ窓口となります。</span>
      </>
    ),
  },
  { label: "メールアドレス", value: CONTACT_EMAIL },
];

export default function TokushohoPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">特定商取引法に基づく表示</h1>
      <p className="mb-6 text-xs text-ink-faint">最終更新日：2026年9月29日</p>

      <div className="mb-4 rounded-lg border border-dashed border-warn bg-warn-soft p-4 text-sm text-warn">
        ⚠️
        本表示は弁護士による確認の前の版です。所在地・電話番号を「請求があれば遅滞なく開示」とする表示を含め、正式な決済の開始前に確認を受ける予定です。
      </div>
      <div className="mb-6 rounded-lg border border-dashed border-warn bg-warn-soft p-4 text-sm text-warn">
        ⚠️
        この表示は、{SITE_NAME}
        （マッチング・決済仲介サービス）を運営する当方についてのものです。個々の仕立て・お直し等の役務そのものの提供者は各和裁士であり、和裁士が事業として消費者に役務を提供する場合、和裁士自身が特定商取引法上の表示義務を負う可能性があります。この点も含め専門家にご確認ください。
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-border align-top">
                <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                  {row.label}
                </th>
                <td className="py-3 leading-relaxed">{row.value}</td>
              </tr>
            ))}
            <tr className="border-b border-border align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                販売価格・利用料金
              </th>
              <td className="py-3 leading-relaxed">
                個々の仕立て・お直し等の代金は、和裁士が出品ごとに設定する価格、または依頼への提案において提示する見積り価格によります（各出品ページ・提案内容に表示）。
                <br />
                当方は、代金を和裁士へ引き渡す際に、代金から{Math.round(PLATFORM_FEE_RATE * 100)}
                %（同一の依頼者・和裁士間で過去に完了した取引がある場合は{Math.round(REPEAT_PLATFORM_FEE_RATE * 100)}
                %）のプラットフォーム利用手数料を差し引きます（料率は依頼者の決済完了時点のもので確定します）。この手数料は代金の中から差し引かれるもので、依頼者に別途請求されるものではありません。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                代金以外に必要な料金
              </th>
              <td className="py-3 leading-relaxed">
                決済に伴う手数料は当方が負担し、依頼者に別途請求することはありません。着物・反物の送料は、依頼者と和裁士の取り決めによりご負担いただく場合があります。インターネット接続料金等、本サービスの利用環境に関する費用は利用者のご負担となります。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                お支払い方法
              </th>
              <td className="py-3 leading-relaxed">
                決済代行会社（Stripe, Inc.）が提供するオンライン決済（クレジットカード等）によります。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                お支払い時期
              </th>
              <td className="py-3 leading-relaxed">
                出品への申込み時、または提案の承諾時に表示される決済画面で、その場でお支払いいただきます（前払い）。決済の完了をもってお申込みが確定し、取引が成立します。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                役務の提供時期
              </th>
              <td className="py-3 leading-relaxed">
                出品の場合は出品ページに表示する納期目安、提案の場合は依頼の希望納期と提案内容を目安とし、具体的な日程は取引メッセージで和裁士と調整します。
              </td>
            </tr>
            <tr className="align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                キャンセル・返金について
              </th>
              <td className="py-3 leading-relaxed">
                決済の完了前は、依頼者はいつでも申込みを取りやめられます（代金は発生しません）。決済の完了後も、依頼者が完了を確認するまではキャンセルでき、代金は全額返金されます（和裁士の納品操作から
                {AUTO_COMPLETE_AFTER_DAYS}
                日たつと自動的に完了となり、それ以降はキャンセルできません）。作業の一部が済んでいた場合の費用や着物の返送は、依頼者と和裁士の話し合いによります。詳細は
                <a href="/terms" className="text-accent-strong underline">
                  利用規約
                </a>
                第7条をご覧ください。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
