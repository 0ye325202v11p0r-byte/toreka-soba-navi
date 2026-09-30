import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import SetupNotice from "@/components/SetupNotice";
import VerifiedBadge from "@/components/VerifiedBadge";
import StarRating from "@/components/StarRating";
import Avatar from "@/components/Avatar";
import { getRatingSummary } from "@/lib/reviews";
import ProposalForm from "./ProposalForm";
import RespondProposalButtons from "./RespondProposalButtons";
import PrePaymentSummary from "@/components/PrePaymentSummary";
import { deliveryNote } from "@/lib/orderTerms";
import RespondCounterButtons from "./RespondCounterButtons";
import CounterProposalForm from "./CounterProposalForm";
import WithdrawProposalButton from "./WithdrawProposalButton";
import { GRADE_RANK, type Grade, type JobRequest, type Profile, type Proposal } from "@/lib/types";

const STATUS_LABEL: Record<Proposal["status"], string> = {
  pending: "検討中",
  accepted: "承諾済み",
  declined: "見送り",
  withdrawn: "取り下げ",
  countered: "価格交渉中",
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { id } = await params;
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("requests")
    .select("*, profiles(*)")
    .eq("id", id)
    .maybeSingle<JobRequest & { profiles: Profile }>();

  if (!request) notFound();

  const { data: proposalsRaw } = await supabase
    .from("proposals")
    .select("*, profiles(*)")
    .eq("request_id", id)
    .order("created_at", { ascending: true });
  const proposals = (proposalsRaw ?? []) as unknown as (Proposal & { profiles: Profile })[];

  const craftsmanIds = proposals.map((p) => p.craftsman_id);
  const verifiedCraftsmanIds = new Set<string>();
  if (craftsmanIds.length > 0) {
    const { data: verifiedRows } = await supabase
      .from("craftsman_profiles")
      .select("profile_id")
      .in("profile_id", craftsmanIds)
      .eq("grade_verified", true);
    for (const row of verifiedRows ?? []) verifiedCraftsmanIds.add(row.profile_id);
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("request_id", id)
    .maybeSingle();

  const clientRating = await getRatingSummary(supabase, request.client_id);

  const current = await getCurrentUser();
  const isOwner = current?.id === request.client_id;
  const myProposal = current ? proposals.find((p) => p.craftsman_id === current.id) : undefined;
  const isCraftsman = current?.profile?.role === "craftsman";

  let meetsGradeRequirement = true;
  if (isCraftsman && request.min_grade && current) {
    const { data: myCraftsmanProfile } = await supabase
      .from("craftsman_profiles")
      .select("grade")
      .eq("profile_id", current.id)
      .maybeSingle();
    const myGrade = myCraftsmanProfile?.grade as Grade | null;
    meetsGradeRequirement = myGrade != null && GRADE_RANK[myGrade] <= GRADE_RANK[request.min_grade];
  }

  const canPropose =
    isCraftsman && request.status === "open" && !myProposal && meetsGradeRequirement;

  return (
    <div>
      <p className="text-xs text-ink-muted">{request.garment_type}</p>
      {request.min_grade && (
        <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-strong">
          {request.min_grade}以上限定
        </span>
      )}
      <h1 className="mt-1 text-2xl font-bold">{request.title}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        依頼者:
        <Avatar url={request.profiles.avatar_url} name={request.profiles.display_name} size={20} />
        {request.profiles.display_name}
        {request.deadline ? ` ・ 希望納期: ${request.deadline}` : ""}
        {" ・ ステータス: "}
        {request.status === "open" ? "募集中" : request.status === "matched" ? "マッチング済み" : "終了"}
      </p>
      <div className="mt-1">
        <StarRating rating={clientRating.average} count={clientRating.count} />
      </div>
      {(request.budget_min || request.budget_max) && (
        <p className="mt-2 text-sm font-semibold">
          予算: {request.budget_min ? `¥${request.budget_min.toLocaleString()}` : "〜"}
          {" 〜 "}
          {request.budget_max ? `¥${request.budget_max.toLocaleString()}` : ""}
        </p>
      )}
      <p className="mt-4 whitespace-pre-wrap text-sm">{request.description}</p>

      {order && (isOwner || current?.id) && (
        <p className="mt-4">
          <Link href={`/orders/${order.id}`} className="text-sm text-accent-strong underline">
            取引ページを見る
          </Link>
        </p>
      )}

      {canPropose && (
        <div className="mt-6">
          <ProposalForm requestId={request.id} />
        </div>
      )}
      {isCraftsman && request.status === "open" && !myProposal && !meetsGradeRequirement && (
        <p className="mt-6 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          この依頼は「{request.min_grade}以上」の資格級位を登録した和裁士のみ提案できます。プロフィールで資格級位を設定してください。
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-bold">提案一覧</h2>
        <ul className="mt-3 space-y-3">
          {proposals.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-bg-elevated p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar url={p.profiles.avatar_url} name={p.profiles.display_name} size={28} />
                  <Link href={`/craftsmen/${p.craftsman_id}`} className="font-semibold text-accent-strong hover:underline">
                    {p.profiles.display_name}
                  </Link>
                  {verifiedCraftsmanIds.has(p.craftsman_id) && <VerifiedBadge />}
                </div>
                <span className="text-right text-sm font-bold">
                  ¥{p.price.toLocaleString()}
                  {p.delivery_days && (
                    <span className="block text-xs font-normal text-ink-muted">納期目安 {p.delivery_days}日</span>
                  )}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{p.message}</p>
              <p className="mt-2 text-xs text-ink-muted">状態: {STATUS_LABEL[p.status]}</p>
              {p.status === "countered" && p.countered_price != null && (
                <div className="mt-2 rounded-md bg-accent-soft p-3">
                  <p className="text-sm font-semibold text-accent-strong">
                    依頼者からの提示: ¥{p.countered_price.toLocaleString()}
                  </p>
                  {p.countered_message && (
                    <p className="mt-1 whitespace-pre-wrap text-sm">{p.countered_message}</p>
                  )}
                </div>
              )}
              {isOwner && p.status === "pending" && request.status === "open" && (
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  <div className="w-full">
                    <PrePaymentSummary
                      price={p.price}
                      delivery={deliveryNote({ deliveryDays: p.delivery_days, desiredBy: request.deadline })}
                    />
                  </div>
                  <RespondProposalButtons proposalId={p.id} />
                  <CounterProposalForm proposalId={p.id} />
                </div>
              )}
              {current?.id === p.craftsman_id && p.status === "countered" && (
                <div className="mt-3">
                  <RespondCounterButtons proposalId={p.id} counteredPrice={p.countered_price!} />
                </div>
              )}
              {current?.id === p.craftsman_id && (p.status === "pending" || p.status === "countered") && (
                <div className="mt-3">
                  <WithdrawProposalButton proposalId={p.id} />
                </div>
              )}
            </li>
          ))}
          {proposals.length === 0 && (
            <p className="text-sm text-ink-muted">まだ提案がありません。</p>
          )}
        </ul>
      </section>
    </div>
  );
}
