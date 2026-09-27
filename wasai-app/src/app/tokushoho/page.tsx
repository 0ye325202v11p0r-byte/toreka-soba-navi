import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { PLATFORM_FEE_RATE, REPEAT_PLATFORM_FEE_RATE } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表示",
  // /terms・/privacyと同じ理由——プレースホルダーのままでは検索エンジンに
  // 拾われないようにする。
  robots: { index: false, follow: true },
};

const ROWS: { label: string; value: React.ReactNode }[] = [
  { label: "販売事業者", value: SITE_NAME },
  { label: "運営統括責任者", value: "柏木涼" },
  {
    label: "所在地",
    value: (
      <>
        ご請求をいただいた場合には、遅滞なく開示いたします。
        <br />
        <span className="text-xs text-ink-faint">
          ※個人事業主が一定の要件（請求への遅滞ない開示体制等）を満たす場合の代替表示です。要件を満たしているか、公開前に専門家にご確認ください。
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
  { label: "メールアドレス", value: "0ye325202v11p0r@gmail.com" },
];

export default function TokushohoPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">特定商取引法に基づく表示</h1>
      <p className="mb-6 text-xs text-ink-faint">最終更新日：2026年9月21日</p>

      <div className="mb-4 rounded-lg border border-dashed border-warn bg-warn-soft p-4 text-sm text-warn">
        ⚠️
        所在地・電話番号は「請求があれば遅滞なく開示」の代替表示にしています。この表示が認められる要件（開示体制が実際に整っているか等）を満たしているか、一般公開前に専門家へのご確認を推奨します。
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
                当方は、取引成立時に代金から{Math.round(PLATFORM_FEE_RATE * 100)}
                %（同一の依頼者・和裁士間で過去に完了した取引がある場合は{Math.round(REPEAT_PLATFORM_FEE_RATE * 100)}
                %）のプラットフォーム利用手数料を控除します。この手数料は代金から差し引かれる形で徴収され、依頼者に別途追加請求されるものではありません。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                代金以外に必要な料金
              </th>
              <td className="py-3 leading-relaxed">
                決済に伴う手数料は当方が負担し、依頼者に別途請求することはありません。インターネット接続料金等、本サービスの利用環境に関する費用は依頼者のご負担となります。
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
                出品への申込み時、または提案の承諾時に決済手続きが行われ、決済の完了をもって取引が開始します。
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                役務の提供時期
              </th>
              <td className="py-3 leading-relaxed">
                和裁士ごとに出品ページで示す納期目安によります。実際の納期は個別の取引における和裁士とのやり取りによります。
              </td>
            </tr>
            <tr className="align-top">
              <th className="w-1/3 whitespace-nowrap py-3 pr-4 text-left font-medium text-ink-muted">
                キャンセル・返金について
              </th>
              <td className="py-3 leading-relaxed">
                決済完了前は依頼者はいつでもキャンセルできます。決済完了後は、依頼者・和裁士いずれからもキャンセルが可能で、キャンセル時は決済代行会社を通じて返金の手続きを行います。詳細は
                <a href="/terms" className="text-accent-strong underline">
                  利用規約
                </a>
                第7条をご覧ください。役務の性質上、仕上がりへの不満のみを理由とする返品・返金には応じられない場合があります。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
