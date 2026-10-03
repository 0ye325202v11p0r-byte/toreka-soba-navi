import Link from "next/link";
import { formatBudget } from "@/lib/budget";
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
import CloseRequestButton from "./CloseRequestButton";
import { MEASUREMENT_FIELDS, type RequestMeasurements } from "@/lib/measurements";
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

  // Visible only to the client and signed-in craftsmen (RLS on
  // request_measurements, Phase 33) — everyone else just gets no row.
  const { data: measurements } = await supabase
    .from("request_measurements")
    .select("height_cm, yuki_cm, hip_cm, bust_cm, waist_cm, build, note")
    .eq("request_id", id)
    .maybeSingle<RequestMeasurements>();

  const directedTo = request.directed_to;
  let directedName: string | null = null;
  if (directedTo) {
    const { data: target } = await supabase.from("profiles").select("display_name").eq("id", directedTo).maybeSingle();
    directedName = target?.display_name ?? null;
  }

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
        {request.status === "open" ? "募集中" : request.status === "matched" ? "マッチング済み" : "締め切り済み"}
      </p>
      <div className="mt-1">
        <StarRating rating={clientRating.average} count={clientRating.count} href={`/reviews/${request.client_id}`} />
      </div>
      {formatBudget(request.budget_min, request.budget_max) && (
        <p className="mt-2 text-sm font-semibold">予算: {formatBudget(request.budget_min, request.budget_max)}</p>
      )}
      {directedTo && (
        <p className="mt-2 rounded-md bg-link-soft px-3 py-2 text-sm text-ink">
          {directedName ?? "和裁士"}さんへの相談（この和裁士だけに届いています。掲示板には表示されません）
        </p>
      )}
      <p className="mt-4 whitespace-pre-wrap text-sm">{request.description}</p>
      {measurements && (
        <div className="mt-4 rounded-md border border-border bg-bg-elevated p-3 text-sm">
          <p className="font-semibold">寸法</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {MEASUREMENT_FIELDS.filter((f) => measurements[f.key] != null).map((f) => (
              <div key={f.key} className="flex gap-2">
                <dt className="text-ink-muted">{f.label}</dt>
                <dd>{measurements[f.key]}cm</dd>
              </div>
            ))}
            {measurements.build && (
              <div className="flex gap-2">
                <dt className="text-ink-muted">体型</dt>
                <dd>{measurements.build}</dd>
              </div>
            )}
          </dl>
          {measurements.note && <p className="mt-2 whitespace-pre-wrap text-ink-muted">{measurements.note}</p>}
          <p className="mt-2 text-xs text-ink-muted">寸法は、依頼者本人とログインした和裁士だけに表示されています。</p>
        </div>
      )}

      {isOwner && request.status === "open" && (
        <div className="mt-4">
          <CloseRequestButton requestId={request.id} />
          <p className="mt-1 text-xs text-ink-muted">
            頼む和裁士が決まらなかったときや、依頼をやめるときに押してください。掲示板に表示されなくなります。
          </p>
        </div>
      )}

      {order && (isOwner || current?.id) && (
        <p className="mt-4">
          <Link href={`/orders/${order.id}`} className="text-sm text-link underline">
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
                  <Link href={`/craftsmen/${p.craftsman_id}`} className="font-semibold text-ink hover:underline">
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
                <div className="mt-2 rounded-md bg-link-soft p-3">
                  <p className="text-sm font-semibold text-ink">
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
