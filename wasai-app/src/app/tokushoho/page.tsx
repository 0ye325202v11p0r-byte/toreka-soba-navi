import type { Metadata } from "next";
import { PLATFORM_FEE_RATE, REPEAT_PLATFORM_FEE_RATE } from "@/lib/stripe";
import { CANCELLATION_SUMMARY } from "@/lib/orderTerms";
import { BUSINESS_LABEL, CONTACT_PATH } from "@/lib/legal";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表示",
  // /terms・/privacyと同じ理由——プレースホルダーのままでは検索エンジンに
  // 拾われないようにする。
  robots: { index: false, follow: true },
};

const ROWS: { label: string; value: React.ReactNode }[] = [
  { label: "販売事業者", value: BUSINESS_LABEL },
  {
    label: "事業者の氏名・所在地・電話番号",
    value: (
      <>
        ご請求をいただいた場合には、遅滞なく電子メールでお知らせします。
        <br />
        <span className="text-xs text-ink-muted">
          ご請求は
          <a href={`${CONTACT_PATH}?category=特商法の表示事項の請求`} className="text-link underline">
            お問い合わせフォーム
          </a>
          から、種類「特商法の表示事項の請求」を選んでお送りください。
        </span>
      </>
    ),
  },
  {
    label: "お問い合わせ",
    value: (
      <a href={CONTACT_PATH} className="text-link underline">
        お問い合わせフォーム
      </a>
    ),
  },
];

export default function TokushohoPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">特定商取引法に基づく表示</h1>
      <p className="mb-6 text-xs text-ink-faint">最終更新日：2026年10月1日</p>


      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-border align-top">
                <th className="block pt-3 text-left font-medium text-ink-muted sm:table-cell sm:w-1/3 sm:whitespace-nowrap sm:py-3 sm:pr-4">
                  {row.label}
                </th>
                <td className="block pb-3 pt-1 leading-relaxed sm:table-cell sm:py-3">{row.value}</td>
              </tr>
            ))}
            <tr className="border-b border-border align-top">
              <th className="block pt-3 text-left font-medium text-ink-muted sm:table-cell sm:w-1/3 sm:whitespace-nowrap sm:py-3 sm:pr-4">
                販売価格・利用料金
              </th>
              <td className="block pb-3 pt-1 leading-relaxed sm:table-cell sm:py-3">
                個々の仕立て・お直し等の代金は、和裁士が出品ごとに設定する価格、または依頼への提案において提示する見積り価格によります（各出品ページ・提案内容に表示）。
                <br />
                当方は、代金を和裁士へ引き渡す際に、代金から{Math.round(PLATFORM_FEE_RATE * 100)}
                %（同一の依頼者・和裁士間で過去に完了した取引がある場合は{Math.round(REPEAT_PLATFORM_FEE_RATE * 100)}
                %）のプラットフォーム利用手数料を差し引きます（料率は依頼者の決済完了時点のもので確定します）。この手数料は代金の中から差し引かれるもので、依頼者に別途請求されるものではありません。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="block pt-3 text-left font-medium text-ink-muted sm:table-cell sm:w-1/3 sm:whitespace-nowrap sm:py-3 sm:pr-4">
                代金以外に必要な料金
              </th>
              <td className="block pb-3 pt-1 leading-relaxed sm:table-cell sm:py-3">
                決済に伴う手数料は当方が負担し、依頼者に別途請求することはありません。着物・反物の送料は、依頼者と和裁士の取り決めによりご負担いただく場合があります。インターネット接続料金等、本サービスの利用環境に関する費用は利用者のご負担となります。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="block pt-3 text-left font-medium text-ink-muted sm:table-cell sm:w-1/3 sm:whitespace-nowrap sm:py-3 sm:pr-4">
                お支払い方法
              </th>
              <td className="block pb-3 pt-1 leading-relaxed sm:table-cell sm:py-3">
                決済代行会社（Stripe, Inc.）が提供するオンライン決済（クレジットカード等）によります。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="block pt-3 text-left font-medium text-ink-muted sm:table-cell sm:w-1/3 sm:whitespace-nowrap sm:py-3 sm:pr-4">
                お支払い時期
              </th>
              <td className="block pb-3 pt-1 leading-relaxed sm:table-cell sm:py-3">
                出品への申込み時、または提案の承諾時に表示される決済画面で、その場でお支払いいただきます（前払い）。決済の完了をもってお申込みが確定し、取引が成立します。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="block pt-3 text-left font-medium text-ink-muted sm:table-cell sm:w-1/3 sm:whitespace-nowrap sm:py-3 sm:pr-4">
                役務の提供時期
              </th>
              <td className="block pb-3 pt-1 leading-relaxed sm:table-cell sm:py-3">
                出品の場合は出品ページに表示する納期目安、提案の場合は依頼の希望納期と提案内容を目安とし、具体的な日程は取引メッセージで和裁士と調整します。
              </td>
            </tr>
            <tr className="align-top">
              <th className="block pt-3 text-left font-medium text-ink-muted sm:table-cell sm:w-1/3 sm:whitespace-nowrap sm:py-3 sm:pr-4">
                キャンセル・返金について
              </th>
              <td className="block pb-3 pt-1 leading-relaxed sm:table-cell sm:py-3">
                {CANCELLATION_SUMMARY}詳細は
                <a href="/terms" className="text-link underline">
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
