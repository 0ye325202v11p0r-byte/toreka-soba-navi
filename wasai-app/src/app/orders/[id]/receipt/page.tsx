import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import SetupNotice from "@/components/SetupNotice";
import { SITE_NAME } from "@/lib/site";
import PrintButton from "./PrintButton";
import type { Order, Profile } from "@/lib/types";

export const metadata = { title: "取引明細書" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

const PAYMENT_STATUS_LABEL: Record<Order["payment_status"], string> = {
  unpaid: "未払い",
  paid: "支払い済み（プラットフォームで保管中）",
  transferred: "和裁士へ送金済み",
  refunded: "返金済み",
};

export default async function OrderReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect(`/login?next=/orders/${id}/receipt`);

  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!order) notFound();
  if (order.client_id !== current.id && order.craftsman_id !== current.id) notFound();

  if (order.payment_status === "unpaid") {
    return (
      <div>
        <h1 className="text-xl font-bold">取引明細書</h1>
        <p className="mt-4 text-sm text-ink-muted">
          支払いが完了すると、この取引の明細書を発行できます。
        </p>
        <Link href={`/orders/${id}`} className="mt-4 inline-block text-sm text-link underline">
          取引ページへ戻る
        </Link>
      </div>
    );
  }

  const [{ data: client }, { data: craftsman }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", order.client_id).maybeSingle<Profile>(),
    supabase.from("profiles").select("*").eq("id", order.craftsman_id).maybeSingle<Profile>(),
  ]);

  const viewerRole = order.client_id === current.id ? "client" : "craftsman";
  const netAmount = order.platform_fee_amount != null ? order.price - order.platform_fee_amount : null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/orders/${id}`} className="text-sm text-link underline">
          ← 取引ページへ戻る
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-lg border border-border bg-bg-elevated p-8">
        <h1 className="text-xl font-bold">取引明細書</h1>
        <p className="mt-1 text-xs text-ink-muted">発行日: {formatDate(new Date().toISOString())}</p>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-ink-muted">取引ID</dt>
            <dd className="font-mono text-xs">{order.id}</dd>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-ink-muted">依頼者</dt>
            <dd>{client?.display_name ?? "不明"}</dd>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-ink-muted">和裁士</dt>
            <dd>{craftsman?.display_name ?? "不明"}</dd>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-ink-muted">品目</dt>
            <dd>{order.title}</dd>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-ink-muted">取引日</dt>
            <dd>{formatDate(order.created_at)}</dd>
          </div>
          {order.completed_at && (
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-ink-muted">完了日</dt>
              <dd>{formatDate(order.completed_at)}</dd>
            </div>
          )}
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-ink-muted">支払状況</dt>
            <dd>{PAYMENT_STATUS_LABEL[order.payment_status]}</dd>
          </div>
          <div className="flex justify-between border-b border-border pb-2 text-base font-bold">
            <dt>お支払金額（税込）</dt>
            <dd>¥{order.price.toLocaleString()}</dd>
          </div>
          {viewerRole === "craftsman" && order.platform_fee_amount != null && (
            <>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-ink-muted">プラットフォーム手数料</dt>
                <dd>−¥{order.platform_fee_amount.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between text-base font-bold">
                <dt>受取金額</dt>
                <dd>¥{netAmount!.toLocaleString()}</dd>
              </div>
            </>
          )}
        </dl>

        <p className="mt-8 text-xs text-ink-faint">
          {SITE_NAME} — 本書はプラットフォーム上の取引記録として発行する明細書であり、消費税インボイス制度上の適格請求書ではありません。確定申告等でのご利用にあたっては、必要に応じて税理士・税務署にご確認ください。
        </p>
      </div>
    </div>
  );
}
