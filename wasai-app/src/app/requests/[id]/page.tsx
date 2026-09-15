import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import SetupNotice from "@/components/SetupNotice";
import ProposalForm from "./ProposalForm";
import RespondProposalButtons from "./RespondProposalButtons";
import WithdrawProposalButton from "./WithdrawProposalButton";
import { GRADE_RANK, type Grade, type JobRequest, type Profile, type Proposal } from "@/lib/types";

const STATUS_LABEL: Record<Proposal["status"], string> = {
  pending: "検討中",
  accepted: "承諾済み",
  declined: "見送り",
  withdrawn: "取り下げ",
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

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("request_id", id)
    .maybeSingle();

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
      <p className="mt-1 text-sm text-ink-muted">
        依頼者: {request.profiles.display_name}
        {request.deadline ? ` ・ 希望納期: ${request.deadline}` : ""}
        {" ・ ステータス: "}
        {request.status === "open" ? "募集中" : request.status === "matched" ? "マッチング済み" : "終了"}
      </p>
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
                <Link href={`/craftsmen/${p.craftsman_id}`} className="font-semibold text-accent-strong hover:underline">
                  {p.profiles.display_name}
                </Link>
                <span className="text-sm font-bold">¥{p.price.toLocaleString()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{p.message}</p>
              <p className="mt-2 text-xs text-ink-muted">状態: {STATUS_LABEL[p.status]}</p>
              {isOwner && p.status === "pending" && request.status === "open" && (
                <div className="mt-3">
                  <RespondProposalButtons proposalId={p.id} />
                </div>
              )}
              {current?.id === p.craftsman_id && p.status === "pending" && (
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
